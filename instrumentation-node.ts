// Node-only startup logic (imported by instrumentation.ts only in the Node
// runtime). Loads saved state from Postgres and auto-saves it when it changes.
// With DATABASE_URL unset, this is a no-op and the app runs purely in memory.

import { persistenceEnabled, initSchema, loadSnapshot, saveSnapshot } from "@/lib/data/persistence";
import { snapshotJson, hydrateStore, runMigrations, store } from "@/lib/data/store";
import { initDocSchema } from "@/lib/documents";
import { captureError } from "@/lib/observability";
import { initAuditSchema, auditTableCount, loadAuditEntries, backfillAuditEntries, flushAuditQueue } from "@/lib/data/repositories/auditRepo";
import { registerReferenceCollections } from "@/lib/data/collections";
import { initCollectionSchemas, loadCollections, flushCollections } from "@/lib/data/repositories/collectionRepo";

export async function startPersistence() {
  if (!persistenceEnabled()) return;

  await initSchema();
  await initDocSchema(); // document repository table (separate from the snapshot)
  const loaded = await loadSnapshot();
  if (loaded) {
    hydrateStore(loaded as Record<string, unknown>);
    runMigrations(); // apply one-time fixes to the persisted state
    await saveSnapshot(snapshotJson()); // persist any migration changes
    console.log("[persistence] loaded state from Postgres");
  } else {
    runMigrations();
    await saveSnapshot(snapshotJson()); // first boot: persist the seeded state
    console.log("[persistence] seeded Postgres with initial state");
  }

  // Phase 1 migration (MIGRATION_PLAN.md): the audit log has its own table. On
  // first run the table is empty but the snapshot may carry history — backfill it;
  // thereafter the table is the source of truth for reads on boot. Dual-source: the
  // snapshot still carries the log too (safety net) until Phase 2. Wrapped so an
  // audit-table failure never blocks boot.
  try {
    await initAuditSchema();
    if ((await auditTableCount()) === 0 && store.auditLog.length > 0) {
      await backfillAuditEntries(store.auditLog);
      console.log(`[persistence] backfilled ${store.auditLog.length} audit entries into audit_entries`);
    } else {
      const rows = await loadAuditEntries();
      if (rows.length > 0) store.auditLog = rows;
      console.log(`[persistence] loaded ${store.auditLog.length} audit entries from audit_entries`);
    }
  } catch (err) {
    captureError(err, { area: "audit-persistence", phase: "boot" });
  }

  // Phase 3 migration: reference/config collections get per-row tables. On first
  // run the tables are empty, so the snapshot-loaded data is kept and backfilled on
  // the first flush; thereafter the tables are the read source. Dual-source (the
  // snapshot still carries them) until a later phase. Wrapped so a table failure
  // never blocks boot.
  try {
    registerReferenceCollections();
    await initCollectionSchemas();
    await loadCollections();
    console.log("[persistence] reference collections initialized (write-through)");
  } catch (err) {
    captureError(err, { area: "collection-persistence", phase: "boot" });
  }

  // Auto-persist: every few seconds, write the snapshot back if it changed.
  let last = snapshotJson();
  const flush = async (reason: string) => {
    try {
      await flushAuditQueue(); // Phase 1: drain write-through audit inserts
      await flushCollections(); // Phase 3: persist changed reference/config records
      const current = snapshotJson();
      if (current !== last) {
        await saveSnapshot(current);
        last = current;
      }
    } catch (err) {
      captureError(err, { area: "persistence", reason }); // structured + alertable
    }
  };
  setInterval(() => { void flush("autosave"); }, 3000);

  // Durability on shutdown: a 3s poll alone would lose any committed booking /
  // collection / claim payout made in the gap before the next tick if the process
  // is stopped (Render redeploy → SIGTERM, then a grace period before SIGKILL).
  // Flush the latest snapshot, THEN exit, so an acknowledged ledger mutation always
  // survives a restart. Guarded so it runs once even if two signals arrive.
  let shuttingDown = false;
  const onShutdown = (sig: string) => async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[persistence] ${sig} — flushing snapshot before exit`);
    await flush(sig);
    process.exit(0);
  };
  process.once("SIGTERM", onShutdown("SIGTERM"));
  process.once("SIGINT", onShutdown("SIGINT"));
  process.once("beforeExit", () => { void flush("beforeExit"); }); // backstop for a clean event-loop drain
}
