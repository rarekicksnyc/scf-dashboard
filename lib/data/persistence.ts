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

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export function persistenceEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// One table, one row (id = 1) holding the entire state as JSONB.
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
}

// Read the saved snapshot, or null if nothing has been saved yet.
export async function loadSnapshot(): Promise<unknown | null> {
  const p = getPool();
  if (!p) return null;
  const res = await p.query("SELECT data FROM app_state WHERE id = 1");
  return res.rows[0]?.data ?? null;
}

// Upsert the single state row.
export async function saveSnapshot(json: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [json],
  );
}
