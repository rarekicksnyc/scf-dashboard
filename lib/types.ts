// ---------------------------------------------------------------------------
// Core domain types for the seller-led SCF discounting platform.
// This file is the single source of truth for the shape of every entity the
// eligibility engine and the UI read. Nothing downstream redefines these.
// ---------------------------------------------------------------------------

export type Currency = "USD" | "EUR" | "GBP" | "JPY";

export type EntityStatus = "ACTIVE" | "SUSPENDED" | "WATCHLIST" | "EXPIRED";

// Every limit the engine can check. The ASR (Asset Securitization) limit is a
// first-class, manually-input monetary limit checked independently of the
// seller relationship limit — the same mechanics as a seller or obligor limit.
export type LimitType =
  | "SELLER" // overall seller / program relationship cap
  | "ASR" // Asset Securitization limit (manually-input monetary cap)
  | "OBLIGOR" // buyer / account-debtor concentration cap
  | "SWINGLINE" // temporary bank funding pending takeout/distribution
  | "RRL_SWINGLINE" // swingline that mirrors the RRL booking (separate from the regular swingline)
  | "RRL" // Risk Reimbursement Line — seller-level, part of a deal can book here
  | "INSURANCE" // insured recoverable exposure cap (per policy)
  | "INVESTOR" // distribution / investor takeout cap
  | "PROGRAM"; // program-level umbrella cap

// The ASR rating is a distinct concept from the ASR limit: an internal seller
// risk grade (best → worst). It classifies the seller's credit quality; it is
// not itself a monetary control. Ordered from strongest (1) to weakest (7-1).
export type AsrRating =
  | "1"
  | "2"
  | "3"
  | "4A"
  | "4B"
  | "4C"
  | "5-1"
  | "5-2"
  | "6-1"
  | "6-2"
  | "7-1";

export const ASR_RATINGS: AsrRating[] = [
  "1",
  "2",
  "3",
  "4A",
  "4B",
  "4C",
  "5-1",
  "5-2",
  "6-1",
  "6-2",
  "7-1",
];

// Numeric rank for ordering/comparison (lower rank = stronger credit).
export function asrRatingRank(r: AsrRating): number {
  return ASR_RATINGS.indexOf(r);
}

export type EntityType =
  | "SELLER"
  | "OBLIGOR"
  | "PROGRAM"
  | "INVESTOR"
  | "INSURER_POLICY";

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export interface Program {
  id: string;
  name: string;
  productType: string;
  baseCurrency: Currency;
  maxTenorDays: number;
  status: EntityStatus;
}

// ---------------------------------------------------------------------------
// Multi-entity model. A Seller (facility) holds the aggregate seller line, ASR,
// swingline, and RRL; one or more eligible SellerEntity legal entities share it.
// An Obligor (group) holds the aggregate obligor limit + swingline; one or more
// eligible ObligorEntity legal entities share it. Transactions name a specific
// entity but consume the facility/group aggregate.
// ---------------------------------------------------------------------------

export interface SellerEntity {
  id: string;
  facilityId: string; // parent Seller (facility) id
  name: string;
  cdl: string; // 8-digit customer code (per legal entity)
  domicile: string; // country of domicile
}

export interface ObligorEntity {
  id: string;
  groupId: string; // parent Obligor (group) id
  name: string;
  cdl: string;
  bookingCdl: string;
  domicile: string;
  borrowerRating: string;
  borrowerRatingExpiry: string;
  insurancePolicyId?: string;
  insuranceExpiry?: string;
  pcg?: PcgFlag; // parent company guarantee
  pcgExpiry?: string;
  pcgLimit?: number;
}

export type LegalDocStatus = "RECEIVED" | "MISSING" | "EXPIRED";

export interface LegalDocument {
  type: string; // e.g. MASTER_RECEIVABLES_PURCHASE_AGREEMENT
  status: LegalDocStatus;
  expiryDate?: string;
}

export interface Seller {
  id: string;
  name: string;
  cdl: string; // customer identification code — the booking key for exposure
  status: EntityStatus;
  eligible: boolean; // approved to transact
  programId: string;
  currency: Currency;
  internalRating: string; // agency-style grade (e.g. BBB, BB+)
  asrRating: AsrRating; // internal ASR seller risk grade (1 … 7-1)
  asrExpiry: string; // ASR rating expiry (ISO)
  borrowerRating: string; // seller/borrower risk rating
  borrowerRatingExpiry: string; // borrower rating expiry (ISO)
  guarantor: string; // guarantor name, or "None"
  gcarsNumber: string; // GCARS reference #
  minPricingBps: number; // minimum pricing threshold (bps)
  // RRL — Risk Reimbursement Line: a separate credit limit only counted when
  // enabled. Not all sellers have one (toggle).
  rrlEnabled: boolean;
  rrlLimit: number;
  rrlExpiry: string;
  documents: LegalDocument[]; // program legal documentation checklist
}

export interface Obligor {
  id: string;
  name: string;
  cdl: string; // customer identification code — the booking key for exposure
  status: EntityStatus;
  eligible: boolean; // approved as an obligor
  country: string;
  sector: string;
  internalRating: string; // agency-style grade (e.g. A-, BBB)
  hasGuarantee: boolean; // an obligor guarantee exists
  guaranteeEligible: boolean; // and the guarantee is eligible
  expiryDate?: string; // obligor-group-level review / approval expiry (ISO)
}

// ---------------------------------------------------------------------------
// Funding partners (Phase 3). Investors take out distributed discounts;
// insurance policies cover a percentage of an obligor's exposure. Each has a
// matching Limit row (INVESTOR / INSURANCE) that carries its monetary capacity;
// the master record below carries the eligibility rules.
// ---------------------------------------------------------------------------

export interface Investor {
  id: string;
  name: string;
  status: EntityStatus;
  currency: Currency;
  eligibleObligorIds: string[]; // empty = all obligors eligible
  minTenorDays: number;
  maxTenorDays: number;
  minTicket: number;
  maxTicket: number;
  pricingFloorBps: number; // minimum pricing the investor accepts
  domicile: string; // country of domicile
}

// Country enforceability register: only countries with an enforceability opinion
// are eligible as a domicile.
export interface Country {
  code: string;
  name: string;
  eligible: boolean;
}

// An executed participation agreement between an investor and a seller — a
// precondition for distributing that seller's discounts to the investor.
export interface ParticipationAgreement {
  investorId: string;
  sellerId: string;
  executed: boolean;
}

// Parent Company Guarantee (PCG). A parent company guarantees a seller and/or an
// obligor. It can carry a fixed expiry, or be a "continuing unconditional
// guarantee" (indefinite — no expiry). Tracked and edited in Data Management and
// surfaced (when not continuing) in the Expirations tab.
export interface ParentCompanyGuarantee {
  id: string;
  parentName: string; // the guarantor parent company
  sellerId?: string; // seller the PCG is associated with
  obligorId?: string; // obligor the PCG is associated with
  coveredObligorId?: string; // the specific obligor being covered
  continuing: boolean; // continuing unconditional guarantee (indefinite)
  expiryDate?: string; // ISO — used only when not continuing
  limitAmount?: number; // guaranteed amount (USD)
  notes?: string;
}

export interface InsurancePolicy {
  id: string;
  insurerName: string;
  policyNumber: string;
  coveragePercent: number; // e.g. 0.90
  coveredObligorIds: string[]; // empty = all obligors covered
  maxTenorDays: number;
  effectiveDate: string; // policy validity start (ISO)
  expiryDate: string; // policy validity end (ISO)
  recourseToSeller: boolean; // uninsured residual has recourse to the seller
  domicile: string; // insurer country of domicile
  status: EntityStatus;
}

// Per-buyer (obligor) sublimit under an insurance policy.
export interface InsuranceBuyerSublimit {
  policyId: string;
  obligorId: string;
  sublimit: number;
}

// Per-country limit under an insurance policy.
export interface InsuranceCountryLimit {
  policyId: string;
  country: string;
  limit: number;
}

// The per-seller ASR approved-obligor list: each seller's ASR carries its own
// obligor sublimit, which can differ from that obligor's master line and from
// the same obligor's sublimit under another seller.
export interface SellerObligorLimit {
  sellerId: string;
  obligorId: string;
  approvedLimit: number; // obligor sublimit UNDER this seller's ASR
  maxTenorDays: number; // approved tenor for this seller/obligor pair
}

// ---------------------------------------------------------------------------
// Limits + utilization. A Limit is the approved ceiling; a Utilization is the
// current consumption. Available capacity is NEVER stored — it is always
// derived from these two by computeAvailability() so the number can never
// drift out of sync. (Single source of truth.)
// ---------------------------------------------------------------------------

export interface Limit {
  id: string;
  type: LimitType;
  cdl: string; // customer identification code this limit books exposure against
  entityType: EntityType;
  entityId: string; // sellerId / obligorId / programId / investorId / policyId
  programId?: string;
  currency: Currency;
  approvedLimit: number;
  maxTenorDays: number;
  effectiveDate: string; // ISO date
  expiryDate: string; // ISO date
  status: EntityStatus;
  // Fraction of the limit at which we warn (yellow) vs. force approval (orange).
  warnThreshold: number; // e.g. 0.85
  exceptionThreshold: number; // e.g. 1.0 — above this, exception required not hard reject
  // Coverage percent applies to INSURANCE limits only (e.g. 0.90 = 90% covered).
  coveragePercent?: number;
}

export interface Utilization {
  limitId: string;
  fundedOutstanding: number;
  pendingApproved: number;
  pendingSettlement: number;
  pendingRequested: number;
  confirmedRepayments: number;
}

// A point-in-time view of a limit, derived. Used by the engine's working
// snapshot (which decrements as a batch is consumed) and by the dashboards.
// consumed splits into two buckets so the exposure tabs can show current
// outstanding separately from future reservations:
//   consumed = outstanding + reserved
// A time window used to test whether a reservation is on the books. A single
// ISO date is the instant view (does the reservation straddle that day); a
// {from,to} pair is a span (does the reservation OVERLAP that span). A
// transaction only consumes a limit while its own [valueDate, maturityDate]
// overlaps the reservation's [valueDate, maturityDate] — future reservations
// must not reduce an earlier transaction's capacity.
export type DateWindow = { from: string; to: string };
export type AsOf = string | DateWindow;

export interface LimitView {
  limit: Limit;
  approvedLimit: number;
  outstanding: number; // current booked exposure (from utilization)
  reserved: number; // future reservations booked against this limit
  consumed: number; // outstanding + reserved
  available: number; // approvedLimit - consumed
  utilizationPct: number; // consumed / approvedLimit
}

// ---------------------------------------------------------------------------
// Invoices + batch results
// ---------------------------------------------------------------------------

export type PcgFlag = "Y" | "N" | "N/A";

export interface Invoice {
  invoiceNumber: string;
  sellerId: string;
  obligorId: string;
  obligorEntityId?: string; // specific obligor legal entity, when named on the schedule
  amount: number;
  currency: Currency;
  issueDate: string; // ISO
  dueDate: string; // ISO
  requestedDiscountDate: string; // ISO
  sellerPcg?: PcgFlag; // seller parent company guarantee
  obligorPcg?: PcgFlag; // obligor parent company guarantee
  // Schedule A / UTRC pricing fields (optional; from the upload).
  coverageAmount?: number;
  advanceRate?: number; // 0.85 … 1.00
  marginBps?: number;
  baseRate?: number; // percent
  baseRateType?: BaseRateType;
  productType?: ProductType;
}

// ---------------------------------------------------------------------------
// Reservations — forward-booked future discounts. A reservation marks exposure
// against BOTH the seller and the obligor (and, if it draws swingline, both
// entities' swinglines). Active reservations reduce available capacity in the
// same availability formula the batch engine uses, so future expected exposure
// is enforced against limits alongside current outstanding.
// ---------------------------------------------------------------------------

export type ReservationStatus = "RESERVED" | "FUNDED" | "MATURED" | "CANCELLED";

// DISCOUNT = a forward discount that draws seller + obligor (+ swinglines).
// SWINGLINE = a standalone swingline movement on a single entity, no pricing.
export type ReservationKind = "DISCOUNT" | "SWINGLINE";
export type SwinglineDirection = "REDUCTION" | "INCREASE";
export type ReservationScope = "BOTH" | "SELLER_ONLY" | "OBLIGOR_ONLY";

export interface Reservation {
  id: string;
  kind?: ReservationKind; // undefined = DISCOUNT (backward compatible)
  swinglineDirection?: SwinglineDirection; // for kind = SWINGLINE
  swinglineKind?: "REGULAR" | "RRL"; // which swingline the adjustment targets (default REGULAR)
  sellerId: string; // for SWINGLINE, exactly one of sellerId/obligorId is set
  obligorId: string;
  amount: number;
  currency: Currency;
  valueDate: string; // expected value / funding date (ISO)
  maturityDate: string; // expected maturity / repayment date (ISO)
  pricingBps: number; // pricing in basis points (0 for swingline movements)
  tenorDays: number; // maturityDate - valueDate
  usesSwingline: boolean;
  rrlAmount?: number; // portion of the amount booked on the seller's RRL
  // Which credit lines this reservation blocks. BOTH (default) draws the seller
  // and obligor sides; SELLER_ONLY draws only the seller line/swingline/RRL;
  // OBLIGOR_ONLY draws only the obligor line/swingline/ASR sublimit. Used for the
  // uncommon case where only one side should be reserved.
  scope?: ReservationScope;
  // Distribution / insurance held by this reservation. When present, the reserved
  // amounts also hold each investor's and policy's capacity for the reservation's
  // [valueDate, maturityDate] window (time-phased, like the credit lines).
  investorAllocations?: InvestorAllocation[];
  insurerAllocations?: InsurerAllocation[];
  status: ReservationStatus;
  createdAt: string;
  createdBy: string;
  // Soft-warning exception: booked despite a control that did not clear (e.g. a
  // line up for renewal). Documented with a reason and an optional resolve-by
  // date, and flagged in the reservation list.
  exception?: boolean;
  exceptionComment?: string;
  exceptionReasons?: string[];
  resolveByDate?: string;
  // Set when the reservation is fulfilled by an actual transaction — the reserved
  // future exposure has become real outstanding, so the reservation is released.
  fulfilledByInvoice?: string;
  fulfilledAt?: string;
}

// A calendar event derived from a reservation or a funded invoice.
export type ScheduleEventType =
  | "FUNDING"
  | "REPAYMENT"
  | "SWINGLINE_DRAW";

export interface ScheduleEvent {
  date: string; // ISO date
  type: ScheduleEventType;
  amount: number;
  sellerId: string;
  obligorId: string;
  refId: string; // reservation id or invoice number
  label: string;
}

// ---------------------------------------------------------------------------
// MARS-style consolidated eligibility — a single discount transaction checked
// against every seller-facility and transaction parameter at once.
// ---------------------------------------------------------------------------

export type InvoiceType = "FINAL" | "PROVISIONAL" | "PIPELINE";
export type ProductType = "DTR" | "UTRC"; // discount TR vs unfunded TR commitment
export type BaseRateType = "COF" | "SOFR" | "OTHER";

// A row from an uploaded rate sheet. Each row is a value-date → maturity rate;
// the offer is the used rate. Base rates are resolved from these by type + tenor.
export interface RateRow {
  rateType: BaseRateType;
  startDate: string; // value date
  maturityDate: string;
  tenorDays: number;
  bid: number; // percent
  offer: number; // percent (used rate)
  calcRate?: number;
  error?: string;
}

// Pricing convention: a margin input of 1.15 means 115 bps = 1.15%. We store the
// margin in bps (pricingBps = 115) and the base rate as a percent (baseRate =
// 5.00). margin_decimal = pricingBps/10000; base_decimal = baseRate/100.
export interface PricingResult {
  productType: ProductType;
  baseRateType: BaseRateType;
  baseRatePct: number; // e.g. 5.00
  marginBps: number; // e.g. 115
  allInRatePct: number; // margin% + base% (e.g. 6.15)
  coverage: number; // DTR: funded/advance amount
  discount: number; // DTR
  purchasePrice: number; // DTR: coverage - discount
  commitmentFee: number; // UTRC
}

export interface InsurerAllocation {
  policyId: string;
  amount: number; // insured amount allocated to this policy
}

export interface InvestorAllocation {
  investorId: string;
  amount: number; // participation amount for this investor
}

export interface DiscountTransaction {
  sellerId: string;
  obligorId: string;
  obligorEntityId?: string; // specific legal entity within the obligor group (optional)
  rrlAmount?: number; // portion of the funded amount booked to the seller RRL (not the seller line)
  invoiceNumber: string;
  invoiceAmount: number;
  currency: Currency;
  invoiceType: InvoiceType;
  advanceRate: number; // 0.85 … 1.00, from the upload file
  valueDate: string;
  maturityDate: string;
  pricingBps: number; // margin, in bps
  productType?: ProductType; // default DTR
  // UTRC (unfunded commitment): the bank commits to purchase up to a committed
  // amount by a final permitted demand date. The committed amount is what
  // consumes the limits (in place of the DTR funded/coverage amount), and the
  // final demand date acts as the maturity for tenor and time-phasing. A
  // commitment fee is charged instead of a discount / purchase price.
  committedAmount?: number; // UTRC only
  commitmentDueDate?: string; // UTRC only — ISO, the commitment due date
  finalDemandDate?: string; // UTRC only — ISO, the final permitted demand date (maturity)
  baseRateType?: BaseRateType;
  baseRate?: number; // percent, e.g. 5.00
  // Distribution — one or more investors
  distributed: boolean;
  investorAllocations?: InvestorAllocation[];
  // Insurance — one or more insurers
  insured: boolean;
  insurerAllocations?: InsurerAllocation[];
}

export type EligibilityCategory =
  | "SELLER"
  | "OBLIGOR"
  | "ASR"
  | "TRANSACTION"
  | "DISTRIBUTION"
  | "INSURANCE";

export interface EligibilityCheck {
  category: EligibilityCategory;
  name: string;
  checkedAgainst: string; // the facility parameter / limit value
  txnValue: string; // the transaction's value
  status: "PASS" | "WARN" | "FAIL" | "NA";
  severity: "GREEN" | "YELLOW" | "ORANGE" | "RED" | "GREY";
  message: string;
}

export interface EligibilityReport {
  transaction: DiscountTransaction;
  advanceAmount: number; // invoiceAmount x advanceRate — consumes limits
  tenorDays: number;
  checks: EligibilityCheck[];
  pricing: PricingResult;
  decision: "ELIGIBLE" | "ELIGIBLE_WITH_WARNING" | "EXCEPTION_REQUIRED" | "REJECTED";
}

export type Severity = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export type CheckStatus = "PASS" | "PASS_WITH_WARNING" | "EXCEPTION" | "FAIL";

export interface CheckResult {
  checkName: string;
  status: CheckStatus;
  severity: Severity;
  message: string;
  breachAmount?: number;
}

export type EligibilityStatus =
  | "ELIGIBLE"
  | "ELIGIBLE_WITH_WARNING"
  | "EXCEPTION_REQUIRED"
  | "EXCEPTION_APPROVED" // a checker approved the breach; now fundable
  | "REJECTED"
  | "PENDING_DATA";

// Funding allocation (Phase 3). An eligible invoice is split across funding
// sources whose amounts sum to the invoice amount; insurance is a risk overlay
// on the bank-held portion, not a cash source.
export type FundingSource = "INVESTOR" | "BANK_HOLD" | "SWINGLINE";

export interface FundingLeg {
  source: FundingSource;
  sourceId?: string; // investorId when source = INVESTOR
  sourceName?: string;
  amount: number;
}

export interface InvoiceFunding {
  legs: FundingLeg[];
  bankHeld: number; // portion the bank retains (bank hold + swingline)
  insuredAmount: number; // insured portion of the bank-held exposure
  uninsuredResidual: number; // bank-held exposure not covered by insurance
  policyId?: string;
  policyName?: string;
}

export type SettlementStatus =
  | "NOT_APPLICABLE" // rejected / exception invoices
  | "PENDING" // eligible, awaiting funding release
  | "FUNDED"
  | "SETTLED";

export interface InvoiceResult {
  invoice: Invoice;
  tenorDays: number;
  discountRate: number;
  discountFee: number;
  netProceeds: number;
  checks: CheckResult[];
  status: EligibilityStatus;
  breachAmount: number; // largest single-limit breach, for quick sorting
  funding?: InvoiceFunding; // present for eligible / warning invoices
  settlementStatus: SettlementStatus;
}

export interface BatchSummary {
  totalCount: number;
  eligibleCount: number;
  warningCount: number;
  exceptionCount: number;
  rejectedCount: number;
  totalRequested: number;
  eligibleAmount: number;
  exceptionAmount: number;
  rejectedAmount: number;
}

export interface BatchResult {
  batchId: string;
  sellerId: string;
  uploadedAt: string; // ISO — stamped by the caller, not the engine
  fileName: string;
  makerUserId: string; // user who uploaded the batch (the "maker")
  summary: BatchSummary;
  results: InvoiceResult[];
  // Post-batch limit views for the limits touched by this batch.
  postBatchLimits: LimitView[];
}

// ---------------------------------------------------------------------------
// Phase 4 — access control, maker-checker workflow, audit.
// ---------------------------------------------------------------------------

export type Permission =
  | "UPLOAD_BATCH"
  | "APPROVE_EXCEPTION"
  | "CHANGE_LIMIT"
  | "VIEW_REPORTS"
  | "VIEW_AUDIT"
  | "GENERATE_PAYMENT_FILE"
  | "MANAGE_ROLES";

export type Role =
  | "OPERATIONS"
  | "CREDIT_OFFICER"
  | "PRODUCT_MANAGER"
  | "RELATIONSHIP_MANAGER"
  | "RISK_MANAGER"
  | "ADMIN"
  | "VIEWER";

export interface User {
  id: string;
  name: string;
  role: Role;
  passwordHash?: string; // scrypt "salt:hash"; set at seed / user creation
}

export type ExceptionStatus = "OPEN" | "APPROVED" | "REJECTED";

export interface ExceptionItem {
  id: string;
  batchId: string;
  invoiceNumber: string;
  sellerId: string;
  obligorId: string;
  amount: number;
  checkName: string; // which control raised the exception
  reason: string;
  breachAmount: number;
  status: ExceptionStatus;
  makerUserId: string; // who submitted the batch
  decidedByUserId?: string; // checker who approved/rejected
  decidedByName?: string;
  decidedAt?: string;
  comment?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  action: string; // e.g. BATCH_UPLOAD, EXCEPTION_APPROVE
  entityType: string;
  entityId: string;
  detail: string;
}
