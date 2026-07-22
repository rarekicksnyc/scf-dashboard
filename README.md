# SCF Discounting Control Tower

A bank-facing dashboard for **seller-led supply chain finance discounting**. The
core is a rules-driven eligibility, limit, and funding engine: upload a batch of
invoices, and every invoice is checked against seller, **ASR (Asset
Securitization)**, obligor, swingline, and max-tenor limits before funding — with
cumulative batch consumption so invoice #400 sees the capacity #1–399 already
used — then eligible invoices are allocated across investors, bank hold, and
credit insurance.

Self-contained Next.js + TypeScript app with seeded demo bank data and an
in-memory system of record. No database or Python backend to run.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Batches → Load sample batch → Run eligibility**.
The sample is engineered to exercise every control:

- **ASR binds before seller** — SELLER001 has ~$50MM of seller headroom but only
  ~$21MM of ASR headroom, so the OBL001 block passes the seller limit and the
  fifth invoice breaches ASR (ASR ends at 100%, seller at 71%).
- **Obligor concentration** — OBL003 runs out of headroom → exception.
- **Tenor breach** — a 120-day invoice against OBL003's 90-day obligor tenor.
- **Watchlist obligor** — OBL004 routes to exception.
- **Currency mismatch** and **duplicate invoice** → hard reject.
- **Funding allocation** — the OBL001 invoices are taken out by an investor
  (Meridian Capital Partners); INV-1011 (OBL003) has no eligible investor, so it
  is bank-held with 90% credit insurance (Atradius) and a 10% uninsured residual.

## Two different "ASR" concepts (both modeled)

- **ASR limit = Asset Securitization limit** — a manually-input monetary limit,
  checked exactly like a seller or obligor limit (`LimitType = "ASR"`).
- **ASR rating** — a distinct internal **seller** risk grade, scale
  `1, 2, 3, 4A, 4B, 4C, 5-1, 5-2, 6-1, 6-2, 7-1` (best → worst). Shown on the
  seller (limits page, batch header); it is a classification, not a monetary
  control.

## Architecture (code map for a handoff)

Next.js 15 App Router + TypeScript + React. Business logic and shared helpers
live in `lib/`; screens and API route handlers live in `app/`. The guiding rule
is **single source of truth** — each fact and each rule is defined once and read
everywhere. Start reading in this order:

**Data & state**
- `lib/types.ts` — the one definition of every entity (sellers, obligors, limits,
  reservations, users, …). Read this first.
- `lib/data/store.ts` — the in-memory system of record, cached on `globalThis`.
  Every read/write goes through named accessors here (no raw globals), so it is
  the single seam the rest of the app depends on. Availability is **never stored**
  — `viewLimit()` derives it (`approved − consumed`) every time.
- `lib/data/seed.ts` — the seeded demo bank (used on first boot / local dev).
- `lib/data/persistence.ts` + `instrumentation-node.ts` — optional Postgres
  durability: on boot the store is loaded from Postgres and auto-saved on change
  (only when `DATABASE_URL` is set). Files (documents) use their own table via
  `lib/documents.ts`. See [`DEPLOY.md`](DEPLOY.md) / [`SECURITY.md`](SECURITY.md).
- `lib/config.ts` — **every tunable, portfolio-wide bank parameter** (day-count
  basis, default margin, advance-rate band, per-invoice-type caps) in one place.
  Per-customer parameters (limit, tenor, thresholds) live on the individual store
  records and are edited on the Data Management screen.

**The engine (eligibility, pricing, exposure)**
- `lib/engine/eligibility.ts` — `checkDiscount(txn)`: the interactive engine that
  runs ONE transaction against every control (seller, obligor, ASR, swingline,
  RRL, transaction terms, distribution, insurance) and returns a categorized
  report. This is what the Eligibility Check and reservation screens call.
- `lib/engine/index.ts` — the batch engine: runs a whole uploaded invoice batch,
  consuming a working limit snapshot sequentially so invoice #400 sees the
  capacity #1–399 already used.
- `lib/engine/availability.ts` — `toLimitView()`, **the** availability formula
  both engines derive capacity from.
- `lib/engine/allocation.ts` — funding planner (investor takeout → bank hold →
  insurance overlay).
- `lib/engine/obligorEntity.ts` — the obligor legal-entity rules, shared by both
  engines so the multi-entity checks are defined once.
- `lib/pricing.ts` — the one `priceDeal()` (DTR discount / UTRC fee), so pricing
  can never diverge between the interactive and batch paths.
- `lib/exposure.ts` — per-name exposure rows (seller/obligor lines + swinglines +
  RRL) built from the store's reservation-aware limit views; feeds the Portfolio
  and Reports screens.

**Shared helpers (defined once, imported everywhere)**
- `lib/format.ts` — display + small pure helpers: `mm`/`usd`/`pct`/`dateShort`,
  `daysBetween`, `expired`, `mm2` (the engine's 2-decimal millions), and
  `blockingChecks()` (the one place that defines the RED/ORANGE "does not clear"
  rule), plus the label maps (`LIMIT_LABEL`, …).
- `lib/ui.ts` — shared input styling (`inputBase`, `inputCompact`, `fieldLabel`,
  `cellInput`) + `clampPct` / `coverageAmount`, so every form looks and behaves
  the same.

**App (screens + API)**
- `app/layout.tsx` — the nav and the login gate; `middleware.ts` enforces the
  session on every request (see [`SECURITY.md`](SECURITY.md)).
- Screens: Portfolio (`app/page.tsx`), Eligibility check, Batches, **Data
  management** (the control center — add/edit sellers, obligors, limits, entities,
  the full limit register, and swingline adjustments; the old Setup / Limit
  Register tabs redirect here), Documents, Rate sheet, Reservations, Schedule,
  Exceptions, Monitoring, Reports, Audit log, Roles & access.
- `app/api/**/route.ts` — the HTTP endpoints each screen calls; all
  permission-gated through `lib/auth.ts` and audited into the store.

**Security & parameters:** see [`SECURITY.md`](SECURITY.md) for the access model,
audit/segregation controls, data handling, the one-controlled-outbound-call /
no-AI stance, and the production hardening checklist.

## What's built

**Phase 1 — data + rules foundation** ✓ sellers, obligors, programs, limits,
invoices, eligibility results; core checks (seller status, obligor status,
duplicate, currency, seller / ASR / obligor limits, max tenor).

**Phase 2 — batch discounting** ✓ CSV upload + parser, batch summary,
invoice-level pass/fail, batch-level cumulative limit consumption, exportable
exception report (CSV), re-run eligibility.

**Phase 3 — funding controls** ✓ swingline limit (on the bank-held portion),
investor capacity + eligibility (obligor/currency/tenor/ticket), insurance-backed
discounting (coverage % → insured amount + uninsured residual), funding
allocation engine, basic pricing (discount fee / net proceeds), settlement status.

**Phase 4 — bank-grade controls** ✓ role-based access (7 roles / 6 permissions,
`lib/auth.ts`) · maker-checker exception approvals with segregation of duties (a
checker cannot approve a batch they submitted) · approval → override → fund loop
(approved exceptions fund on re-run as `EXCEPTION_APPROVED`) · audit log of every
state-changing action · legal-document completeness check · reporting module (ASR
utilization, obligor exposure, limit utilization, exception approvals, audit —
all CSV) · permission-gated payment/settlement file generation · API-key-gated
host-to-host ingestion stub (`POST /api/ingest`).

### Roles → permissions

| Role | Upload | Approve exc. | Change limit | Reports | Audit | Payment file |
|---|---|---|---|---|---|---|
| Operations | ✓ | | | ✓ | ✓ | ✓ |
| Credit Officer | | ✓ | ✓ | ✓ | ✓ | |
| Product Manager | ✓ | ✓ | | ✓ | ✓ | |
| Risk Manager | | ✓ | ✓ | ✓ | ✓ | |
| Relationship Manager | ✓ | | | ✓ | | |
| Administrator | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Viewer | | | | ✓ | ✓ | |

Use the **Acting as** switcher in the sidebar (stands in for SSO) to try the
maker-checker flow: upload as Operations → open **Exceptions** → switch to Credit
Officer to approve → back to Operations → **Re-run eligibility** on the batch and
the approved exception funds.

**Phase 5 — exposure, reservations & schedule** ✓ the **Portfolio home** is the
Sellers/Obligors exposure view — filterable tabs (name · CDL · limit · swingline
· outstanding · future reservation · available · utilization), with the full
limit register (ASR/investor/insurance) moved to the Limit Register page · **CDL** customer booking code per entity · **per-entity swingline**
limits, optional and toggled on the Setup screen · a **reservation framework**
that forward-books future discounts marked against BOTH seller and obligor (and
both swinglines) · reservations folded into the **same availability formula** the
batch engine uses, so future expected exposure reduces the capacity batch
eligibility sees · reservation eligibility check (seller / obligor / swingline /
tenor) that blocks breaches · a **Setup** screen to add new
limits/entities to the register (new limit of any type, new seller, new obligor,
ASR approved-obligor sublimit), assign CDL, edit limits, and toggle swingline
(all gated by CHANGE_LIMIT and audited) · a **Schedule** calendar of fundings,
swingline draws, and expected repayments by month.

### Exposure model (single source)

`consumed = outstanding + reserved`, `available = approved − consumed`, computed
once in `lib/engine/availability.ts`. `outstanding` is the current booked book
(utilization); `reserved` is the sum of active reservations booked against that
limit (`store.reservationConsumedForLimit`). ASR is consumed at actual
discounting (batches), not by forward reservations, matching the exposure-tab
columns.

**Phase 6 — consolidated eligibility check** ✓ a single screen (`/eligibility`)
that runs one discount transaction against **every** seller-facility and
transaction control at once, grouped into Seller / Obligor / ASR / Transaction /
Distribution / Insurance, with a decision banner and per-check pass/warn/fail:

- **Seller facility**: eligible, credit limit + expiry, borrower rating + expiry,
  ASR rating + expiry, seller max tenor, seller swingline (if drawn), **RRL**
  (Risk Reimbursement Line — only counted when toggled on), minimum pricing,
  guarantor, GCARS #.
- **Obligor**: eligible, obligor guarantee + guarantee eligibility, **master
  limit** (aggregate line shown on the obligor dashboard), max tenor, obligor
  swingline (if drawn).
- **ASR**: obligor is on the seller's **ASR approved list**, and the **per-seller
  ASR obligor sublimit** — checked against BOTH the master line and the sublimit,
  tightest binds (the Valero $200M-vs-$50M case; here OBL001 is $40M master / $30M
  under SELLER001 / $15M under SELLER002).
- **Transaction**: advance rate is enterable **0–100%** (typical band 85–100%);
  advance vs invoice-type (FINAL/PROVISIONAL/PIPELINE) cap — **warns, doesn't
  fail**, when the business line prices above for return. **Coverage amount =
  invoice × advance rate** is shown live as a read-only field and is what consumes
  every limit; it flows through to the transaction report and its Excel export.
- **Distribution**: executed participation agreement, investor approved limit,
  investor pricing floor, investor tenor band, participation amount (as % of
  funded).
- **Insurance**: policy validity, per-buyer sublimit, country limit, policy max
  tenor, coverage % (covered vs uninsured residual), recourse to seller,
  multi-insurer allocation totals.

Reuses the same reservation-aware availability formula, so live outstanding and
reservations flow into these capacity checks. `lib/engine/eligibility.ts` is the
single `checkDiscount(txn)` entry point.

**Phase 7 — governance & overrides** ✓
- **Roles & Access** (`/access`, MANAGE_ROLES-gated): a role×permission matrix and
  per-user role assignment, both runtime-editable and audited, with a lockout
  guard (Administrator always keeps Manage roles). The role→permission map and
  users now live in the store, not hardcoded.
- **Edit existing limits**: the Limit Register is inline-editable (amount, max
  tenor, expiry, status) for CHANGE_LIMIT holders, via `PATCH /api/limits/:id`.
- **Add to register**: new limit (any type), new seller, new obligor, or ASR
  approved-obligor sublimit from the Setup screen.
- **Expirations** (`/expirations`): flags every limit and facility credential
  (borrower rating, ASR rating, RRL, insurance policy) at 60 days, 30 days, and
  expired; a banner on the Portfolio home links to it.
- **Eligibility "does not clear"**: a capacity breach now FAILS and reports the
  max performable (e.g. "only $50MM of $60MM is within the limit") rather than a
  soft exception.
- **CDL on every limit**: every limit books against an 8-digit CDL customer code;
  it is required whenever a new limit is added and is editable in the register.
- **Swingline is a core limit**: if a seller/obligor line carries a swingline,
  every transaction and reservation against it always draws on and is tested
  against it (no per-transaction toggle) — and always consumes it.
- **Multiple investors and insurers per deal**: distribution and insurance each
  take one or more allocations (add/remove rows), checked and totalled per party.
- **Reservations run the full eligibility engine**: every discount reservation is
  evaluated by the same comprehensive `checkDiscount` used on the Eligibility
  screen (seller facility, obligor, ASR sublimit, pricing floor, tenor, …). It
  auto-books when it clears; only a REJECTED/EXCEPTION result triggers the
  soft-warning path.
- **Swingline reservations**: a swingline movement can be booked as its own
  reservation — single entity (seller XOR obligor), no pricing, with a direction
  (reduction draws down available; increase releases it). It folds into the same
  swingline availability the engine reads (reductions add, increases subtract).
- **Reservation soft-warning exceptions**: when a reservation does not clear, the
  booker can override with a documented reason and an optional resolve-by date;
  the reservation is booked and flagged in the list with a ⚠ marker whose tooltip
  shows the reason, resolve-by date, and the checks that did not clear.

**Phase 8 — multi-entity, reporting & handoff** ✓
- **Obligor multi-entity**: a transaction (interactive or uploaded) can name a
  specific obligor **legal entity** within the group. It consumes the group
  aggregate limit, while the named entity is gated on its own domicile
  enforceability, borrower-rating currency, credit insurance, and parent-company
  guarantee — evaluated as of the value date. The rules live once in
  `lib/engine/obligorEntity.ts` and are shared by both engines.
- **Coverage amount** everywhere applicable: read-only on both eligibility forms,
  a column in the multi-transaction table, and a column + total in the
  transaction report and its Excel export.
- **Exposure summary + email** (`/reports`): tick any set of sellers/obligors,
  sort by any column, **Copy as email** (a real HTML + plaintext table for
  Gmail/Outlook), and **Download Excel**.
- **Formatted Excel exports** via `lib/xlsxexport.ts` (native numeric cells,
  sized columns, frozen header, totals row).

## Deferred (need external infrastructure)

Real **SSO** (SAML/OIDC via Azure AD) replaces the demo user switcher at
`lib/auth.ts`; production **host-to-host** ingestion needs mTLS + per-counterparty
rotated keys (the `/api/ingest` stub shows the seam); real **payment rails**
(pain.001 / Fedwire) replace the CSV payment file; and the in-memory store
(`lib/data/store.ts`) swaps for **Postgres**.
