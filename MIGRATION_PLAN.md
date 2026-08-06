# Postgres Migration Plan (Option A — write‑through + in‑memory read cache)

**Goal:** make normalized Postgres tables the durable source of truth while keeping
the fast **synchronous** reads the eligibility engines depend on. The in‑memory
`store` becomes a read cache, loaded on boot and updated write‑through on every
mutation. This removes the fragile whole‑object JSON snapshot and unblocks
multi‑instance (with `LISTEN/NOTIFY` cache coherence in a later phase).

**Principles**
- The audited engine/governance logic does **not** change — migration happens
  *behind* the existing `store` API.
- **Dual‑write during cutover:** while a domain is migrating, write both the new
  table and the old snapshot, read the new table on boot, keep the snapshot as a
  safety net. Drop the snapshot for that domain only after it's proven in staging.
- Local dev / tests (no `DATABASE_URL`) keep the pure in‑memory behavior — every
  repository is a no‑op without a pool.
- Every phase is independently shippable, tested, and reversible.

## Phases

**Phase 1 — Audit log (this phase).** Append‑only, isolated (`addAudit` is the sole
writer), and the largest unbounded array — the ideal first domain. New
`audit_entries` table; write‑through append (queued, flushed by the existing loop +
SIGTERM); boot‑load from the table (backfilled from the snapshot on first run);
snapshot retained as a safety net (dual‑source). Proves the pattern end‑to‑end.

**Phase 2 — Finish audit cutover.** Make the table authoritative; exclude the audit
log from the whole snapshot; synchronous‑durable append for the tamper‑evident log.

**Phase 3 — Reference/config domains.** Sellers, obligors, entities, countries,
programs, doc templates, roles/permissions — low write volume, mostly setup. One
table per aggregate; write‑through in the existing `add*/update*/remove*` funcs.

**Phase 4 — Limits & utilizations.** The capacity spine. Tables for `limits`,
`utilizations`, `seller_obligor_limits` (+ approvals/pendingEdits). Highest care:
capacity is derived, never stored, so only the inputs (approved amounts,
consumption events) persist.

**Phase 5 — Transactional ledger.** `booked_transactions` (+ collections, claims,
lifecycle), `reservations`, `batches`. The exposure source of truth.

**Phase 6 — Multi‑instance coherence.** Postgres `LISTEN/NOTIFY` (or short‑poll of a
`generation` per table): when one instance writes, others refresh the affected
cache slice. Remove the single‑instance pin. Drop the whole‑object snapshot.

**Phase 7 — Hardening.** Connection‑pool tuning, migration/versioning discipline
(a real migrations table), backfill verification, load test at expected volume.

## Status
- [x] Phase 1 — audit log write‑through (dual‑source, snapshot safety net)
- [x] Phase 3 — reference/config domains (20 collections; dual‑source)
- [x] Phase 4 — limits & utilizations write‑through (limits, seller‑obligor limits, rates, utilizations map; dual‑source)
- [x] Phase 5 — transactional ledger write‑through (booked transactions, batches, reservations, workflows, exceptions, notifications; dual‑source)
- [x] Phase 2 — **cutover implemented, flag‑gated.** With `PERSISTENCE_AUTHORITATIVE=1` the per‑row tables are the source of truth and the snapshot shrinks to a small `meta` blob (settings/roles/counters); the last full snapshot **freezes as a recoverable backup**, and boot **falls back** to it for any table that isn't populated. Default OFF = today's dual‑source. **Flip the env var on Render only after `/api/admin/db-status` shows `table === memory` for every collection.**
- [ ] Phase 6 — multi‑instance coherence (LISTEN/NOTIFY) + lift the single‑instance pin — **deferred: needs real multi‑instance testing.** Single‑instance is safe now (divergence detection works in both modes).
- [ ] Phase 7 — hardening + load test

**State:** every collection persists per‑row; the cutover to table‑authoritative is
implemented and reversible behind one env flag; `/api/admin/db-status` reports the
mode + per‑collection `table` vs `memory` counts. Enabling the flag is the operational
"gate" — safe because the frozen snapshot + fallback mean a premature flip can't lose
data. The only genuinely remaining piece is **multi‑instance** (Phase 6), which
requires horizontal‑scaling tests; until then, run **one** instance (already safe).

## How to activate the cutover (operator steps)
1. Deploy is running in dual‑source (default). Let it run so every `coll_*` table
   and `audit_entries` fully populates.
2. As a Portfolio Manager/Admin, open `GET /api/admin/db-status`. Confirm every
   collection shows `table === memory` and `audit.chainIntact === true`.
3. Set `PERSISTENCE_AUTHORITATIVE=1` in the Render environment and redeploy.
4. Re‑check `/api/admin/db-status`: `persistence.authoritative` should be `true`,
   mode "tables authoritative". The snapshot now stops growing with the ledger.
5. To roll back, unset the env var and redeploy — it returns to dual‑source. The
   frozen `data` backup plus the live tables mean no data is lost either way.

> **Gate before Phases 2/4/5/6:** the write‑through SQL (schema/upsert/load/backfill)
> runs for the first time only on a real database — it can't be exercised in the
> no‑`DATABASE_URL` dev/CI environment. Verify on Neon staging that the `coll_*` and
> `audit_entries` tables populate and reload correctly before making any table
> authoritative or dropping a collection from the snapshot. Phases 1 and 3 are
> **additive and dual‑source**, so they deploy with no risk to the running app even
> before that verification (a table failure is caught and the snapshot keeps working).
