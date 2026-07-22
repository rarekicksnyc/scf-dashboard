import { hashPassword } from "@/lib/password";
import type {
  Program,
  Seller,
  Obligor,
  Limit,
  Utilization,
  Investor,
  InsurancePolicy,
  Reservation,
  SellerObligorLimit,
  ParticipationAgreement,
  InsuranceBuyerSublimit,
  InsuranceCountryLimit,
  User,
  Role,
  Permission,
  SellerEntity,
  ObligorEntity,
  Country,
  RateRow,
} from "@/lib/types";

// Seeded rate sheet (as if uploaded from the pricing platform). offer = used rate.
export const rates: RateRow[] = [
  { rateType: "SOFR", startDate: "2026-08-01", maturityDate: "2026-08-31", tenorDays: 30, bid: 4.95, offer: 5.0, calcRate: 5.0 },
  { rateType: "SOFR", startDate: "2026-08-01", maturityDate: "2026-09-30", tenorDays: 60, bid: 4.97, offer: 5.02, calcRate: 5.02 },
  { rateType: "SOFR", startDate: "2026-08-01", maturityDate: "2026-10-30", tenorDays: 90, bid: 5.0, offer: 5.05, calcRate: 5.05 },
  { rateType: "SOFR", startDate: "2026-08-01", maturityDate: "2027-01-28", tenorDays: 180, bid: 5.05, offer: 5.1, calcRate: 5.1 },
  { rateType: "COF", startDate: "2026-08-01", maturityDate: "2026-10-30", tenorDays: 90, bid: 5.3, offer: 5.35, calcRate: 5.35 },
  { rateType: "COF", startDate: "2026-08-01", maturityDate: "2027-01-28", tenorDays: 180, bid: 5.38, offer: 5.45, calcRate: 5.45 },
];

// Country enforceability register. Only "eligible" countries (an enforceability
// opinion is on file) may be selected as an entity domicile; others get flagged.
export const countries: Country[] = [
  { code: "US", name: "United States", eligible: true },
  { code: "GB", name: "United Kingdom", eligible: true },
  { code: "CA", name: "Canada", eligible: true },
  { code: "DE", name: "Germany", eligible: true },
  { code: "FR", name: "France", eligible: true },
  { code: "NL", name: "Netherlands", eligible: true },
  { code: "IE", name: "Ireland", eligible: true },
  { code: "LU", name: "Luxembourg", eligible: true },
  { code: "CH", name: "Switzerland", eligible: true },
  { code: "JP", name: "Japan", eligible: true },
  { code: "AU", name: "Australia", eligible: true },
  { code: "SG", name: "Singapore", eligible: true },
  { code: "IT", name: "Italy", eligible: false },
  { code: "ES", name: "Spain", eligible: false },
  { code: "MX", name: "Mexico", eligible: false },
  { code: "BR", name: "Brazil", eligible: false },
  { code: "CN", name: "China", eligible: false },
  { code: "IN", name: "India", eligible: false },
  { code: "AE", name: "United Arab Emirates", eligible: false },
  { code: "SA", name: "Saudi Arabia", eligible: false },
  { code: "ZA", name: "South Africa", eligible: false },
  { code: "KR", name: "South Korea", eligible: false },
];

// Demo users and the default role → permission map, seeded into the store so
// they can be edited at runtime on the Roles & Access screen. Each user logs in
// with DEMO_PASSWORD (default "demo1234"; override via the env var). This only
// applies on first seed — set real passwords / SSO for production.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo1234";
const demoHash = hashPassword(DEMO_PASSWORD);
export const users: User[] = [
  { id: "u_ops", name: "Dana Okafor", role: "OPERATIONS", passwordHash: demoHash },
  { id: "u_credit", name: "Sam Reyes", role: "CREDIT_OFFICER", passwordHash: demoHash },
  { id: "u_product", name: "Riley Chen", role: "PRODUCT_MANAGER", passwordHash: demoHash },
  { id: "u_rm", name: "Priya Nair", role: "RELATIONSHIP_MANAGER", passwordHash: demoHash },
  { id: "u_risk", name: "Morgan Diallo", role: "RISK_MANAGER", passwordHash: demoHash },
  { id: "u_admin", name: "Alex Novak", role: "ADMIN", passwordHash: demoHash },
  { id: "u_viewer", name: "Jordan Blake", role: "VIEWER", passwordHash: demoHash },
];

export const rolePermissions: Record<Role, Permission[]> = {
  OPERATIONS: ["UPLOAD_BATCH", "VIEW_REPORTS", "VIEW_AUDIT", "GENERATE_PAYMENT_FILE"],
  CREDIT_OFFICER: ["APPROVE_EXCEPTION", "CHANGE_LIMIT", "VIEW_REPORTS", "VIEW_AUDIT"],
  PRODUCT_MANAGER: ["UPLOAD_BATCH", "APPROVE_EXCEPTION", "CHANGE_LIMIT", "VIEW_REPORTS", "VIEW_AUDIT", "GENERATE_PAYMENT_FILE", "MANAGE_ROLES"],
  RELATIONSHIP_MANAGER: ["UPLOAD_BATCH", "VIEW_REPORTS"],
  RISK_MANAGER: ["APPROVE_EXCEPTION", "CHANGE_LIMIT", "VIEW_REPORTS", "VIEW_AUDIT"],
  ADMIN: [
    "UPLOAD_BATCH",
    "APPROVE_EXCEPTION",
    "CHANGE_LIMIT",
    "VIEW_REPORTS",
    "VIEW_AUDIT",
    "GENERATE_PAYMENT_FILE",
    "MANAGE_ROLES",
  ],
  VIEWER: ["VIEW_REPORTS", "VIEW_AUDIT"],
};

// ---------------------------------------------------------------------------
// Demo data for a single seller-led discounting program. Numbers are chosen to
// exercise the engine: e.g. SELLER001 has $50MM of seller headroom but only
// $20MM of ASR headroom, so a large batch passes the seller limit and fails
// ASR — the exact case that makes an independent ASR control worth having.
// ---------------------------------------------------------------------------

export const programs: Program[] = [
  {
    id: "PRG001",
    name: "Seller-Led Discounting Program",
    productType: "SELLER_LED_DISCOUNTING",
    baseCurrency: "USD",
    maxTenorDays: 180,
    status: "ACTIVE",
  },
];

export const sellers: Seller[] = [
  {
    id: "SELLER001",
    name: "Meridian Components Inc",
    cdl: "10048201",
    status: "ACTIVE",
    eligible: true,
    programId: "PRG001",
    currency: "USD",
    internalRating: "BBB",
    asrRating: "3",
    asrExpiry: "2026-12-31",
    borrowerRating: "BBB",
    borrowerRatingExpiry: "2027-03-31",
    guarantor: "Meridian Holdings LLC",
    gcarsNumber: "GC-88213",
    minPricingBps: 90,
    rrlEnabled: true,
    rrlLimit: 20_000_000,
    rrlExpiry: "2026-12-31",
    documents: [
      { type: "MASTER_RECEIVABLES_PURCHASE_AGREEMENT", status: "RECEIVED" },
      { type: "ASSIGNMENT_NOTICE", status: "RECEIVED" },
      { type: "KYB_REFRESH", status: "RECEIVED", expiryDate: "2027-01-31" },
    ],
  },
  {
    id: "SELLER002",
    name: "Atlas Textiles Ltd",
    cdl: "10051702",
    status: "ACTIVE",
    eligible: true,
    programId: "PRG001",
    currency: "USD",
    internalRating: "BB+",
    asrRating: "4B",
    asrExpiry: "2026-12-31",
    borrowerRating: "BB+",
    borrowerRatingExpiry: "2026-08-31",
    guarantor: "None",
    gcarsNumber: "GC-88240",
    minPricingBps: 110,
    rrlEnabled: false,
    rrlLimit: 0,
    rrlExpiry: "",
    documents: [
      { type: "MASTER_RECEIVABLES_PURCHASE_AGREEMENT", status: "RECEIVED" },
      { type: "ASSIGNMENT_NOTICE", status: "MISSING" },
      { type: "KYB_REFRESH", status: "RECEIVED", expiryDate: "2026-09-30" },
    ],
  },
];

// Eligible seller legal entities sharing each seller facility's aggregate line.
export const sellerEntities: SellerEntity[] = [
  { id: "SE-001A", facilityId: "SELLER001", name: "Meridian Components LLC", cdl: "10048201", domicile: "US" },
  { id: "SE-001B", facilityId: "SELLER001", name: "Meridian Components Ltd", cdl: "10048211", domicile: "US" },
  { id: "SE-001C", facilityId: "SELLER001", name: "Meridian Components Co", cdl: "10048221", domicile: "US" },
  { id: "SE-002A", facilityId: "SELLER002", name: "Atlas Textiles Ltd", cdl: "10051702", domicile: "US" },
];

// Eligible obligor legal entities sharing each obligor group's aggregate limit.
export const obligorEntities: ObligorEntity[] = [
  { id: "OE-001A", groupId: "OBL001", name: "Global Retail Corp", cdl: "20034101", bookingCdl: "20034101", domicile: "US", borrowerRating: "A-", borrowerRatingExpiry: "2027-03-31", insurancePolicyId: "POL-1", insuranceExpiry: "2026-12-31", pcg: "Y", pcgExpiry: "2027-06-30", pcgLimit: 25_000_000 },
  { id: "OE-001B", groupId: "OBL001", name: "Global Retail Holdings Inc", cdl: "20034111", bookingCdl: "20034111", domicile: "US", borrowerRating: "A-", borrowerRatingExpiry: "2027-03-31", insurancePolicyId: "POL-1", insuranceExpiry: "2026-12-31", pcg: "N/A" },
  { id: "OE-002A", groupId: "OBL002", name: "Northwind Manufacturing", cdl: "20035801", bookingCdl: "20035801", domicile: "US", borrowerRating: "BBB", borrowerRatingExpiry: "2026-11-30", pcg: "N" },
  { id: "OE-003A", groupId: "OBL003", name: "Pacific Distribution Co", cdl: "20036201", bookingCdl: "20036201", domicile: "US", borrowerRating: "BB", borrowerRatingExpiry: "2026-10-31", insurancePolicyId: "POL-1", insuranceExpiry: "2026-12-31", pcg: "N" },
  { id: "OE-004A", groupId: "OBL004", name: "Cedar Foods Group", cdl: "20037701", bookingCdl: "20037701", domicile: "US", borrowerRating: "B+", borrowerRatingExpiry: "2026-09-30", pcg: "N" },
];

export const obligors: Obligor[] = [
  {
    id: "OBL001",
    name: "Global Retail Corp",
    cdl: "20034101",
    status: "ACTIVE",
    eligible: true,
    country: "US",
    sector: "Retail",
    internalRating: "A-",
    hasGuarantee: true,
    guaranteeEligible: true,
    expiryDate: "2027-03-31",
  },
  {
    id: "OBL002",
    name: "Northwind Manufacturing",
    cdl: "20035801",
    status: "ACTIVE",
    eligible: true,
    country: "US",
    sector: "Industrials",
    internalRating: "BBB",
    hasGuarantee: false,
    guaranteeEligible: false,
    expiryDate: "2026-11-30",
  },
  {
    id: "OBL003",
    name: "Pacific Distribution Co",
    cdl: "20036201",
    status: "ACTIVE",
    eligible: true,
    country: "US",
    sector: "Logistics",
    internalRating: "BB",
    hasGuarantee: true,
    guaranteeEligible: false,
    expiryDate: "2026-10-31",
  },
  {
    id: "OBL004",
    name: "Cedar Foods Group",
    cdl: "20037701",
    status: "WATCHLIST",
    eligible: false,
    country: "US",
    sector: "Consumer",
    internalRating: "B+",
    hasGuarantee: false,
    guaranteeEligible: false,
    expiryDate: "2026-09-30",
  },
];

export const investors: Investor[] = [
  {
    id: "INV-A",
    name: "Meridian Capital Partners",
    status: "ACTIVE",
    currency: "USD",
    eligibleObligorIds: ["OBL001", "OBL002"],
    minTenorDays: 30,
    maxTenorDays: 180,
    minTicket: 1_000_000,
    maxTicket: 10_000_000,
    pricingFloorBps: 100,
    domicile: "US",
  },
  {
    id: "INV-B",
    name: "Harborline Funding LLC",
    status: "ACTIVE",
    currency: "USD",
    eligibleObligorIds: ["OBL001"],
    minTenorDays: 30,
    maxTenorDays: 120,
    minTicket: 1_000_000,
    maxTicket: 8_000_000,
    pricingFloorBps: 115,
    domicile: "US",
  },
];

export const insurancePolicies: InsurancePolicy[] = [
  {
    id: "POL-1",
    insurerName: "Atradius",
    policyNumber: "ATR-2026-0091",
    coveragePercent: 0.9,
    coveredObligorIds: ["OBL001", "OBL002", "OBL003"],
    maxTenorDays: 180,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    recourseToSeller: true,
    domicile: "NL",
    status: "ACTIVE",
  },
];

// ASR approved-obligor sublimits per seller. Note OBL001 (master line $40MM)
// is approved at $30MM under SELLER001's ASR but only $15MM under SELLER002's —
// the "different limit under different sellers" case. A transaction must fit
// under BOTH the master obligor line and the seller's ASR sublimit.
export const sellerObligorLimits: SellerObligorLimit[] = [
  { sellerId: "SELLER001", obligorId: "OBL001", approvedLimit: 30_000_000, maxTenorDays: 150 },
  { sellerId: "SELLER001", obligorId: "OBL002", approvedLimit: 20_000_000, maxTenorDays: 150 },
  { sellerId: "SELLER001", obligorId: "OBL003", approvedLimit: 12_000_000, maxTenorDays: 90 },
  // OBL004 is intentionally NOT on SELLER001's ASR approved list.
  { sellerId: "SELLER002", obligorId: "OBL001", approvedLimit: 15_000_000, maxTenorDays: 120 },
  { sellerId: "SELLER002", obligorId: "OBL003", approvedLimit: 8_000_000, maxTenorDays: 90 },
];

export const participationAgreements: ParticipationAgreement[] = [
  { investorId: "INV-A", sellerId: "SELLER001", executed: true },
  { investorId: "INV-A", sellerId: "SELLER002", executed: true },
  { investorId: "INV-B", sellerId: "SELLER001", executed: true },
  { investorId: "INV-B", sellerId: "SELLER002", executed: false }, // not executed
];

export const insuranceBuyerSublimits: InsuranceBuyerSublimit[] = [
  { policyId: "POL-1", obligorId: "OBL001", sublimit: 20_000_000 },
  { policyId: "POL-1", obligorId: "OBL002", sublimit: 15_000_000 },
  { policyId: "POL-1", obligorId: "OBL003", sublimit: 10_000_000 },
];

export const insuranceCountryLimits: InsuranceCountryLimit[] = [
  { policyId: "POL-1", country: "US", limit: 40_000_000 },
];

// Limits are the approved ceilings. Available capacity is never stored here —
// it is derived from these plus the matching Utilization row.
const rawLimits: Omit<Limit, "cdl">[] = [
  // Seller relationship limit — generous headroom.
  {
    id: "LMT-SEL-001",
    type: "SELLER",
    entityType: "SELLER",
    entityId: "SELLER001",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 100_000_000,
    maxTenorDays: 150,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // ASR limit — the binding constraint for SELLER001 (only $20MM free).
  {
    id: "LMT-ASR-001",
    type: "ASR",
    entityType: "SELLER",
    entityId: "SELLER001",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 75_000_000,
    maxTenorDays: 120,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // Seller + ASR for SELLER002.
  {
    id: "LMT-SEL-002",
    type: "SELLER",
    entityType: "SELLER",
    entityId: "SELLER002",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 40_000_000,
    maxTenorDays: 120,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  {
    id: "LMT-ASR-002",
    type: "ASR",
    entityType: "SELLER",
    entityId: "SELLER002",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 30_000_000,
    maxTenorDays: 120,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-08-18", // near-term — exercises the 30-day expiry flag
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // Obligor concentration limits.
  {
    id: "LMT-OBL-001",
    type: "OBLIGOR",
    entityType: "OBLIGOR",
    entityId: "OBL001",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 40_000_000,
    maxTenorDays: 180,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  {
    id: "LMT-OBL-002",
    type: "OBLIGOR",
    entityType: "OBLIGOR",
    entityId: "OBL002",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 25_000_000,
    maxTenorDays: 150,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-09-12", // near-term — exercises the 60-day expiry flag
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  {
    id: "LMT-OBL-003",
    type: "OBLIGOR",
    entityType: "OBLIGOR",
    entityId: "OBL003",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 15_000_000,
    maxTenorDays: 90, // tight obligor tenor — will bind on longer invoices
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  {
    id: "LMT-OBL-004",
    type: "OBLIGOR",
    entityType: "OBLIGOR",
    entityId: "OBL004",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 10_000_000,
    maxTenorDays: 120,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // Per-entity swinglines — temporary bank funding caps. Not every line carries
  // one (toggled on the setup screen): SELLER001 + OBL001 + OBL003 have them;
  // SELLER002, OBL002, OBL004 do not.
  {
    id: "LMT-SWL-SELLER001",
    type: "SWINGLINE",
    entityType: "SELLER",
    entityId: "SELLER001",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 70_000_000,
    maxTenorDays: 45,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  {
    id: "LMT-SWL-OBL001",
    type: "SWINGLINE",
    entityType: "OBLIGOR",
    entityId: "OBL001",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 30_000_000,
    maxTenorDays: 45,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  {
    id: "LMT-SWL-OBL003",
    type: "SWINGLINE",
    entityType: "OBLIGOR",
    entityId: "OBL003",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 5_000_000,
    maxTenorDays: 45,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-07-15", // already lapsed — exercises the EXPIRED flag
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // Risk Reimbursement Line (seller-level). Only SELLER001 has one.
  {
    id: "LMT-RRL-SELLER001",
    type: "RRL",
    entityType: "SELLER",
    entityId: "SELLER001",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 20_000_000,
    maxTenorDays: 180,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // RRL swingline — mirrors the RRL booking, separate from the regular swingline.
  {
    id: "LMT-RRLSWL-SELLER001",
    type: "RRL_SWINGLINE",
    entityType: "SELLER",
    entityId: "SELLER001",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 10_000_000,
    maxTenorDays: 180,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // Investor distribution capacity.
  {
    id: "LMT-INV-A",
    type: "INVESTOR",
    entityType: "INVESTOR",
    entityId: "INV-A",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 40_000_000,
    maxTenorDays: 180,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  {
    id: "LMT-INV-B",
    type: "INVESTOR",
    entityType: "INVESTOR",
    entityId: "INV-B",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 25_000_000,
    maxTenorDays: 120,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  },
  // Insurance policy capacity — coveragePercent drives the insured amount.
  {
    id: "LMT-INS-1",
    type: "INSURANCE",
    entityType: "INSURER_POLICY",
    entityId: "POL-1",
    programId: "PRG001",
    currency: "USD",
    approvedLimit: 50_000_000,
    maxTenorDays: 180,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
    coveragePercent: 0.9,
  },
];

// Every limit books exposure against a CDL (8-digit customer code). Entity-
// linked limits inherit their entity's CDL; investor/insurance lines get their
// own booking code. New limits added at runtime require an explicit CDL input.
const LIMIT_CDL: Record<string, string> = {
  "INV-A": "30010101",
  "INV-B": "30010201",
  "POL-1": "40020101",
};

function cdlForLimit(l: Omit<Limit, "cdl">): string {
  if (l.entityType === "SELLER") return sellers.find((s) => s.id === l.entityId)?.cdl ?? "";
  if (l.entityType === "OBLIGOR") return obligors.find((o) => o.id === l.entityId)?.cdl ?? "";
  return LIMIT_CDL[l.entityId] ?? "";
}

export const limits: Limit[] = rawLimits.map((l) => ({ ...l, cdl: cdlForLimit(l) }));

export const utilizations: Utilization[] = [
  // SELLER001 seller: $50MM consumed of $100MM → $50MM free.
  {
    limitId: "LMT-SEL-001",
    fundedOutstanding: 42_000_000,
    pendingApproved: 8_000_000,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  // SELLER001 ASR: $54MM consumed of $75MM → only $21MM free (binding).
  {
    limitId: "LMT-ASR-001",
    fundedOutstanding: 44_000_000,
    pendingApproved: 0,
    pendingSettlement: 10_000_000,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-SEL-002",
    fundedOutstanding: 12_000_000,
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-ASR-002",
    fundedOutstanding: 8_000_000,
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-OBL-001",
    fundedOutstanding: 10_000_000,
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-OBL-002",
    fundedOutstanding: 20_000_000,
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-OBL-003",
    fundedOutstanding: 13_500_000, // only $1.5MM free
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-OBL-004",
    fundedOutstanding: 2_000_000,
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-SWL-SELLER001",
    fundedOutstanding: 5_000_000, // core limit — always drawn; left with headroom
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-SWL-OBL001",
    fundedOutstanding: 2_000_000,
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-SWL-OBL003",
    fundedOutstanding: 0,
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-INV-A",
    fundedOutstanding: 15_000_000, // $25MM free
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-INV-B",
    fundedOutstanding: 5_000_000, // $20MM free
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
  {
    limitId: "LMT-INS-1",
    fundedOutstanding: 20_000_000, // $30MM insured capacity free
    pendingApproved: 0,
    pendingSettlement: 0,
    pendingRequested: 0,
    confirmedRepayments: 0,
  },
];

// Forward-booked reservations. Each marks exposure against both its seller and
// obligor (and both swinglines when usesSwingline). Dated around 2026-07 to
// 2026-11 so they populate the schedule calendar.
export const reservations: Reservation[] = [
  {
    id: "RSV-00001",
    sellerId: "SELLER001",
    obligorId: "OBL001",
    amount: 3_000_000,
    currency: "USD",
    valueDate: "2026-07-28",
    maturityDate: "2026-10-26",
    pricingBps: 120,
    tenorDays: 90,
    usesSwingline: true,
    status: "RESERVED",
    createdAt: "2026-07-20T09:00:00.000Z",
    createdBy: "u_ops",
  },
  {
    id: "RSV-00002",
    sellerId: "SELLER001",
    obligorId: "OBL002",
    amount: 2_000_000,
    currency: "USD",
    valueDate: "2026-08-06",
    maturityDate: "2026-11-04",
    pricingBps: 135,
    tenorDays: 90,
    usesSwingline: true, // SELLER001 carries a swingline
    status: "RESERVED",
    createdAt: "2026-07-20T09:05:00.000Z",
    createdBy: "u_ops",
  },
  {
    id: "RSV-00003",
    sellerId: "SELLER002",
    obligorId: "OBL001",
    amount: 2_000_000,
    currency: "USD",
    valueDate: "2026-08-18",
    maturityDate: "2026-10-17",
    pricingBps: 110,
    tenorDays: 60,
    usesSwingline: true, // OBL001 carries a swingline
    status: "RESERVED",
    createdAt: "2026-07-20T09:10:00.000Z",
    createdBy: "u_ops",
  },
  {
    id: "RSV-00004",
    sellerId: "SELLER002",
    obligorId: "OBL002",
    amount: 2_000_000,
    currency: "USD",
    valueDate: "2026-07-31",
    maturityDate: "2026-09-29",
    pricingBps: 150,
    tenorDays: 60,
    usesSwingline: false,
    status: "RESERVED",
    createdAt: "2026-07-20T09:15:00.000Z",
    createdBy: "u_ops",
  },
  {
    id: "RSV-00005",
    kind: "SWINGLINE",
    swinglineDirection: "REDUCTION",
    sellerId: "SELLER001",
    obligorId: "", // swingline movements are single-entity
    amount: 4_000_000,
    currency: "USD",
    valueDate: "2026-08-10",
    maturityDate: "2026-09-25",
    pricingBps: 0,
    tenorDays: 46,
    usesSwingline: true,
    status: "RESERVED",
    createdAt: "2026-07-20T09:20:00.000Z",
    createdBy: "u_ops",
  },
];
