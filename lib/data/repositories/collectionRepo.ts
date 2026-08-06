import { getPool } from "@/lib/data/persistence";

// ---------------------------------------------------------------------------
// Generic write-through for store collections (MIGRATION_PLAN.md Phases 3-5).
//
// Each registered collection gets its own `coll_<name>` table with one JSONB row
// per record. On boot the table (if populated) becomes the read source; otherwise
// the current in-memory (snapshot-loaded) data is kept and backfilled on the first
// flush. The flush loop diffs the current records against a shadow of what was last
// written and upserts/deletes only what changed — so we get per-record persistence
// without editing every mutation function, and the audited engine logic is untouched.
//
// DUAL-SOURCE during migration: the whole-object snapshot still carries these
// collections too (safety net) until a later phase drops them. No DATABASE_URL =>
// every function is a no-op (pure in-memory, unchanged for dev/tests).
// ---------------------------------------------------------------------------

export interface CollectionSpec<T = Record<string, unknown>> {
  name: string; // table suffix; must be [a-z_]+
  keyOf: (r: T) => string; // stable per-record key (id / composite)
  get: () => T[]; // current records from the store
  set: (rows: T[]) => void; // replace the store's array from loaded rows
}

const specs: CollectionSpec[] = [];
const shadows = new Map<string, Map<string, string>>();

export function registerCollection<T extends object>(spec: CollectionSpec<T>): void {
  if (!/^[a-z_]+$/.test(spec.name)) throw new Error(`Invalid collection name "${spec.name}".`);
  if (specs.some((s) => s.name === spec.name)) return; // idempotent registration
  specs.push(spec as CollectionSpec);
}

export function registeredCollectionNames(): string[] {
  return specs.map((s) => s.name);
}

// Pure diff — the testable core. Returns which ids to upsert (new/changed) and
// which to delete (present last time, gone now).
export function diffCollection(shadow: Map<string, string>, current: Map<string, string>): { upserts: string[]; deletes: string[] } {
  const upserts: string[] = [];
  const deletes: string[] = [];
  for (const [id, json] of current) if (shadow.get(id) !== json) upserts.push(id);
  for (const id of shadow.keys()) if (!current.has(id)) deletes.push(id);
  return { upserts, deletes };
}

export async function initCollectionSchemas(): Promise<void> {
  const p = getPool();
  if (!p) return;
  for (const s of specs) {
    await p.query(`CREATE TABLE IF NOT EXISTS coll_${s.name} (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  }
}

// Boot: for each collection, if its table has rows, load them as the read source;
// otherwise keep the current (snapshot) data and seed an empty shadow so the first
// flush backfills the table.
export async function loadCollections(): Promise<void> {
  const p = getPool();
  if (!p) return;
  for (const s of specs) {
    const res = await p.query(`SELECT data FROM coll_${s.name}`);
    if (res.rows.length > 0) {
      const rows = res.rows.map((r) => r.data as Record<string, unknown>);
      s.set(rows);
      shadows.set(s.name, new Map(rows.map((r) => [s.keyOf(r), JSON.stringify(r)])));
    } else {
      shadows.set(s.name, new Map());
    }
  }
}

// Persist only what changed since the last flush.
export async function flushCollections(): Promise<void> {
  const p = getPool();
  if (!p) return;
  for (const s of specs) {
    const shadow = shadows.get(s.name) ?? new Map<string, string>();
    const current = new Map<string, string>();
    for (const r of s.get()) current.set(s.keyOf(r), JSON.stringify(r));
    const { upserts, deletes } = diffCollection(shadow, current);
    for (const id of upserts) {
      await p.query(
        `INSERT INTO coll_${s.name} (id, data, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [id, current.get(id)],
      );
    }
    for (const id of deletes) await p.query(`DELETE FROM coll_${s.name} WHERE id = $1`, [id]);
    shadows.set(s.name, current);
  }
}
