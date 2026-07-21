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

## Architecture (single source of truth)

- `lib/types.ts` — the one definition of every entity.
- `lib/engine/availability.ts` — **the** availability formula. Capacity is never
  stored; it is always derived here (`approved − consumed`).
- `lib/engine/index.ts` — the eligibility engine. Runs each invoice through the
  checks against a working limit snapshot consumed sequentially.
- `lib/engine/allocation.ts` — the funding allocation planner (investor takeout →
  bank hold → insurance overlay). Reads capacity; the engine commits it.
- `lib/data/seed.ts` / `lib/data/store.ts` — seeded demo data and the in-memory
  store. `store.ts` is the seam that becomes Postgres later.
- `app/` — Portfolio, Batches, Batch review, and Limits screens.

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
- **Transaction**: advance rate in 85–100% range; advance vs invoice-type
  (FINAL/PROVISIONAL/PIPELINE) typical cap — **warns, doesn't fail**, when the
  business line prices above for return; funded amount = invoice × advance rate,
  which is what consumes every limit.
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
- **Reservation soft-warning exceptions**: when a reservation does not clear, the
  booker can override with a documented reason and an optional resolve-by date;
  the reservation is booked and flagged in the list with a ⚠ marker whose tooltip
  shows the reason, resolve-by date, and the checks that did not clear.

## Deferred (need external infrastructure)

Real **SSO** (SAML/OIDC via Azure AD) replaces the demo user switcher at
`lib/auth.ts`; production **host-to-host** ingestion needs mTLS + per-counterparty
rotated keys (the `/api/ingest` stub shows the seam); real **payment rails**
(pain.001 / Fedwire) replace the CSV payment file; and the in-memory store
(`lib/data/store.ts`) swaps for **Postgres**.
