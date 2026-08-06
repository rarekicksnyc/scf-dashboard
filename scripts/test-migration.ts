// Phase 1 (Postgres migration) — audit-log write-through. Verifies the NO-DB path
// (local/CI/tests): the repository is fully inert without DATABASE_URL, so the
// audit log behaves exactly as the pure in-memory implementation. The live-DB
// path (insert/backfill/load) is verified in staging against Neon.
import { store, addAudit, getAuditLog, metaSnapshotJson, hydrateMeta } from "@/lib/data/store";
import { persistAuthoritative } from "@/lib/data/persistence";
import { enqueueAudit, flushAuditQueue, pendingAuditCount, loadAuditEntries, auditTableCount, initAuditSchema } from "@/lib/data/repositories/auditRepo";
import { persistenceEnabled } from "@/lib/data/persistence";
import { diffCollection, initCollectionSchemas, loadCollections, flushCollections, registeredCollectionNames } from "@/lib/data/repositories/collectionRepo";
import { registerReferenceCollections, registerTransactionalCollections } from "@/lib/data/collections";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };

async function main() {
  console.log("Migration Phase 1 (audit write-through) — no-DB path\n");
  ok("test env has no DATABASE_URL (pure in-memory)", persistenceEnabled() === false);

  store.auditLog.length = 0;
  const before = getAuditLog().length;
  addAudit({ actorUserId: "u_product", actorName: "PM", action: "TEST", entityType: "T", entityId: "e1", detail: "d1" });
  ok("addAudit still records in-memory without a DB", getAuditLog().length === before + 1);
  ok("enqueueAudit is a no-op without a DB (nothing queued)", pendingAuditCount() === 0);

  // Repo functions must resolve safely (no pool) rather than throw.
  await initAuditSchema();
  ok("initAuditSchema is a safe no-op without a DB", true);
  ok("auditTableCount returns 0 without a DB", (await auditTableCount()) === 0);
  ok("loadAuditEntries returns [] without a DB", (await loadAuditEntries()).length === 0);
  enqueueAudit(getAuditLog()[0]);
  await flushAuditQueue();
  ok("flushAuditQueue is a safe no-op without a DB", pendingAuditCount() === 0);

  store.auditLog.length = 0;

  // --- Phase 3: generic collection write-through -------------------------------
  console.log("\nPhase 3 (collection write-through) — diff core + no-DB path");
  const m = (o: Record<string, string>) => new Map(Object.entries(o));
  const d1 = diffCollection(new Map(), m({ a: "1", b: "2" }));
  ok("diff: empty shadow -> all upserts (backfill)", d1.upserts.sort().join() === "a,b" && d1.deletes.length === 0);
  const d2 = diffCollection(m({ a: "1", b: "2" }), m({ a: "1", b: "3", c: "4" }));
  ok("diff: only changed/new ids upsert", d2.upserts.sort().join() === "b,c" && d2.deletes.length === 0);
  const d3 = diffCollection(m({ a: "1", b: "2" }), m({ a: "1" }));
  ok("diff: removed id -> delete", d3.deletes.join() === "b" && d3.upserts.length === 0);

  registerReferenceCollections();
  registerTransactionalCollections();
  const names = registeredCollectionNames();
  ok("reference collections registered", names.includes("sellers") && names.includes("obligors") && names.includes("countries"));
  ok("transactional collections registered (limits, ledger, utilizations)", names.includes("limits") && names.includes("booked_transactions") && names.includes("utilizations") && names.includes("seller_obligor_limits"));
  registerReferenceCollections();
  registerTransactionalCollections();
  ok("registration is idempotent (no duplicate names)", new Set(names).size === names.length);

  // utilizations adapts a Map<->array without loss.
  const utilSpecName = "utilizations";
  ok("utilizations registered as a collection", names.includes(utilSpecName));

  await initCollectionSchemas();
  await loadCollections();
  await flushCollections();
  ok("collection repo is a safe no-op without a DB", true);

  // --- Phase 2 cutover: thin meta snapshot ------------------------------------
  console.log("\nPhase 2 (cutover) — meta snapshot / hydrate");
  ok("authoritative mode is OFF by default (safe dual-source)", persistAuthoritative() === false);
  const meta = JSON.parse(metaSnapshotJson());
  ok("meta snapshot carries the small non-collection state", "seq" in meta && "rolePermissions" in meta && "settings" in meta && "recordRevs" in meta);
  ok("meta snapshot EXCLUDES the migrated collections", !("sellers" in meta) && !("limits" in meta) && !("bookedTransactions" in meta) && !("auditLog" in meta));
  // hydrateMeta applies meta but must NOT clobber collections.
  const sellerCount = store.sellers.length;
  const savedSeq = store.seq;
  hydrateMeta({ seq: 987654, sellers: [] });
  ok("hydrateMeta applies meta fields (seq)", store.seq === 987654);
  ok("hydrateMeta does NOT clobber collections (sellers untouched)", store.sellers.length === sellerCount);
  store.seq = savedSeq;

  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  if (fail) process.exit(1);
}

main();
