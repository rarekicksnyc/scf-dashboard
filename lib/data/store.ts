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
  sellerObligorLimits: SellerObligorLimit[];
  participationAgreements: ParticipationAgreement[];
  insuranceBuyerSublimits: InsuranceBuyerSublimit[];
  insuranceCountryLimits: InsuranceCountryLimit[];
  users: User[];
  rolePermissions: Record<Role, Permission[]>;
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
    sellerObligorLimits: structuredClone(seed.sellerObligorLimits),
    participationAgreements: structuredClone(seed.participationAgreements),
    insuranceBuyerSublimits: structuredClone(seed.insuranceBuyerSublimits),
    insuranceCountryLimits: structuredClone(seed.insuranceCountryLimits),
    users: structuredClone(seed.users),
    rolePermissions: structuredClone(seed.rolePermissions),
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
export function reservationConsumedForLimit(limit: Limit): number {
  const active = store.reservations.filter((r) => r.status === "RESERVED");
  switch (limit.type) {
    case "SELLER":
      return sum(active.filter((r) => r.sellerId === limit.entityId));
    case "OBLIGOR":
      return sum(active.filter((r) => r.obligorId === limit.entityId));
    case "SWINGLINE":
      if (limit.entityType === "SELLER") {
        return sum(active.filter((r) => r.usesSwingline && r.sellerId === limit.entityId));
      }
      if (limit.entityType === "OBLIGOR") {
        return sum(active.filter((r) => r.usesSwingline && r.obligorId === limit.entityId));
      }
      return 0;
    // ASR is consumed at actual discounting, not by forward reservations; and
    // investor/insurance capacity is a funding-side control, not a reservation.
    default:
      return 0;
  }
}

function sum(rs: Reservation[]): number {
  return rs.reduce((a, r) => a + r.amount, 0);
}

// The single reservation-aware view of a limit — used by every screen.
export function viewLimit(limit: Limit): LimitView {
  return toLimitView(limit, getUtilization(limit.id), reservationConsumedForLimit(limit));
}

export function limitViews() {
  return store.limits.map(viewLimit);
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
  patch: Partial<Pick<Limit, "approvedLimit" | "maxTenorDays" | "expiryDate" | "status">>,
): Limit | undefined {
  const l = store.limits.find((x) => x.id === id);
  if (!l) return undefined;
  if (patch.approvedLimit != null) l.approvedLimit = patch.approvedLimit;
  if (patch.maxTenorDays != null) l.maxTenorDays = patch.maxTenorDays;
  if (patch.expiryDate != null) l.expiryDate = patch.expiryDate;
  if (patch.status != null) l.status = patch.status;
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
  store.limits.push({
    id: `LMT-SWL-${entityId}`,
    type: "SWINGLINE",
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
