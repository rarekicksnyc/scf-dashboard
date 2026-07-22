// Node-only startup logic (imported by instrumentation.ts only in the Node
// runtime). Loads saved state from Postgres and auto-saves it when it changes.
// With DATABASE_URL unset, this is a no-op and the app runs purely in memory.

import { persistenceEnabled, initSchema, loadSnapshot, saveSnapshot } from "@/lib/data/persistence";
import { snapshotJson, hydrateStore } from "@/lib/data/store";

export async function startPersistence() {
  if (!persistenceEnabled()) return;

  await initSchema();
  const loaded = await loadSnapshot();
  if (loaded) {
    hydrateStore(loaded as Record<string, unknown>);
    console.log("[persistence] loaded state from Postgres");
  } else {
    await saveSnapshot(snapshotJson()); // first boot: persist the seeded state
    console.log("[persistence] seeded Postgres with initial state");
  }

  // Auto-persist: every few seconds, write the snapshot back if it changed.
  let last = snapshotJson();
  setInterval(async () => {
    try {
      const current = snapshotJson();
      if (current !== last) {
        await saveSnapshot(current);
        last = current;
      }
    } catch (err) {
      console.error("[persistence] autosave failed:", err);
    }
  }, 3000);
}
