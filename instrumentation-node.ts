// Node-only startup logic (imported by instrumentation.ts only in the Node
// runtime). Loads saved state from Postgres and auto-saves it when it changes.
// With DATABASE_URL unset, this is a no-op and the app runs purely in memory.

import { persistenceEnabled, initSchema, loadSnapshot, saveSnapshot } from "@/lib/data/persistence";
import { snapshotJson, hydrateStore, runMigrations } from "@/lib/data/store";
import { initDocSchema } from "@/lib/documents";

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

  // Auto-persist: every few seconds, write the snapshot back if it changed.
  let last = snapshotJson();
  const flush = async (reason: string) => {
    try {
      const current = snapshotJson();
      if (current !== last) {
        await saveSnapshot(current);
        last = current;
      }
    } catch (err) {
      console.error(`[persistence] ${reason} flush failed:`, err);
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
