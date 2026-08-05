# Pre‑Production Checklist — SCF Control Tower

Status legend: **P0** = hard blocker before any real exposure/PII touches the system · **P1** = required before general rollout · **P2** = fast‑follow / hardening.

Current architecture (baseline being hardened): Next.js 15 App Router on Render, single instance, an in‑memory `store` on `globalThis`, persisted as a whole‑object JSON snapshot to Neon Postgres (3s autosave + flush‑on‑SIGTERM), simulated cookie auth. The eligibility engines, four‑eyes governance, single‑source capacity, sublimits, domicile, and revenue math have been adversarially audited and are in good shape — this checklist is about the **platform/production layer around** that logic.

---

## 1. Persistence & data integrity — **the #1 blocker**

- [ ] **P0 — Replace the single‑instance in‑memory store as the system of record, OR guarantee single‑instance.**
  Today the entire dataset lives in `globalThis.__scfStore` and is snapshotted to one Neon JSONB row. Two Render instances (or a rolling deploy overlap) each hold their own copy and **diverge silently** — last writer's snapshot wins and the other instance's committed bookings are lost. Options, in order of preference:
  1. Migrate the store to real Postgres tables with row‑level writes + transactions (largest effort; the true production answer).
  2. Interim: **pin to exactly one instance** (Render: min=max=1 instance, no overlap on deploy) and document it as a hard constraint. This makes the current model *safe but not scalable*.
- [ ] **P0 — Confirm the snapshot flush survives every shutdown path.** `instrumentation-node.ts` flushes on `SIGTERM`/`SIGINT`/`beforeExit`; verify Render actually sends SIGTERM with a grace window ≥ the flush time, and that an OOM/`SIGKILL` path is understood (unflushable — bounded to ≤3s of loss).
- [ ] **P1 — Snapshot size + write cadence review.** A single growing JSON row is O(n) to serialize every 3s. Establish the row size ceiling at expected volume and move to per‑entity rows or an append log before it becomes a latency/cost problem.
- [ ] **P1 — Backups & point‑in‑time recovery.** Neon PITR enabled; documented restore runbook; periodic snapshot export to cold storage. Test a restore.
- [ ] **P1 — Schema/migration discipline.** The `runMigrations()` `once("<id>", …)` mechanism is good and idempotent — formalize it: every new field that the engine *reads* ships with a backfill migration (the seller‑domicile bug was a missing one), and migrations are code‑reviewed as data changes.
- [ ] **P2 — `store.seq` monotonicity is guarded** (seq‑floor migration) — keep the guard; add a boot assertion that `seq ≥ max(existing id suffix)`.

## 2. Authentication — **blocker**

- [ ] **P0 — Replace simulated cookie auth with SSO (Azure AD OIDC/SAML).** `lib/auth.ts`/`lib/session.ts` are explicitly MVP: the acting user is a signed cookie. Wire real IdP, map IdP groups → app roles, enforce session expiry/refresh.
- [ ] **P0 — `SESSION_SECRET` is mandatory in prod and rotated.** The app already refuses to boot in production without it (good) — ensure it's a strong secret in Render, rotated on a schedule, never in the repo.
- [ ] **P1 — Session hardening.** HttpOnly + Secure + SameSite cookies, absolute + idle timeout, server‑side session invalidation on logout, and a "log out everywhere" path.
- [ ] **P1 — MFA** enforced via the IdP for all users with any action permission.

## 3. Authorization (RBAC) — verify no gaps

- [ ] **P0 — Every mutating API route enforces a permission.** Audit each `POST`/`PATCH`/`DELETE` under `app/api/**` for a `roleHas(...)` / `roleHasPermission(...)` gate (the current audit round is checking this). No route may trust a client‑supplied `userId`/`role` — always derive from the session.
- [ ] **P0 — Four‑eyes is server‑enforced, not just UI.** Confirmed for limits/sublimits/booking exceptions; keep it as a standing test — the requester can never approve their own item.
- [ ] **P1 — IDOR sweep.** Any route taking an entity id must confirm the caller is authorized for *that* entity/program, not just authenticated.
- [ ] **P1 — Least privilege defaults.** Credit/Risk/RM start view‑only (done); document the intended permission matrix and review who can grant `MANAGE_ROLES`.
- [ ] **P2 — Segregation of duties** documented: who can create a limit vs approve it vs book against it.

## 4. Security

- [ ] **P0 — Secrets management.** `DATABASE_URL`, `SESSION_SECRET`, any API keys in Render env only; none in the repo; audit git history for leaks.
- [ ] **P1 — Output injection in generated artifacts.** CSV/XLSX exports must neutralize formula injection (cell starting with `= + @ -` / tab / CR); doc/email templates must escape user‑supplied fields (names, CDLs, references). *(This audit round is checking docgen + exports for exactly this.)*
- [ ] **P1 — Input validation & limits.** Max batch size / upload size caps; reject malformed CSV/XLSX gracefully; body size limits on API routes.
- [ ] **P1 — Security headers & TLS.** CSP, HSTS, X‑Content‑Type‑Options, Referrer‑Policy; TLS enforced end‑to‑end (Render + Neon).
- [ ] **P1 — Dependency & supply chain.** `npm audit` clean or triaged; lockfile pinned; Dependabot/Renovate; SBOM for the bank's review.
- [ ] **P2 — Rate limiting / abuse** on auth and ingestion endpoints.
- [ ] **P2 — PII/data classification.** Identify PII fields (names, contacts, CDLs); document retention & access; ensure exports/emails only carry what's needed.

## 5. Bank controls & compliance

- [ ] **P0 — Audit log is complete, immutable, and exportable.** Every state change (limit, approval, booking, collection, default, claim, role change, doc send) writes an audit entry with actor + timestamp + before/after. Confirm no mutating path skips `addAudit`; make the log tamper‑evident (append‑only / hash‑chained) for the bank.
- [ ] **P1 — Skim confidentiality is enforced end‑to‑end.** Investor‑facing artifacts (Schedule A, investor email, exports a counterparty can receive) never carry margin skim / insurer skim / true‑vs‑repriced margin. *(Audit round is checking this across docgen/exports/emails.)*
- [ ] **P1 — Four‑eyes evidence & reporting** for auditors: a report of every exception approved, by whom, with the breach reason and reference.
- [ ] **P1 — Data residency / enforceability** aligns with the domicile register (already engine‑checked) — confirm the register is signed off by legal.
- [ ] **P2 — Regulatory/finance reconciliation.** Revenue (margin + investor skim + insurer skim) and exposure tie out to the bank's GL/risk systems on a sample.

## 6. Observability & operations

- [ ] **P0 — Error monitoring** (Sentry or equivalent) capturing server exceptions with context; alert on 5xx and on persistence failures (`[persistence] … flush failed`).
- [ ] **P1 — Structured logging** with request ids and actor; log all authz denials.
- [ ] **P1 — Health & readiness endpoints;** uptime monitoring; alert if the snapshot autosave stops succeeding.
- [ ] **P1 — Runbooks:** deploy, rollback, restore‑from‑backup, "instance stuck", "snapshot corrupt".
- [ ] **P2 — Metrics dashboard:** batch throughput, eligibility decisions, exception rate, approval latency.

## 7. Integrations (currently drafts / stubs)

- [ ] **P1 — Email delivery.** Client/investor/booking/ops emails currently generate drafts/`.eml`. Wire a real provider (with the bank's approved sender/domain), delivery/bounce tracking, and confirm recipient routing (client contact vs investor vs loan‑ops) is correct.
- [ ] **P1 — Payment file.** Validate the generated payment file against the bank's real format/schema; confirm amount/currency/beneficiary correctness; add a maker‑checker gate before release. *(Audit round is checking payment‑file correctness.)*
- [ ] **P1 — SOFR / rate source.** `lib/sofr.ts` refresh is a stub — connect the authoritative rate feed, validate interpolation at curve edges, and stamp rate provenance/asOf on each priced deal.
- [ ] **P2 — Document repository** integration with the bank's DMS if required for retention.

## 8. Testing & CI

- [ ] **P0 — CI gate.** The 19 `scripts/test-*.ts` regression suites + `tsc --noEmit` + `next build` must run on every PR and block merge. Today they're run manually.
- [ ] **P1 — Coverage of the money paths** kept green: eligibility parity, four‑eyes, capacity single‑source, revenue reconciliation, sublimits, domicile — treat these as the non‑negotiable regression set.
- [ ] **P1 — End‑to‑end / browser tests** for the critical UI flows (batch → review → book; limit request → approve; reservation lifecycle).
- [ ] **P1 — Load/stress test** a realistic peak batch and concurrent editors; confirm no snapshot thrash, no lost updates, bounded latency.
- [ ] **P2 — Adversarial audit cadence.** Keep the multi‑agent find→verify→fix loop as a periodic gate (this is round 3).

## 9. Performance & scale

- [ ] **P1 — Establish the volume envelope** (sellers/obligors/limits/deals per day) and validate the in‑memory + snapshot model holds within it; define the number that forces the DB migration in §1.
- [ ] **P1 — Batch processing bounds:** max invoices per batch, timeout, and graceful partial‑failure handling.
- [ ] **P2 — Cold‑start / rehydrate time** from a full snapshot measured and acceptable.

## 10. Go‑live sign‑off gates

- [ ] All **P0** items closed and independently verified.
- [ ] Security review / pen test passed (or scheduled with compensating controls).
- [ ] Bank stakeholders sign off: Credit, Risk, Operations, Compliance, Technology.
- [ ] Runbooks rehearsed (deploy, rollback, restore).
- [ ] A documented, accepted statement of the current model's constraints (single‑instance, snapshot‑based) if the full DB migration is deferred.

---

### The honest one‑line summary
The **decision logic is bank‑grade and audited**; the gap to production is the **platform layer** — real persistence/concurrency (§1), SSO (§2), and the integration/observability/CI scaffolding (§6–8). Close the **P0** set and this moves from "excellent pilot" to "safe to run real exposure on a single, well‑monitored instance"; do §1.1 (true DB) to make it scale.
