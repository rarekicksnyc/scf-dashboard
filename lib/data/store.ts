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
  ParentCompanyGuarantee,
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
  AsOf,
  DateWindow,
  DocTemplate,
  DocTemplateType,
} from "@/lib/types";
import { DEFAULT_TEMPLATES } from "@/lib/data/templates";
import { toLimitView, computeConsumed } from "@/lib/engine/availability";
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
  parentGuarantees: ParentCompanyGuarantee[];
  insuranceBuyerSublimits: InsuranceBuyerSublimit[];
  insuranceCountryLimits: InsuranceCountryLimit[];
  users: User[];
  rolePermissions: Record<Role, Permission[]>;
  countries: Country[];
  rates: RateRow[];
  docTemplates: DocTemplate[];
  seq: number; // monotonic id counter
  migrations?: string[]; // one-time data fixes already applied to this store
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
    parentGuarantees: [],
    insuranceBuyerSublimits: structuredClone(seed.insuranceBuyerSublimits),
    insuranceCountryLimits: structuredClone(seed.insuranceCountryLimits),
    users: structuredClone(seed.users),
    rolePermissions: structuredClone(seed.rolePermissions),
    countries: structuredClone(seed.countries),
    rates: structuredClone(seed.rates),
    docTemplates: structuredClone(DEFAULT_TEMPLATES),
    // Start the id counter past the seeded reservation ids (RSV-0000N) so
    // generated ids never collide with seed ids.
    seq: seed.reservations.length,
    migrations: [],
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

// One-time data fixes applied on top of a hydrated snapshot. Each runs at most
// once (tracked in store.migrations) so it corrects existing persisted state but
// never fights a later change made through the UI.
export function runMigrations(): void {
  if (!store.migrations) store.migrations = [];
  const applied = new Set(store.migrations);
  const once = (id: string, fn: () => void) => {
    if (applied.has(id)) return;
    fn();
    store.migrations!.push(id);
  };

  // Product Managers (alongside Administrators) may manage roles and users.
  once("pm-manage-roles-2026-07", () => {
    const pm = store.rolePermissions.PRODUCT_MANAGER ?? [];
    if (!pm.includes("MANAGE_ROLES")) {
      store.rolePermissions.PRODUCT_MANAGER = [...pm, "MANAGE_ROLES"];
    }
  });
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

// Mark a seller's legal-doc checklist item RECEIVED (called when a matching
// document is uploaded to the repository). Adds the item if the seller doesn't
// list it yet.
export function markSellerDocReceived(sellerId: string, docType: string): void {
  const s = store.sellers.find((x) => x.id === sellerId);
  if (!s) return;
  const doc = s.documents.find((d) => d.type === docType);
  if (doc) doc.status = "RECEIVED";
  else s.documents.push({ type: docType, status: "RECEIVED" });
}

// Inline edit of an obligor group (currently the group-level expiry date).
// Edit seller facility fields (name changes, ratings + their expiries, GCARS,
// guarantor, min pricing, RRL enable/limit/expiry, status/eligibility). The
// seller-line / swingline / RRL limit amounts + expiries live on the limits and
// are edited in the limit register (single source).
export function updateSeller(
  id: string,
  patch: Partial<
    Pick<
      Seller,
      | "name" | "cdl" | "asrRating" | "asrExpiry" | "borrowerRating" | "borrowerRatingExpiry"
      | "gcarsNumber" | "guarantor" | "minPricingBps" | "rrlEnabled" | "rrlLimit" | "rrlExpiry"
      | "status" | "eligible" | "internalRating"
    >
  >,
): Seller | undefined {
  const s = store.sellers.find((x) => x.id === id);
  if (!s) return undefined;
  Object.assign(s, patch);
  return s;
}

export function updateObligor(
  id: string,
  patch: Partial<
    Pick<
      Obligor,
      | "name" | "cdl" | "country" | "sector" | "expiryDate" | "status" | "eligible"
      | "hasGuarantee" | "guaranteeEligible" | "internalRating"
    >
  >,
): Obligor | undefined {
  const o = store.obligors.find((x) => x.id === id);
  if (!o) return undefined;
  Object.assign(o, patch);
  return o;
}

// ---------------------------------------------------------------------------
// Parent Company Guarantees (PCG)
// ---------------------------------------------------------------------------

export function listParentGuarantees(): ParentCompanyGuarantee[] {
  return store.parentGuarantees;
}

export function addParentGuarantee(input: Omit<ParentCompanyGuarantee, "id">): ParentCompanyGuarantee {
  const pcg: ParentCompanyGuarantee = { ...input, id: nextId("PCG") };
  store.parentGuarantees.push(pcg);
  return pcg;
}

export function updateParentGuarantee(
  id: string,
  patch: Partial<Omit<ParentCompanyGuarantee, "id">>,
): ParentCompanyGuarantee | undefined {
  const p = store.parentGuarantees.find((x) => x.id === id);
  if (!p) return undefined;
  Object.assign(p, patch);
  // A continuing guarantee is indefinite — it never carries an expiry.
  if (p.continuing) p.expiryDate = undefined;
  return p;
}

export function removeParentGuarantee(id: string): boolean {
  const i = store.parentGuarantees.findIndex((x) => x.id === id);
  if (i < 0) return false;
  store.parentGuarantees.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Document / email templates (editable; a seller copy overrides the default)
// ---------------------------------------------------------------------------

export function listDocTemplates(): DocTemplate[] {
  return store.docTemplates;
}

// The effective template for a type — the seller's override if one exists,
// otherwise the default.
export function getDocTemplate(type: DocTemplateType, sellerId?: string): DocTemplate | undefined {
  if (sellerId) {
    const override = store.docTemplates.find((t) => t.type === type && t.sellerId === sellerId);
    if (override) return override;
  }
  return store.docTemplates.find((t) => t.type === type && !t.sellerId);
}

export function upsertDocTemplate(input: { type: DocTemplateType; sellerId?: string; subject?: string; body: string }): DocTemplate {
  const key = input.sellerId ?? "";
  const existing = store.docTemplates.find((t) => t.type === input.type && (t.sellerId ?? "") === key);
  if (existing) {
    existing.body = input.body;
    if (input.subject !== undefined) existing.subject = input.subject;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const t: DocTemplate = {
    id: nextId("TMPL"),
    type: input.type,
    sellerId: input.sellerId || undefined,
    subject: input.subject,
    body: input.body,
    updatedAt: new Date().toISOString(),
  };
  store.docTemplates.push(t);
  return t;
}

// Delete a seller override (defaults can be edited but not removed).
export function deleteDocTemplate(id: string): boolean {
  const t = store.docTemplates.find((x) => x.id === id);
  if (!t || !t.sellerId) return false;
  store.docTemplates.splice(store.docTemplates.indexOf(t), 1);
  return true;
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

// Add a legal entity under an existing seller (facility) group.
export function addSellerEntity(input: { facilityId: string; name: string; cdl: string; domicile: string }): SellerEntity {
  if (!store.sellers.some((s) => s.id === input.facilityId)) throw new Error("Unknown seller group.");
  const e: SellerEntity = { id: nextId("SE"), facilityId: input.facilityId, name: input.name.trim(), cdl: input.cdl, domicile: input.domicile || "US" };
  store.sellerEntities.push(e);
  return e;
}

// Add a legal entity under an existing obligor group.
export function addObligorEntity(input: { groupId: string; name: string; cdl: string; bookingCdl?: string; domicile: string }): ObligorEntity {
  if (!store.obligors.some((o) => o.id === input.groupId)) throw new Error("Unknown obligor group.");
  const e: ObligorEntity = {
    id: nextId("OE"),
    groupId: input.groupId,
    name: input.name.trim(),
    cdl: input.cdl,
    bookingCdl: input.bookingCdl || input.cdl,
    domicile: input.domicile || "US",
    borrowerRating: "NR",
    borrowerRatingExpiry: "",
    pcg: "N/A",
  };
  store.obligorEntities.push(e);
  return e;
}

// Remove an eligible legal entity. The aggregate line stays; only this named
// entity is dropped. Reservations key on the seller/obligor group, not the
// entity, so nothing is orphaned.
export function removeSellerEntity(id: string): boolean {
  const i = store.sellerEntities.findIndex((x) => x.id === id);
  if (i < 0) return false;
  store.sellerEntities.splice(i, 1);
  return true;
}

export function removeObligorEntity(id: string): boolean {
  const i = store.obligorEntities.findIndex((x) => x.id === id);
  if (i < 0) return false;
  store.obligorEntities.splice(i, 1);
  return true;
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

// Add a country to the enforceability register. Codes are normalised to an
// uppercase 2-letter ISO code; a duplicate code is rejected. New countries
// default to whatever eligibility is passed (off unless an opinion is on file).
export function addCountry(code: string, name: string, eligible = false): Country {
  const norm = code.trim().toUpperCase();
  if (store.countries.some((c) => c.code === norm)) {
    throw new Error(`Country ${norm} already exists.`);
  }
  const country: Country = { code: norm, name: name.trim(), eligible };
  store.countries.push(country);
  return country;
}

// Remove a country entirely. Blocked when any seller or obligor entity is still
// domiciled there (or an obligor is registered to that country), so the register
// can never point an entity at a country that no longer exists.
export function removeCountry(code: string): void {
  const norm = code.trim().toUpperCase();
  const inUse =
    store.obligors.some((o) => o.country === norm) ||
    store.sellerEntities.some((e) => e.domicile === norm) ||
    store.obligorEntities.some((e) => e.domicile === norm);
  if (inUse) {
    throw new Error(`Country ${norm} is still assigned to one or more sellers, obligors, or entities.`);
  }
  const i = store.countries.findIndex((c) => c.code === norm);
  if (i < 0) throw new Error(`Country ${norm} not found.`);
  store.countries.splice(i, 1);
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

// Remove an obligor group from a seller's ASR approved list. Blocked while an
// active reservation exists for that seller/obligor pair, so a live forward
// book can never be pointed at a sublimit that no longer exists.
export function removeSellerObligorLimit(sellerId: string, obligorId: string): void {
  const active = store.reservations.some(
    (r) => r.status === "RESERVED" && r.sellerId === sellerId && r.obligorId === obligorId,
  );
  if (active) {
    throw new Error("This obligor has active reservations under the seller — cancel them first.");
  }
  const i = store.sellerObligorLimits.findIndex(
    (x) => x.sellerId === sellerId && x.obligorId === obligorId,
  );
  if (i < 0) throw new Error("ASR sublimit not found.");
  store.sellerObligorLimits.splice(i, 1);
}

// Usage of an ASR sublimit = active reservations for that seller/obligor pair.
// Time-phased like every other limit: pass the transaction window so only
// reservations whose own [valueDate, maturityDate] overlaps it count — a future
// reservation does not reduce an earlier transaction's ASR sublimit capacity.
export function sellerObligorUsage(sellerId: string, obligorId: string, asOf?: AsOf): number {
  const w = toWindow(asOf);
  return store.reservations
    .filter(
      (r) =>
        r.status === "RESERVED" &&
        r.sellerId === sellerId &&
        r.obligorId === obligorId &&
        r.scope !== "SELLER_ONLY" && // ASR follows the obligor side
        reservationInWindow(r, w),
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

// Normalise an as-of argument to a {from,to} window. A bare ISO date is the
// instant view (window collapses to that single day); a {from,to} pair is a
// span. Undefined means "no time filter" (aggregate every active reservation).
function toWindow(asOf?: AsOf): DateWindow | undefined {
  if (!asOf) return undefined;
  return typeof asOf === "string" ? { from: asOf, to: asOf } : asOf;
}

// True when a reservation's [valueDate, maturityDate] overlaps the window. This
// is the core of time-phasing: a reservation is "on the books" for a given
// window only if the two spans intersect. For an instant window [d,d] this is
// exactly valueDate <= d <= maturityDate (the old single-date behaviour).
function reservationInWindow(r: Reservation, w?: DateWindow): boolean {
  if (!w) return true;
  return r.valueDate <= w.to && r.maturityDate >= w.from;
}

// Sum of active (RESERVED) reservations booked against a given limit. This is
// what folds the forward book into the same availability formula the batch
// engine uses — reservations reduce capacity everywhere.
// asOf gives the time-phased view: a reservation is on the books only when its
// [valueDate, maturityDate] overlaps the window (an ISO date = the instant
// view). Omitting asOf counts every active reservation (aggregate committed).
export function reservationConsumedForLimit(limit: Limit, asOf?: AsOf): number {
  const w = toWindow(asOf);
  const active = store.reservations.filter(
    (r) => r.status === "RESERVED" && reservationInWindow(r, w),
  );
  // Discount reservations draw the credit lines; standalone SWINGLINE movements
  // only touch the swingline (handled in the SWINGLINE case / swinglineAdjustmentNet).
  // Scope gates which side a reservation blocks: SELLER_ONLY skips the obligor
  // side, OBLIGOR_ONLY skips the seller side (undefined = BOTH).
  const discounts = active.filter((r) => r.kind !== "SWINGLINE");
  switch (limit.type) {
    case "SELLER":
      // Seller line takes the amount net of any RRL portion.
      return discounts
        .filter((r) => r.sellerId === limit.entityId && r.scope !== "OBLIGOR_ONLY")
        .reduce((a, r) => a + r.amount - (r.rrlAmount ?? 0), 0);
    case "RRL":
      return discounts
        .filter((r) => r.sellerId === limit.entityId && r.scope !== "OBLIGOR_ONLY")
        .reduce((a, r) => a + (r.rrlAmount ?? 0), 0);
    case "OBLIGOR":
      // Obligor line takes the FULL amount (RRL split does not reduce it).
      return sum(discounts.filter((r) => r.obligorId === limit.entityId && r.scope !== "SELLER_ONLY"));
    case "SWINGLINE": {
      // A swingline is a core limit. Discount reservations draw it; standalone
      // SWINGLINE reservations adjust it (reduction draws down available,
      // increase releases it).
      const onSeller = limit.entityType === "SELLER";
      const matches = (r: Reservation) =>
        onSeller
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
          // A discount reservation draws the swingline only on the side it
          // blocks. A seller swingline draws the amount NET of the RRL portion
          // (matching the seller line); an obligor swingline draws the full amount.
          if (onSeller && r.scope === "OBLIGOR_ONLY") continue;
          if (!onSeller && r.scope === "SELLER_ONLY") continue;
          total += onSeller ? r.amount - (r.rrlAmount ?? 0) : r.amount;
        }
      }
      return total;
    }
    case "INVESTOR":
      // A distributed reservation holds each named investor's capacity for its
      // window — sum the allocations booked to this investor.
      return active.reduce(
        (a, r) => a + (r.investorAllocations?.filter((x) => x.investorId === limit.entityId).reduce((s, x) => s + x.amount, 0) ?? 0),
        0,
      );
    case "INSURANCE":
      // An insured reservation holds each named policy's capacity for its window.
      return active.reduce(
        (a, r) => a + (r.insurerAllocations?.filter((x) => x.policyId === limit.entityId).reduce((s, x) => s + x.amount, 0) ?? 0),
        0,
      );
    // ASR is consumed at actual discounting (handled via sellerObligorUsage).
    default:
      return 0;
  }
}

// Reserved insurance held against a policy within a window, optionally narrowed
// to the obligor being covered or that obligor's country — used to time-phase
// the per-policy buyer sublimit and country limit in the eligibility engine.
export function reservedInsurance(
  policyId: string,
  filter: { obligorId?: string; country?: string },
  asOf?: AsOf,
): number {
  const w = toWindow(asOf);
  let total = 0;
  for (const r of store.reservations) {
    if (r.status !== "RESERVED" || !reservationInWindow(r, w)) continue;
    if (filter.obligorId && r.obligorId !== filter.obligorId) continue;
    if (filter.country && getObligor(r.obligorId)?.country !== filter.country) continue;
    for (const a of r.insurerAllocations ?? []) {
      if (a.policyId === policyId) total += a.amount;
    }
  }
  return total;
}

function sum(rs: Reservation[]): number {
  return rs.reduce((a, r) => a + r.amount, 0);
}

// The single reservation-aware view of a limit — used by every screen. Pass
// asOf for the time-phased view (an ISO date = instant, a {from,to} = span).
export function viewLimit(limit: Limit, asOf?: AsOf): LimitView {
  return toLimitView(limit, getUtilization(limit.id), reservationConsumedForLimit(limit, asOf));
}

export function limitViews(asOf?: AsOf) {
  return store.limits.map((l) => viewLimit(l, asOf));
}

// Net standalone swingline ADJUSTMENTS for a target (REDUCTION draws down =
// +consumed, INCREASE releases = -consumed). Excludes discount reservations.
export function swinglineAdjustmentNet(
  entityType: "SELLER" | "OBLIGOR",
  entityId: string,
  kind: "REGULAR" | "RRL",
  asOf?: AsOf,
): number {
  const w = toWindow(asOf);
  let total = 0;
  for (const r of store.reservations) {
    if (r.status !== "RESERVED" || r.kind !== "SWINGLINE") continue;
    if ((r.swinglineKind ?? "REGULAR") !== kind) continue;
    if (!reservationInWindow(r, w)) continue;
    const matches = entityType === "SELLER" ? r.sellerId === entityId : r.obligorId === entityId;
    if (!matches) continue;
    total += r.swinglineDirection === "INCREASE" ? -r.amount : r.amount;
  }
  return total;
}

// Total swingline consumed = mirrored parent-line booking + standalone
// adjustments. Regular swingline mirrors the seller/obligor line; the RRL
// swingline mirrors the RRL.
export function swinglineConsumed(
  entityType: "SELLER" | "OBLIGOR",
  entityId: string,
  kind: "REGULAR" | "RRL",
  asOf?: AsOf,
): number {
  const parent = kind === "RRL" ? findLimit("RRL", entityId) : findLimit(entityType, entityId);
  const parentConsumed = parent ? viewLimit(parent, asOf).consumed : 0;
  return parentConsumed + swinglineAdjustmentNet(entityType, entityId, kind, asOf);
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

export function addUser(input: { name: string; role: Role; passwordHash: string }): User {
  const u: User = { id: nextId("USR"), name: input.name, role: input.role, passwordHash: input.passwordHash };
  store.users.push(u);
  return u;
}

export function deleteUser(id: string): boolean {
  const i = store.users.findIndex((u) => u.id === id);
  if (i < 0) return false;
  store.users.splice(i, 1);
  return true;
}

export function updateUserName(id: string, name: string): User | undefined {
  const u = storeGetUserById(id);
  if (u) u.name = name;
  return u;
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

// Remove a limit line entirely (e.g. drop a swingline or RRL from a seller).
// Its utilization row is cleared too so no orphan booked figure survives.
// Blocked while the limit still carries outstanding booked exposure — reset or
// unwind that first (capacity is always derived, never stored).
export function removeLimit(id: string): void {
  const l = store.limits.find((x) => x.id === id);
  if (!l) throw new Error("Limit not found.");
  const u = store.utilizations.get(id);
  if (u && computeConsumed(u) > 0) {
    throw new Error("This limit has outstanding booked exposure — clear it before deleting.");
  }
  store.utilizations.delete(id);
  store.limits.splice(store.limits.indexOf(l), 1);
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

// Cancelling a reservation removes it from the book entirely.
export function cancelReservation(id: string): Reservation | undefined {
  const i = store.reservations.findIndex((r) => r.id === id);
  if (i < 0) return undefined;
  const [removed] = store.reservations.splice(i, 1);
  return removed;
}

// Fulfill a reservation with the actual transaction that realised it. Marks it
// FUNDED and records the invoice, so it stops counting as reserved exposure.
export function fulfillReservation(id: string, invoiceNumber: string): Reservation | undefined {
  const r = getReservation(id);
  if (r) {
    r.status = "FUNDED";
    r.fulfilledByInvoice = invoiceNumber;
    r.fulfilledAt = new Date().toISOString();
  }
  return r;
}

// Reset every booked and reserved exposure so all limits return to full
// availability, without touching the limits, sellers, obligors, or their
// configuration. Clears current utilization (booked/outstanding), the entire
// forward book (reservations), and historical batch runs. Availability is
// always derived from these, so the next transaction starts from a clean slate.
export function resetExposure(): { utilizations: number; reservations: number; batches: number } {
  const counts = {
    utilizations: store.utilizations.size,
    reservations: store.reservations.length,
    batches: store.batches.length,
  };
  store.utilizations.clear();
  store.reservations.length = 0;
  store.batches.length = 0;
  return counts;
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
    // Seed the obligor group approval expiry so a new obligor clears the
    // group-expiry check (a missing one is a hard fail in the engine).
    expiryDate: input.expiryDate || undefined,
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

// Remove a seller and everything that belongs only to it — its limits (line,
// ASR, swingline, RRL, RRL swingline), eligible entities, ASR sublimits, and
// participation agreements — so no orphan record can point at a seller that no
// longer exists (single source of truth). Blocked while it has an active
// forward book; cancel or fulfill those reservations first.
export function removeSeller(id: string): void {
  if (!store.sellers.some((s) => s.id === id)) throw new Error("Seller not found.");
  if (store.reservations.some((r) => r.status === "RESERVED" && r.sellerId === id)) {
    throw new Error("This seller has active reservations — cancel them first.");
  }
  const limitIds = store.limits.filter((l) => l.entityType === "SELLER" && l.entityId === id).map((l) => l.id);
  for (const lid of limitIds) store.utilizations.delete(lid);
  store.limits = store.limits.filter((l) => !(l.entityType === "SELLER" && l.entityId === id));
  store.sellerEntities = store.sellerEntities.filter((e) => e.facilityId !== id);
  store.sellerObligorLimits = store.sellerObligorLimits.filter((x) => x.sellerId !== id);
  store.participationAgreements = store.participationAgreements.filter((p) => p.sellerId !== id);
  store.parentGuarantees = store.parentGuarantees.filter((p) => p.sellerId !== id);
  store.sellers = store.sellers.filter((s) => s.id !== id);
}

// Remove an obligor group and everything tied only to it — its master and
// swingline limits, eligible entities, every seller's ASR sublimit for it, and
// its insurance buyer sublimits. Blocked while any seller has an active
// reservation against it.
export function removeObligor(id: string): void {
  if (!store.obligors.some((o) => o.id === id)) throw new Error("Obligor not found.");
  if (store.reservations.some((r) => r.status === "RESERVED" && r.obligorId === id)) {
    throw new Error("This obligor has active reservations — cancel them first.");
  }
  const limitIds = store.limits.filter((l) => l.entityType === "OBLIGOR" && l.entityId === id).map((l) => l.id);
  for (const lid of limitIds) store.utilizations.delete(lid);
  store.limits = store.limits.filter((l) => !(l.entityType === "OBLIGOR" && l.entityId === id));
  store.obligorEntities = store.obligorEntities.filter((e) => e.groupId !== id);
  store.sellerObligorLimits = store.sellerObligorLimits.filter((x) => x.obligorId !== id);
  store.insuranceBuyerSublimits = store.insuranceBuyerSublimits.filter((b) => b.obligorId !== id);
  store.parentGuarantees = store.parentGuarantees.filter((p) => p.obligorId !== id && p.coveredObligorId !== id);
  store.obligors = store.obligors.filter((o) => o.id !== id);
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
