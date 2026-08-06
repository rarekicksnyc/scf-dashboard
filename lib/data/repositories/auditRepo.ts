import { getPool, persistenceEnabled } from "@/lib/data/persistence";
import { captureError } from "@/lib/observability";
import type { AuditEntry } from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase 1 of the Postgres migration (MIGRATION_PLAN.md): the audit log moves to
// a dedicated append-only table with write-through. The in-memory array stays as
// the read cache (synchronous reads); this module owns the durable table.
//
// Write path: addAudit() enqueues the entry (sync); the existing persistence loop
// (+ SIGTERM flush) drains the queue into the table. Same durability profile as
// the snapshot (<=3s + shutdown flush), but per-record and in a real table.
//
// No DATABASE_URL (local/tests) => every function is a no-op and the audit log is
// purely in-memory, exactly as before.
// ---------------------------------------------------------------------------

const pending: AuditEntry[] = [];

export async function initAuditSchema(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `CREATE TABLE IF NOT EXISTS audit_entries (
       seq           bigserial PRIMARY KEY,
       id            text NOT NULL,
       ts            timestamptz NOT NULL,
       actor_user_id text NOT NULL,
       actor_name    text NOT NULL,
       action        text NOT NULL,
       entity_type   text NOT NULL,
       entity_id     text NOT NULL,
       detail        text NOT NULL,
       prev_hash     text,
       hash          text
     )`,
  );
}

export async function auditTableCount(): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  const res = await p.query("SELECT count(*)::int AS n FROM audit_entries");
  return res.rows[0]?.n ?? 0;
}

function rowToEntry(r: Record<string, unknown>): AuditEntry {
  return {
    id: String(r.id),
    timestamp: new Date(r.ts as string).toISOString(),
    actorUserId: String(r.actor_user_id),
    actorName: String(r.actor_name),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    detail: String(r.detail),
    prevHash: r.prev_hash == null ? undefined : String(r.prev_hash),
    hash: r.hash == null ? undefined : String(r.hash),
  };
}

// Load all entries newest-first (matching the in-memory ordering).
export async function loadAuditEntries(): Promise<AuditEntry[]> {
  const p = getPool();
  if (!p) return [];
  const res = await p.query("SELECT * FROM audit_entries ORDER BY seq DESC");
  return res.rows.map(rowToEntry);
}

async function insertRows(entries: AuditEntry[]): Promise<void> {
  const p = getPool();
  if (!p || entries.length === 0) return;
  for (const e of entries) {
    await p.query(
      `INSERT INTO audit_entries (id, ts, actor_user_id, actor_name, action, entity_type, entity_id, detail, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [e.id, e.timestamp, e.actorUserId, e.actorName, e.action, e.entityType, e.entityId, e.detail, e.prevHash ?? null, e.hash ?? null],
    );
  }
}

// One-time backfill: seed the table from the in-memory log (oldest first, so the
// table's seq order matches chronology). Used when the table is empty but a
// pre-migration snapshot already carries history.
export async function backfillAuditEntries(newestFirst: AuditEntry[]): Promise<void> {
  await insertRows([...newestFirst].reverse());
}

// Sync enqueue from addAudit. No-op without a DB (pure in-memory mode).
export function enqueueAudit(entry: AuditEntry): void {
  if (!persistenceEnabled()) return;
  pending.push(entry);
}

// Drain the queue into the table. Called by the persistence flush loop + SIGTERM.
// On failure the entries are put back so the next flush retries (no silent loss).
export async function flushAuditQueue(): Promise<void> {
  if (!persistenceEnabled() || pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  try {
    await insertRows(batch);
  } catch (err) {
    pending.unshift(...batch); // retry next tick
    captureError(err, { area: "audit-persistence", pending: pending.length });
  }
}

export function pendingAuditCount(): number {
  return pending.length;
}
