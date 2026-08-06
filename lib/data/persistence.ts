import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Durable storage for the in-memory store (Phase 2).
//
// The whole application state is kept in memory (lib/data/store.ts) so every
// read and the eligibility engine stay synchronous and simple. This module is
// the ONLY place that talks to Postgres: it loads that state on boot and writes
// it back when it changes. State is stored as a single JSON snapshot in one row.
//
// When DATABASE_URL is not set (local development), every function here is a
// no-op and the app runs purely in memory — nothing to configure locally.
// ---------------------------------------------------------------------------

let pool: Pool | null = null;

// Shared connection pool (also used by the document repository, lib/documents.ts).
export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export function persistenceEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// --- Health + single-instance divergence detection -------------------------
// The whole-store snapshot model is safe ONLY on a single instance; two writers
// silently diverge (last-writer-wins). We can't prevent that here, but we CAN
// detect it: a monotonic `generation` column is bumped on every save; if it jumps
// by more than one between our own writes, another instance wrote in between.
let _lastError: string | null = null;
let _lastAt: string | null = null;
let _lastWrittenGen: number | null = null;
let _divergence: string | null = null;

export function lastPersistError(): string | null {
  return _divergence ?? _lastError;
}
export function lastPersistAt(): string | null {
  return _lastAt;
}

// One table, one row (id = 1) holding the entire state as JSONB, plus a monotonic
// generation used for concurrent-writer detection.
export async function initSchema(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `CREATE TABLE IF NOT EXISTS app_state (
       id         integer PRIMARY KEY,
       data       jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await p.query(`ALTER TABLE app_state ADD COLUMN IF NOT EXISTS generation bigint NOT NULL DEFAULT 0`);
}

// Read the saved snapshot, or null if nothing has been saved yet.
export async function loadSnapshot(): Promise<unknown | null> {
  const p = getPool();
  if (!p) return null;
  const res = await p.query("SELECT data FROM app_state WHERE id = 1");
  return res.rows[0]?.data ?? null;
}

// Upsert the single state row, bumping the generation. Records health and warns
// if another instance wrote the snapshot since our last save (data-divergence
// risk — the model must run on exactly one instance).
export async function saveSnapshot(json: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    const res = await p.query(
      `INSERT INTO app_state (id, data, updated_at, generation) VALUES (1, $1, now(), 1)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now(),
         generation = app_state.generation + 1
       RETURNING generation`,
      [json],
    );
    const newGen = Number(res.rows[0]?.generation ?? 0);
    if (_lastWrittenGen !== null && newGen !== _lastWrittenGen + 1) {
      _divergence = `Snapshot generation jumped ${_lastWrittenGen} -> ${newGen}: another instance is writing state. The whole-store snapshot model must run on exactly ONE instance — pin instances to 1 or migrate to a per-row store.`;
      console.error("[persistence] DIVERGENCE:", _divergence);
    }
    _lastWrittenGen = newGen;
    _lastAt = new Date().toISOString();
    _lastError = null;
  } catch (e) {
    _lastError = (e as Error).message;
    throw e;
  }
}
