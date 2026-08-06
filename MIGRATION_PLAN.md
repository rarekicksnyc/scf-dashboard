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
- [ ] Phase 2 — **cutover:** make tables authoritative + drop each collection from the snapshot — **after live‑DB staging verification** (use `GET /api/admin/db-status` to confirm `table === memory` per collection)
- [ ] Phase 6 — multi‑instance coherence (LISTEN/NOTIFY), remove the snapshot + single‑instance pin
- [ ] Phase 7 — hardening + load test

All write‑through is now **implemented and additive/dual‑source** — every store
collection persists per‑row alongside the snapshot. What remains is the **cutover**
(remove the snapshot safety net, make tables authoritative) and **multi‑instance
coherence**, both gated on verifying the live‑DB path on Neon staging via
`/api/admin/db-status`.

> **Gate before Phases 2/4/5/6:** the write‑through SQL (schema/upsert/load/backfill)
> runs for the first time only on a real database — it can't be exercised in the
> no‑`DATABASE_URL` dev/CI environment. Verify on Neon staging that the `coll_*` and
> `audit_entries` tables populate and reload correctly before making any table
> authoritative or dropping a collection from the snapshot. Phases 1 and 3 are
> **additive and dual‑source**, so they deploy with no risk to the running app even
> before that verification (a table failure is caught and the snapshot keeps working).
