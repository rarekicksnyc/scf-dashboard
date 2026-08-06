// Phase 1 (Postgres migration) — audit-log write-through. Verifies the NO-DB path
// (local/CI/tests): the repository is fully inert without DATABASE_URL, so the
// audit log behaves exactly as the pure in-memory implementation. The live-DB
// path (insert/backfill/load) is verified in staging against Neon.
import { store, addAudit, getAuditLog } from "@/lib/data/store";
import { enqueueAudit, flushAuditQueue, pendingAuditCount, loadAuditEntries, auditTableCount, initAuditSchema } from "@/lib/data/repositories/auditRepo";
import { persistenceEnabled } from "@/lib/data/persistence";
import { diffCollection, initCollectionSchemas, loadCollections, flushCollections, registeredCollectionNames } from "@/lib/data/repositories/collectionRepo";
import { registerReferenceCollections } from "@/lib/data/collections";

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
  const names = registeredCollectionNames();
  ok("reference collections registered", names.includes("sellers") && names.includes("obligors") && names.includes("countries"));
  registerReferenceCollections();
  ok("registration is idempotent (no duplicate names)", new Set(names).size === names.length);

  await initCollectionSchemas();
  await loadCollections();
  await flushCollections();
  ok("collection repo is a safe no-op without a DB", true);

  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  if (fail) process.exit(1);
}

main();
