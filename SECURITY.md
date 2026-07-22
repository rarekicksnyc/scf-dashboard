# Security & Parameters

This document is the security reference for the SCF Discounting Control Tower —
the access model, the controls already enforced in code, how data is handled, and
the checklist to harden it for a production bank deployment. It is written for a
reviewer or a new engineer taking handoff.

## At a glance

- **One controlled outbound call. No AI.** The only outbound request in the app
  is a market-data pull of the daily SOFR fixing from the official New York Fed
  public feed (`markets.newyorkfed.org`), triggered on demand from the Rate Sheet
  screen (`POST /api/rates/refresh-sofr`, `CHANGE_LIMIT`-gated + audited). It is
  outbound-only market data — **no financial or customer data is sent**, and no
  key is used. There is no LLM/AI SDK and no telemetry. Everything else runs
  locally against the in-memory store. Dependencies are `next`, `react`,
  `react-dom`, and `xlsx` (plus type packages). For an air-gapped deployment,
  block that host and use the manual COF/SOFR rate-sheet upload instead.
- **Deterministic engine.** Every eligibility, pricing, limit, and exposure figure
  is computed by pure functions over the store snapshot. Same inputs → same
  outputs; nothing is probabilistic.
- **Single source of truth.** Capacity is never stored — it is always derived
  (`available = approved − consumed`). Pricing has one implementation
  (`lib/pricing.ts`). Bank parameters have one home (`lib/config.ts`). This is a
  security property: there is no second copy of a rule to fall out of sync.

## Access model (enforced today)

- **Authentication** is per-user login: each user signs in with a password
  (scrypt-hashed, `lib/password.ts`) and receives an HMAC-signed session cookie
  (`lib/session.ts`, secret from `SESSION_SECRET`). The `middleware.ts` gate
  requires a valid session for every page and API route; forged/tampered cookies
  are rejected and unauthenticated users are sent to `/login`. `lib/auth.ts`
  remains the single facade every screen reads through — the seam a real SSO
  provider (SAML/OIDC via Azure AD) drops into. Demo users share `DEMO_PASSWORD`;
  replace with per-user credentials or SSO for production.
- **Role-based access control**: 7 roles × 7 permissions
  (`UPLOAD_BATCH`, `APPROVE_EXCEPTION`, `CHANGE_LIMIT`, `VIEW_REPORTS`,
  `VIEW_AUDIT`, `GENERATE_PAYMENT_FILE`, `MANAGE_ROLES`). The role→permission map
  and user assignments live in the store and are runtime-editable on `/access`
  (itself `MANAGE_ROLES`-gated), with a lockout guard so an Administrator can
  never remove its own Manage-roles right.
- **Server-side enforcement**: every API route and server page checks
  `currentUserCan(<permission>)` before acting or returning data — permission
  checks are not left to the UI. The report Excel endpoints, payment-file
  generation, limit edits, and role edits are all gated server-side.
- **Segregation of duties (maker-checker)**: exception approvals cannot be made by
  the user who submitted the batch. Approve → override → fund is a distinct,
  audited loop (`EXCEPTION_APPROVED` funds only on re-run).
- **Audit trail**: every state-changing action (uploads, approvals, limit
  changes, role changes, payment files) is written to the audit log, viewable on
  `/audit` under `VIEW_AUDIT`.

## Data handling

- **System of record** is the in-memory store (`lib/data/store.ts`), cached on
  `globalThis`, for fast synchronous reads. When `DATABASE_URL` is set it is
  loaded from Postgres on boot and auto-saved back on change
  (`lib/data/persistence.ts`) — the state persists as a single JSONB row. Run as
  a single instance (the cache is per-process). Without `DATABASE_URL` the app is
  in-memory only (local dev).
- **CDL** (8-digit customer booking code) is required on every limit and is the
  key exposure is booked against.
- **No secrets in the bundle.** There are no API keys, tokens, or credentials in
  the source or client bundle today. When SSO and host-to-host ingestion are
  added, secrets belong in server-only environment variables, never in `NEXT_PUBLIC_*`.

## Known items to resolve before production

- **`xlsx` (SheetJS) advisory**: the pinned version carries a prototype-pollution
  advisory. Upload parsing accepts third-party files, so before production either
  upgrade to a patched build or move parsing to a sandboxed/service boundary.
  Export-only use (our Excel downloads) does not process untrusted input.
- **Simulated auth**: replace the cookie switcher with real SSO (see `lib/auth.ts`).
- **Host-to-host ingestion** (`/api/ingest` stub) needs mTLS + per-counterparty
  rotated keys.
- **Payment rails**: the CSV payment file is a stand-in for pain.001 / Fedwire.

## Production hardening checklist

- [ ] Real SSO (SAML/OIDC), MFA, and session management replacing `lib/auth.ts`.
- [ ] Postgres with row-level access, encryption at rest, and backups behind the
      `store.ts` accessors.
- [ ] TLS everywhere; mTLS + rotated keys for host-to-host ingestion.
- [ ] Server-side input validation + rate limiting on every `POST`/`PATCH` route.
- [ ] Upgrade or sandbox `xlsx`; virus-scan uploaded files.
- [ ] Ship the audit log to an append-only / WORM store; alerting on limit and
      role changes.
- [ ] Secrets in a managed vault; no secrets in env files committed to git.
- [ ] Dependency scanning (`npm audit`) and pinned lockfile in CI.

## Bank parameters (`lib/config.ts`)

Portfolio-wide, tunable in one file. Per-customer parameters (approved limit, max
tenor, warn/exception thresholds, pricing floor, coverage %) live on the
individual limit/seller records and are edited on-screen.

| Parameter | Default | Meaning |
|---|---|---|
| `DAY_COUNT_BASIS` | 360 | Actual/360 accrual basis for discount & fee |
| `DEFAULT_MARGIN_BPS` | 200 | Fallback margin when an upload omits pricing |
| `MARGIN_INPUT_TO_BPS` | 100 | Pricing convention: 1.15 entered = 115 bps |
| `ADVANCE_RATE_MIN` | 0.00 | Accepted advance-rate floor (full 0–100% range) |
| `ADVANCE_RATE_MAX` | 1.00 | Accepted advance-rate ceiling |
| `ADVANCE_RATE_CAP` | FINAL 1.0 / PROVISIONAL 0.9 / PIPELINE 0.85 | Per-invoice-type cap; exceeding warns, does not fail |
