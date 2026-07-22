import type {
  Program,
  Seller,
  Obligor,
  Limit,
  Utilization,
  LimitType,
  BatchResult,
  Investor,
  InsurancePolicy,
  ExceptionItem,
  AuditEntry,
  Reservation,
  LimitView,
  SellerObligorLimit,
  ParticipationAgreement,
  InsuranceBuyerSublimit,
  InsuranceCountryLimit,
  Currency,
  User,
  Role,
  Permission,
  SellerEntity,
  ObligorEntity,
  Country,
  RateRow,
  BaseRateType,
} from "@/lib/types";
import { toLimitView } from "@/lib/engine/availability";
import * as seed from "./seed";

// ---------------------------------------------------------------------------
// In-memory system of record for the MVP. One store instance, cached on
// globalThis so Next.js dev hot-reloads don't wipe uploaded batches. When this
// graduates to a real bank environment this module is the seam that gets
// swapped for Postgres — nothing else in the app talks to raw data.
// ---------------------------------------------------------------------------

interface Store {
  programs: Program[];
  sellers: Seller[];
  obligors: Obligor[];
  investors: Investor[];
  insurancePolicies: InsurancePolicy[];
  limits: Limit[];
  utilizations: Map<string, Utilization>; // keyed by limitId
  batches: BatchResult[];
  exceptions: ExceptionItem[];
  auditLog: AuditEntry[];
  reservations: Reservation[];
  sellerEntities: SellerEntity[];
  obligorEntities: ObligorEntity[];
  sellerObligorLimits: SellerObligorLimit[];
  participationAgreements: ParticipationAgreement[];
  insuranceBuyerSublimits: InsuranceBuyerSublimit[];
  insuranceCountryLimits: InsuranceCountryLimit[];
  users: User[];
  rolePermissions: Record<Role, Permission[]>;
  countries: Country[];
  rates: RateRow[];
  seq: number; // monotonic id counter
}

function seedStore(): Store {
  const utilizations = new Map<string, Utilization>();
  for (const u of seed.utilizations) utilizations.set(u.limitId, u);
  return {
    programs: structuredClone(seed.programs),
    sellers: structuredClone(seed.sellers),
    obligors: structuredClone(seed.obligors),
    investors: structuredClone(seed.investors),
    insurancePolicies: structuredClone(seed.insurancePolicies),
    limits: structuredClone(seed.limits),
    utilizations,
    batches: [],
    exceptions: [],
    auditLog: [],
    reservations: structuredClone(seed.reservations),
    sellerEntities: structuredClone(seed.sellerEntities),
    obligorEntities: structuredClone(seed.obligorEntities),
    sellerObligorLimits: structuredClone(seed.sellerObligorLimits),
    participationAgreements: structuredClone(seed.participationAgreements),
    insuranceBuyerSublimits: structuredClone(seed.insuranceBuyerSublimits),
    insuranceCountryLimits: structuredClone(seed.insuranceCountryLimits),
    users: structuredClone(seed.users),
    rolePermissions: structuredClone(seed.rolePermissions),
    countries: structuredClone(seed.countries),
    rates: structuredClone(seed.rates),
    // Start the id counter past the seeded reservation ids (RSV-0000N) so
    // generated ids never collide with seed ids.
    seq: seed.reservations.length,
  };
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${String(store.seq).padStart(5, "0")}`;
}

const g = globalThis as unknown as { __scfStore?: Store };
export const store: Store = (g.__scfStore ??= seedStore());

// ---------------------------------------------------------------------------
// Snapshot / hydrate for durable storage (see lib/data/persistence.ts). The
// store is JSON-safe except `utilizations`, which is a Map — we store it as an
// array of its values and rebuild the Map on load.
// ---------------------------------------------------------------------------

export function snapshotJson(): string {
  return JSON.stringify({ ...store, utilizations: [...store.utilizations.values()] });
}

export function hydrateStore(data: Record<string, unknown>): void {
  const util = new Map<string, Utilization>();
  for (const u of (data.utilizations as Utilization[]) ?? []) util.set(u.limitId, u);
  Object.assign(store, data, { utilizations: util });
}

// ---------------------------------------------------------------------------
// Read accessors — all lookups go through here.
// ---------------------------------------------------------------------------

export function getSeller(id: string): Seller | undefined {
  return store.sellers.find((s) => s.id === id);
}

export function allSellers(): Seller[] {
  return store.sellers;
}

export function getObligor(id: string): Obligor | undefined {
  return store.obligors.find((o) => o.id === id);
}

export function allObligors(): Obligor[] {
  return store.obligors;
}

// Eligible legal entities sharing a facility / group aggregate line.
export function sellerEntitiesOf(facilityId: string): SellerEntity[] {
  return store.sellerEntities.filter((e) => e.facilityId === facilityId);
}

export function obligorEntitiesOf(groupId: string): ObligorEntity[] {
  return store.obligorEntities.filter((e) => e.groupId === groupId);
}

export function getObligorEntity(id: string): ObligorEntity | undefined {
  return store.obligorEntities.find((e) => e.id === id);
}

// Inline edits from Data Management. The route whitelists the fields; here we
// apply them to the single stored record the engine + every view already read.
export function updateSellerEntity(
  id: string,
  patch: Partial<Pick<SellerEntity, "name" | "cdl" | "domicile">>,
): SellerEntity | undefined {
  const e = store.sellerEntities.find((x) => x.id === id);
  if (!e) return undefined;
  Object.assign(e, patch);
  return e;
}

export function updateObligorEntity(
  id: string,
  patch: Partial<
    Pick<
      ObligorEntity,
      | "name" | "cdl" | "bookingCdl" | "domicile" | "borrowerRating" | "borrowerRatingExpiry"
      | "insurancePolicyId" | "insuranceExpiry" | "pcg" | "pcgExpiry" | "pcgLimit"
    >
  >,
): ObligorEntity | undefined {
  const e = store.obligorEntities.find((x) => x.id === id);
  if (!e) return undefined;
  Object.assign(e, patch);
  return e;
}

export function allSellerEntities(): SellerEntity[] {
  return store.sellerEntities;
}

export function allObligorEntities(): ObligorEntity[] {
  return store.obligorEntities;
}

// ---------------------------------------------------------------------------
// Country enforceability register
// ---------------------------------------------------------------------------

export function allCountries(): Country[] {
  return store.countries;
}

export function eligibleCountries(): Country[] {
  return store.countries.filter((c) => c.eligible);
}

export function isCountryEligible(code: string): boolean {
  return store.countries.some((c) => c.code === code && c.eligible);
}

export function setCountryEligible(code: string, eligible: boolean): void {
  const c = store.countries.find((x) => x.code === code);
  if (c) c.eligible = eligible;
}

// ---------------------------------------------------------------------------
// Rate sheet
// ---------------------------------------------------------------------------

export function getRates(): RateRow[] {
  return store.rates;
}

// Replace all rows for a given rate type with a freshly uploaded set.
export function replaceRates(rateType: BaseRateType, rows: RateRow[]): void {
  store.rates = store.rates.filter((r) => r.rateType !== rateType).concat(rows);
}

// Resolve the used base rate (offer) for a type + tenor — closest tenor wins.
export function resolveBaseRate(rateType: BaseRateType, tenorDays: number): number | undefined {
  const rows = store.rates.filter((r) => r.rateType === rateType && !r.error);
  if (rows.length === 0) return undefined;
  let best = rows[0];
  for (const r of rows) {
    if (Math.abs(r.tenorDays - tenorDays) < Math.abs(best.tenorDays - tenorDays)) best = r;
  }
  return best.offer;
}

// Every entity whose domicile is not on the eligible-country register — the
// enforceability monitoring exceptions.
export function domicileExceptions(): Array<{
  kind: string;
  name: string;
  domicile: string;
}> {
  const out: Array<{ kind: string; name: string; domicile: string }> = [];
  const flag = (kind: string, name: string, domicile: string) => {
    if (domicile && !isCountryEligible(domicile)) out.push({ kind, name, domicile });
  };
  for (const e of store.sellerEntities) flag("Seller entity", e.name, e.domicile);
  for (const e of store.obligorEntities) flag("Obligor entity", e.name, e.domicile);
  for (const i of store.investors) flag("Investor", i.name, i.domicile);
  for (const p of store.insurancePolicies) flag("Insurer", p.insurerName, p.domicile);
  return out;
}

export function getProgram(id: string): Program | undefined {
  return store.programs.find((p) => p.id === id);
}

export function getInvestor(id: string): Investor | undefined {
  return store.investors.find((i) => i.id === id);
}

export function getInsurancePolicy(id: string): InsurancePolicy | undefined {
  return store.insurancePolicies.find((p) => p.id === id);
}

export function activeInvestors(): Investor[] {
  return store.investors.filter((i) => i.status === "ACTIVE");
}

export function activePolicies(): InsurancePolicy[] {
  return store.insurancePolicies.filter((p) => p.status === "ACTIVE");
}

// ASR approved-obligor sublimit for a seller/obligor pair (undefined = obligor
// is not on that seller's ASR approved list).
export function sellerObligorLimit(
  sellerId: string,
  obligorId: string,
): SellerObligorLimit | undefined {
  return store.sellerObligorLimits.find(
    (x) => x.sellerId === sellerId && x.obligorId === obligorId,
  );
}

// All obligor groups approved under a seller's ASR.
export function sellerObligorLimitsForSeller(sellerId: string): SellerObligorLimit[] {
  return store.sellerObligorLimits.filter((x) => x.sellerId === sellerId);
}

// Inline edit of an ASR approved-obligor sublimit (amount / max tenor). Feeds
// the ASR checks in checkDiscount; the sublimit is the single stored record.
export function updateSellerObligorLimit(
  sellerId: string,
  obligorId: string,
  patch: Partial<Pick<SellerObligorLimit, "approvedLimit" | "maxTenorDays">>,
): SellerObligorLimit | undefined {
  const sol = store.sellerObligorLimits.find(
    (x) => x.sellerId === sellerId && x.obligorId === obligorId,
  );
  if (!sol) return undefined;
  Object.assign(sol, patch);
  return sol;
}

// Usage of an ASR sublimit = active reservations for that seller/obligor pair.
export function sellerObligorUsage(sellerId: string, obligorId: string): number {
  return store.reservations
    .filter(
      (r) =>
        r.status === "RESERVED" &&
        r.sellerId === sellerId &&
        r.obligorId === obligorId,
    )
    .reduce((a, r) => a + r.amount, 0);
}

export function participationAgreement(
  investorId: string,
  sellerId: string,
): ParticipationAgreement | undefined {
  return store.participationAgreements.find(
    (a) => a.investorId === investorId && a.sellerId === sellerId,
  );
}

export function insuranceBuyerSublimit(
  policyId: string,
  obligorId: string,
): InsuranceBuyerSublimit | undefined {
  return store.insuranceBuyerSublimits.find(
    (x) => x.policyId === policyId && x.obligorId === obligorId,
  );
}

export function insuranceCountryLimit(
  policyId: string,
  country: string,
): InsuranceCountryLimit | undefined {
  return store.insuranceCountryLimits.find(
    (x) => x.policyId === policyId && x.country === country,
  );
}

export function getUtilization(limitId: string): Utilization {
  return (
    store.utilizations.get(limitId) ?? {
      limitId,
      fundedOutstanding: 0,
      pendingApproved: 0,
      pendingSettlement: 0,
      pendingRequested: 0,
      confirmedRepayments: 0,
    }
  );
}

// Find the active limit of a given type for an entity (seller/obligor/program).
export function findLimit(
  type: LimitType,
  entityId: string,
): Limit | undefined {
  return store.limits.find(
    (l) => l.type === type && l.entityId === entityId && l.status === "ACTIVE",
  );
}

// Sum of active (RESERVED) reservations booked against a given limit. This is
// what folds the forward book into the same availability formula the batch
// engine uses — reservations reduce capacity everywhere.
// asOf (ISO date) gives the time-phased view: a reservation is on the books only
// within its [valueDate, maturityDate] window. Omitting asOf counts every active
// reservation (the aggregate committed view) — the default everywhere else.
export function reservationConsumedForLimit(limit: Limit, asOf?: string): number {
  const active = store.reservations.filter(
    (r) =>
      r.status === "RESERVED" &&
      (!asOf || (r.valueDate <= asOf && r.maturityDate >= asOf)),
  );
  switch (limit.type) {
    case "SELLER":
      // Seller line takes the amount net of any RRL portion.
      return active
        .filter((r) => r.sellerId === limit.entityId)
        .reduce((a, r) => a + r.amount - (r.rrlAmount ?? 0), 0);
    case "RRL":
      return active
        .filter((r) => r.sellerId === limit.entityId)
        .reduce((a, r) => a + (r.rrlAmount ?? 0), 0);
    case "OBLIGOR":
      // Obligor line takes the FULL amount (RRL split does not reduce it).
      return sum(active.filter((r) => r.obligorId === limit.entityId));
    case "SWINGLINE": {
      // A swingline is a core limit. Discount reservations draw it; standalone
      // SWINGLINE reservations adjust it (reduction draws down available,
      // increase releases it).
      const matches = (r: Reservation) =>
        limit.entityType === "SELLER"
          ? r.sellerId === limit.entityId
          : limit.entityType === "OBLIGOR"
            ? r.obligorId === limit.entityId
            : false;
      let total = 0;
      for (const r of active) {
        if (!matches(r)) continue;
        if (r.kind === "SWINGLINE") {
          total += r.swinglineDirection === "INCREASE" ? -r.amount : r.amount;
        } else {
          // Discount reservation draws the swingline. A seller swingline draws
          // the amount NET of the RRL portion (matching the seller line); an
          // obligor swingline draws the full amount (obligor books it all).
          total += limit.entityType === "SELLER" ? r.amount - (r.rrlAmount ?? 0) : r.amount;
        }
      }
      return total;
    }
    // ASR is consumed at actual discounting, not by forward reservations; and
    // investor/insurance capacity is a funding-side control, not a reservation.
    default:
      return 0;
  }
}

function sum(rs: Reservation[]): number {
  return rs.reduce((a, r) => a + r.amount, 0);
}

// The single reservation-aware view of a limit — used by every screen. Pass
// asOf for the time-phased (as-of-date) view.
export function viewLimit(limit: Limit, asOf?: string): LimitView {
  return toLimitView(limit, getUtilization(limit.id), reservationConsumedForLimit(limit, asOf));
}

export function limitViews(asOf?: string) {
  return store.limits.map((l) => viewLimit(l, asOf));
}

export function getBatches(): BatchResult[] {
  return store.batches;
}

export function getBatch(id: string): BatchResult | undefined {
  return store.batches.find((b) => b.batchId === id);
}

export function saveBatch(batch: BatchResult): void {
  store.batches.unshift(batch);
}

// Replace a batch in place (used by re-run eligibility), preserving position.
export function updateBatch(batch: BatchResult): void {
  const i = store.batches.findIndex((b) => b.batchId === batch.batchId);
  if (i >= 0) store.batches[i] = batch;
  else store.batches.unshift(batch);
}

// ---------------------------------------------------------------------------
// Exceptions (maker-checker workflow)
// ---------------------------------------------------------------------------

// Create OPEN exception items for every EXCEPTION_REQUIRED invoice in a batch.
// Called once when the batch is uploaded; the maker is the uploader.
export function syncExceptionsForBatch(
  batch: BatchResult,
  makerUserId: string,
): void {
  for (const r of batch.results) {
    if (r.status !== "EXCEPTION_REQUIRED") continue;
    const blocking = r.checks.find((c) => c.severity === "ORANGE");
    store.exceptions.push({
      id: nextId("EXC"),
      batchId: batch.batchId,
      invoiceNumber: r.invoice.invoiceNumber,
      sellerId: r.invoice.sellerId,
      obligorId: r.invoice.obligorId,
      amount: r.invoice.amount,
      checkName: blocking?.checkName ?? "UNKNOWN",
      reason: blocking?.message ?? "",
      breachAmount: blocking?.breachAmount ?? 0,
      status: "OPEN",
      makerUserId,
    });
  }
}

export function getExceptions(): ExceptionItem[] {
  return store.exceptions;
}

export function getException(id: string): ExceptionItem | undefined {
  return store.exceptions.find((e) => e.id === id);
}

export function getExceptionsForBatch(batchId: string): ExceptionItem[] {
  return store.exceptions.filter((e) => e.batchId === batchId);
}

// Invoice numbers whose exception a checker has APPROVED — passed to the engine
// on re-run so the override consumes capacity and the invoice funds.
export function getApprovedOverrides(batchId: string): Set<string> {
  return new Set(
    store.exceptions
      .filter((e) => e.batchId === batchId && e.status === "APPROVED")
      .map((e) => e.invoiceNumber),
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export function addAudit(entry: Omit<AuditEntry, "id" | "timestamp">): void {
  store.auditLog.unshift({
    ...entry,
    id: nextId("AUD"),
    timestamp: new Date().toISOString(),
  });
}

export function getAuditLog(): AuditEntry[] {
  return store.auditLog;
}

// ---------------------------------------------------------------------------
// Users, roles & permissions (runtime-editable authority model)
// ---------------------------------------------------------------------------

export function getUsers(): User[] {
  return store.users;
}

export function storeGetUserById(id: string): User | undefined {
  return store.users.find((u) => u.id === id);
}

export function permissionsForRole(role: Role): Permission[] {
  return store.rolePermissions[role] ?? [];
}

export function roleHasPermission(role: Role, perm: Permission): boolean {
  return permissionsForRole(role).includes(perm);
}

export function rolePermissionMap(): Record<Role, Permission[]> {
  return store.rolePermissions;
}

export function setRolePermission(
  role: Role,
  perm: Permission,
  enabled: boolean,
): void {
  const list = store.rolePermissions[role] ?? [];
  const has = list.includes(perm);
  if (enabled && !has) store.rolePermissions[role] = [...list, perm];
  if (!enabled && has)
    store.rolePermissions[role] = list.filter((p) => p !== perm);
}

export function setUserRole(userId: string, role: Role): void {
  const u = storeGetUserById(userId);
  if (u) u.role = role;
}

// ---------------------------------------------------------------------------
// Edit an existing limit (amount, tenor, expiry, status).
// ---------------------------------------------------------------------------

export function updateLimit(
  id: string,
  patch: Partial<Pick<Limit, "approvedLimit" | "maxTenorDays" | "expiryDate" | "status" | "cdl">>,
): Limit | undefined {
  const l = store.limits.find((x) => x.id === id);
  if (!l) return undefined;
  if (patch.approvedLimit != null) l.approvedLimit = patch.approvedLimit;
  if (patch.maxTenorDays != null) l.maxTenorDays = patch.maxTenorDays;
  if (patch.expiryDate != null) l.expiryDate = patch.expiryDate;
  if (patch.status != null) l.status = patch.status;
  if (patch.cdl != null) l.cdl = patch.cdl;
  return l;
}

// ---------------------------------------------------------------------------
// Reservations (forward book)
// ---------------------------------------------------------------------------

export function getReservations(): Reservation[] {
  return store.reservations;
}

export function getReservation(id: string): Reservation | undefined {
  return store.reservations.find((r) => r.id === id);
}

export function addReservation(
  r: Omit<Reservation, "id" | "createdAt">,
): Reservation {
  const created: Reservation = {
    ...r,
    id: nextId("RSV"),
    createdAt: new Date().toISOString(),
  };
  store.reservations.unshift(created);
  return created;
}

export function cancelReservation(id: string): Reservation | undefined {
  const r = getReservation(id);
  if (r) r.status = "CANCELLED";
  return r;
}

// ---------------------------------------------------------------------------
// Setup mutations (assign CDL, edit limits, toggle swingline)
// ---------------------------------------------------------------------------

export function setCdl(
  entityType: "SELLER" | "OBLIGOR",
  entityId: string,
  cdl: string,
): void {
  const e =
    entityType === "SELLER" ? getSeller(entityId) : getObligor(entityId);
  if (e) e.cdl = cdl;
}

export function setLimitAmount(limitId: string, amount: number): void {
  const l = store.limits.find((x) => x.id === limitId);
  if (l) l.approvedLimit = amount;
}

// ---------------------------------------------------------------------------
// Add to the register — create new limits and entities.
// ---------------------------------------------------------------------------

export interface NewLimitInput {
  type: LimitType;
  cdl: string;
  entityType: Limit["entityType"];
  entityId: string;
  approvedLimit: number;
  maxTenorDays: number;
  expiryDate: string;
  currency?: Currency;
}

export function addLimit(input: NewLimitInput): Limit {
  const seq = store.limits.filter((l) => l.type === input.type).length + 1;
  const limit: Limit = {
    id: `LMT-${input.type}-${String(seq).padStart(3, "0")}`,
    type: input.type,
    cdl: input.cdl,
    entityType: input.entityType,
    entityId: input.entityId,
    programId: "PRG001",
    currency: input.currency ?? "USD",
    approvedLimit: input.approvedLimit,
    maxTenorDays: input.maxTenorDays,
    effectiveDate: "2026-01-01",
    expiryDate: input.expiryDate,
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  };
  store.limits.push(limit);
  return limit;
}

export function addSeller(input: {
  name: string;
  cdl: string;
  creditLimit: number;
  maxTenorDays: number;
  expiryDate: string;
}): Seller {
  const id = `SELLER${String(store.sellers.length + 1).padStart(3, "0")}`;
  const seller: Seller = {
    id,
    name: input.name,
    cdl: input.cdl,
    status: "ACTIVE",
    eligible: true,
    programId: "PRG001",
    currency: "USD",
    internalRating: "NR",
    asrRating: "4A",
    asrExpiry: input.expiryDate,
    borrowerRating: "NR",
    borrowerRatingExpiry: input.expiryDate,
    guarantor: "None",
    gcarsNumber: "",
    minPricingBps: 0,
    rrlEnabled: false,
    rrlLimit: 0,
    rrlExpiry: "",
    documents: [],
  };
  store.sellers.push(seller);
  addLimit({
    type: "SELLER",
    cdl: input.cdl,
    entityType: "SELLER",
    entityId: id,
    approvedLimit: input.creditLimit,
    maxTenorDays: input.maxTenorDays,
    expiryDate: input.expiryDate,
  });
  return seller;
}

export function addObligor(input: {
  name: string;
  cdl: string;
  country: string;
  masterLimit: number;
  maxTenorDays: number;
  expiryDate: string;
}): Obligor {
  const id = `OBL${String(store.obligors.length + 1).padStart(3, "0")}`;
  const obligor: Obligor = {
    id,
    name: input.name,
    cdl: input.cdl,
    status: "ACTIVE",
    eligible: true,
    country: input.country || "US",
    sector: "",
    internalRating: "NR",
    hasGuarantee: false,
    guaranteeEligible: false,
  };
  store.obligors.push(obligor);
  addLimit({
    type: "OBLIGOR",
    cdl: input.cdl,
    entityType: "OBLIGOR",
    entityId: id,
    approvedLimit: input.masterLimit,
    maxTenorDays: input.maxTenorDays,
    expiryDate: input.expiryDate,
  });
  return obligor;
}

export function addSellerObligorLimit(
  sellerId: string,
  obligorId: string,
  approvedLimit: number,
  maxTenorDays: number,
): void {
  const existing = store.sellerObligorLimits.find(
    (x) => x.sellerId === sellerId && x.obligorId === obligorId,
  );
  if (existing) {
    existing.approvedLimit = approvedLimit;
    existing.maxTenorDays = maxTenorDays;
  } else {
    store.sellerObligorLimits.push({ sellerId, obligorId, approvedLimit, maxTenorDays });
  }
}

// An ACTIVE swingline limit for an entity, if one exists.
export function entitySwingline(
  entityType: "SELLER" | "OBLIGOR",
  entityId: string,
): Limit | undefined {
  return store.limits.find(
    (l) =>
      l.type === "SWINGLINE" &&
      l.entityType === entityType &&
      l.entityId === entityId &&
      l.status === "ACTIVE",
  );
}

// Toggle a swingline on/off for an entity, creating the limit on first enable.
export function setEntitySwingline(
  entityType: "SELLER" | "OBLIGOR",
  entityId: string,
  enabled: boolean,
  amount: number,
): void {
  const existing = store.limits.find(
    (l) =>
      l.type === "SWINGLINE" &&
      l.entityType === entityType &&
      l.entityId === entityId,
  );
  if (existing) {
    existing.status = enabled ? "ACTIVE" : "SUSPENDED";
    if (enabled) existing.approvedLimit = amount;
    return;
  }
  if (!enabled) return;
  const entity =
    entityType === "SELLER" ? getSeller(entityId) : undefined;
  const cdl =
    entityType === "SELLER"
      ? (getSeller(entityId)?.cdl ?? "")
      : (getObligor(entityId)?.cdl ?? "");
  store.limits.push({
    id: `LMT-SWL-${entityId}`,
    type: "SWINGLINE",
    cdl,
    entityType,
    entityId,
    programId: entity?.programId ?? "PRG001",
    currency: "USD",
    approvedLimit: amount,
    maxTenorDays: 45,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    status: "ACTIVE",
    warnThreshold: 0.85,
    exceptionThreshold: 1.0,
  });
}
