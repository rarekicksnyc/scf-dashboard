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
  TransactionWorkflow,
  WorkflowStatus,
  BookedTransaction,
  AuthorizedSignatory,
} from "@/lib/types";
import type { WorkoutRoute, InvoiceResult } from "@/lib/types";
import { DEFAULT_TEMPLATES } from "@/lib/data/templates";
import { toLimitView, computeConsumed } from "@/lib/engine/availability";
import { daysBetween } from "@/lib/format";
import { DEFAULT_MARGIN_BPS } from "@/lib/config";
import {
  bookedInWindow,
  outstandingPrincipal,
  outstandingFraction,
} from "@/lib/receivables";
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
  transactionWorkflows: TransactionWorkflow[];
  bookedTransactions: BookedTransaction[];
  signatories: AuthorizedSignatory[];
  settings: OrgSettings; // desk-wide, runtime-editable settings
  seq: number; // monotonic id counter
  migrations?: string[]; // one-time data fixes already applied to this store
}

// Desk-wide settings edited on-screen (not per entity). bookingTeamEmails is the
// booking / funding-team distribution list — one or more addresses, comma or
// semicolon separated — pre-filled as the To on every booking-team email draft.
export interface OrgSettings {
  bookingTeamEmails?: string;
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
    transactionWorkflows: [],
    bookedTransactions: [],
    signatories: [],
    settings: {},
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

  // Skim must never be shown to the investor — strip any skim column from
  // investor Schedule A templates (default + per-seller overrides).
  once("investor-schedule-no-skim-2026-07", () => {
    for (const t of store.docTemplates) {
      if (t.type !== "SCHEDULE_A_INVESTOR") continue;
      t.body = t.body.split("\n").filter((line) => !/\|\s*skim_bps\s*$/i.test(line.trim())).join("\n");
    }
  });

  // Single ledger: backfill every already-funded batch invoice into the one
  // bookedTransactions ledger so exposure, revenue, settlement, and aging all
  // derive from one place. Idempotent per batch (clears prior bookings first).
  once("batch-ledger-merge-2026-07", () => {
    for (const b of store.batches) materializeBatchBookings(b, "system:migration");
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
      | "status" | "eligible" | "internalRating" | "contactEmail"
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

// ---------------------------------------------------------------------------
// Transaction Flow — in-progress workflows, booked transactions, signatories
// ---------------------------------------------------------------------------

export function listTransactionWorkflows(): TransactionWorkflow[] {
  return store.transactionWorkflows;
}
export function getTransactionWorkflow(id: string): TransactionWorkflow | undefined {
  return store.transactionWorkflows.find((w) => w.id === id);
}

export function createTransactionWorkflow(
  input: Omit<TransactionWorkflow, "id" | "status" | "createdAt" | "timeline">,
): TransactionWorkflow {
  const now = new Date().toISOString();
  const wf: TransactionWorkflow = {
    ...input,
    id: nextId("TXF"),
    status: "IN_PROGRESS",
    createdAt: now,
    timeline: [{ at: now, by: input.createdBy, event: "Proceeded with transaction — documents stage." }],
  };
  store.transactionWorkflows.unshift(wf);
  return wf;
}

// Advance a workflow: set a new status (optional), merge a patch, and append a
// timeline entry.
export function advanceWorkflow(
  id: string,
  opts: { status?: WorkflowStatus; by: string; event: string; patch?: Partial<TransactionWorkflow> },
): TransactionWorkflow | undefined {
  const wf = getTransactionWorkflow(id);
  if (!wf) return undefined;
  if (opts.patch) Object.assign(wf, opts.patch);
  if (opts.status) wf.status = opts.status;
  wf.timeline.push({ at: new Date().toISOString(), by: opts.by, event: opts.event });
  return wf;
}

// Four-eyes on a single-deal booking exception. The maker records the breach
// reason; a fresh request always clears any prior approval (so a changed deal
// is re-approved). The checker (a different user) approves before booking.
export function requestWorkflowException(id: string, reason: string, makerId: string, makerName: string): TransactionWorkflow | undefined {
  const wf = getTransactionWorkflow(id);
  if (!wf) return undefined;
  wf.exceptionRequestedBy = makerId;
  wf.exceptionRequestedByName = makerName;
  wf.exceptionReason = reason;
  wf.exceptionApprovedBy = undefined;
  wf.exceptionApprovedByName = undefined;
  wf.exceptionApprovedAt = undefined;
  wf.timeline.push({ at: new Date().toISOString(), by: makerName, event: `Exception approval requested: ${reason}` });
  return wf;
}

export function approveWorkflowException(id: string, checkerId: string, checkerName: string): { ok: boolean; error?: string } {
  const wf = getTransactionWorkflow(id);
  if (!wf) return { ok: false, error: "Workflow not found." };
  if (!wf.exceptionRequestedBy) return { ok: false, error: "There is no exception request to approve." };
  if (wf.exceptionRequestedBy === checkerId) return { ok: false, error: "You cannot approve your own exception — a second user must approve (four-eyes)." };
  wf.exceptionApprovedBy = checkerId;
  wf.exceptionApprovedByName = checkerName;
  wf.exceptionApprovedAt = new Date().toISOString();
  wf.timeline.push({ at: wf.exceptionApprovedAt, by: checkerName, event: `Booking exception approved by checker.` });
  return { ok: true };
}

export function cancelTransactionWorkflow(id: string, by: string): boolean {
  const wf = getTransactionWorkflow(id);
  if (!wf || wf.status === "BOOKED") return false;
  wf.status = "CANCELLED";
  wf.timeline.push({ at: new Date().toISOString(), by, event: "Transaction cancelled." });
  return true;
}

export function listBookedTransactions(): BookedTransaction[] {
  return store.bookedTransactions;
}

// Reverse a booking: remove the booked transaction (its outstanding exposure
// drops everywhere and it leaves the calendar) and mark its workflow reversed.
// The realised reservation is not restored — re-reserve if the deal is still live.
export function removeBookedTransaction(id: string, by: string): BookedTransaction | undefined {
  const i = store.bookedTransactions.findIndex((t) => t.id === id);
  if (i < 0) return undefined;
  const [removed] = store.bookedTransactions.splice(i, 1);
  if (removed.workflowId) {
    const wf = getTransactionWorkflow(removed.workflowId);
    if (wf) {
      wf.status = "CANCELLED";
      wf.timeline.push({ at: new Date().toISOString(), by, event: `Booking reversed — booked transaction ${id} removed.` });
    }
  }
  return removed;
}

// Final booking step: turn a workflow into a booked transaction (real, time-
// phased outstanding), remove the reservation it realises, and mark the workflow
// BOOKED. Carries the reservation's RRL split / scope / allocations if present.
export function bookTransactionFromWorkflow(id: string, by: string): { workflow: TransactionWorkflow; booked: BookedTransaction } | undefined {
  const wf = getTransactionWorkflow(id);
  if (!wf || wf.status === "BOOKED") return undefined;
  const rsv = wf.reservationId ? store.reservations.find((r) => r.id === wf.reservationId) : undefined;
  const now = new Date().toISOString();
  const booked: BookedTransaction = {
    id: nextId("BKD"),
    workflowId: wf.id,
    fromReservationId: wf.reservationId,
    sellerId: wf.sellerId,
    obligorId: wf.obligorId,
    productType: wf.productType,
    reference: wf.reference,
    currency: wf.currency,
    amount: wf.coverage, // funded amount that consumes limits
    rrlAmount: rsv?.rrlAmount,
    scope: wf.scope ?? rsv?.scope,
    valueDate: wf.valueDate,
    maturityDate: wf.productType === "UTRC" ? wf.finalDemandDate || wf.maturityDate : wf.maturityDate,
    pricingBps: wf.pricingBps,
    baseRatePct: wf.baseRate,
    // Investor participation → skim revenue inputs (SOFR frozen at booking).
    investorAmount: wf.investorAmount,
    skimBps: wf.skimBps,
    investorSofrPct: wf.investorAmount && wf.investorAmount > 0 ? interpolateSofr(daysBetween(wf.valueDate, wf.maturityDate)) : undefined,
    investorAllocations: rsv?.investorAllocations,
    insurerAllocations: rsv?.insurerAllocations,
    bookedAt: now,
    bookedBy: by,
  };
  store.bookedTransactions.unshift(booked);
  // Remove the reservation it realises (forward book + calendar drop it).
  if (wf.reservationId) {
    const i = store.reservations.findIndex((r) => r.id === wf.reservationId);
    if (i >= 0) store.reservations.splice(i, 1);
  }
  wf.status = "BOOKED";
  wf.bookedAt = now;
  wf.bookedTransactionId = booked.id;
  wf.timeline.push({ at: now, by, event: `Booked in system (${booked.id})${wf.reservationId ? ` — reservation ${wf.reservationId} removed` : ""}.` });
  return { workflow: wf, booked };
}

export function getBookedTransaction(id: string): BookedTransaction | undefined {
  return store.bookedTransactions.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Post-booking lifecycle mutations. Collections drive outstanding exposure
// (single source): recording one reduces the drawn amount everywhere at once.
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Record a principal collection (repayment) against a booked receivable. The
// amount is clamped to the outstanding principal so a receivable can never be
// over-collected; when the balance reaches zero the receivable closes (settled).
export function recordCollection(
  id: string,
  input: { amount: number; date: string; faceReceived?: number; note?: string },
  by: string,
): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t) return undefined;
  if (!t.collections) t.collections = [];
  const amount = Math.max(0, Math.min(input.amount, outstandingPrincipal(t)));
  t.collections.push({ id: nextId("COL"), date: input.date, amount, faceReceived: input.faceReceived, by, note: input.note });
  if (outstandingPrincipal(t) < 1) t.settledAt = input.date;
  return t;
}

// Declare a receivable in default and choose the workout route (recourse to the
// seller, an insurance claim, or a write-off). Exposure remains outstanding
// until the loss is recovered (a claim paid or recourse collected is booked as a
// collection, which is what actually drops the exposure).
export function markReceivableDefault(
  id: string,
  input: { reason: string; workout: WorkoutRoute },
  by: string,
): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t) return undefined;
  t.defaultedAt = today();
  t.defaultReason = input.reason;
  t.workout = input.workout;
  return t;
}

// Clear a default (e.g. the obligor cured) so the receivable returns to its
// normal open state.
export function clearReceivableDefault(id: string): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t) return undefined;
  t.defaultedAt = undefined;
  t.defaultReason = undefined;
  t.workout = undefined;
  return t;
}

// File an insurance claim for the insured portion of a defaulted receivable.
// The claim amount is the outstanding insured allocation.
export function fileInsuranceClaim(id: string): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t) return undefined;
  const first = t.insurerAllocations?.[0];
  if (!first) return undefined;
  const frac = outstandingFraction(t);
  const insured = (t.insurerAllocations ?? []).reduce((a, x) => a + x.amount, 0) * frac;
  const policy = getInsurancePolicy(first.policyId);
  t.insuranceClaim = {
    policyId: first.policyId,
    policyName: policy?.insurerName ?? first.policyId,
    filedAt: today(),
    amount: insured,
    status: "FILED",
  };
  return t;
}

// Decide a filed insurance claim. A PAID claim recovers the insured principal —
// booked as a collection so exposure drops (collections are the single source).
export function decideInsuranceClaim(
  id: string,
  status: "PAID" | "DENIED",
  by: string,
  reference?: string,
): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t?.insuranceClaim) return undefined;
  t.insuranceClaim.status = status;
  t.insuranceClaim.decidedAt = today();
  if (reference) t.insuranceClaim.reference = reference;
  if (status === "PAID") {
    recordCollection(id, { amount: t.insuranceClaim.amount, date: today(), note: `Insurance claim paid — ${t.insuranceClaim.policyName}` }, by);
  }
  return t;
}

// Mark the investor participation on a booked transaction as settled and
// reconciled (the investor has been repaid their principal + their rate).
export function settleInvestorParticipation(id: string, by: string): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t || !(t.investorAmount && t.investorAmount > 0)) return undefined;
  void by; // audited at the route level
  t.investorSettledAt = today();
  return t;
}

// ---------------------------------------------------------------------------
// Batch → single ledger. A funded batch invoice IS a live receivable, so it
// materialises into the one bookedTransactions ledger (provenance kept via
// source/batchId/invoiceNumber). Idempotent — re-running a batch clears its
// prior bookings first so exposure never double-counts.
// ---------------------------------------------------------------------------

export function removeBatchBookings(batchId: string): void {
  store.bookedTransactions = store.bookedTransactions.filter((t) => t.batchId !== batchId);
}

export function materializeBatchBookings(batch: BatchResult, by: string): void {
  removeBatchBookings(batch.batchId);
  const funded = batch.results.filter((r: InvoiceResult) => r.funding);
  for (const r of funded) {
    const inv = r.invoice;
    const advanceRate = inv.advanceRate ?? 1;
    const coverage = inv.coverageAmount ?? inv.amount * advanceRate;
    const investorLegs = (r.funding?.legs ?? []).filter((l) => l.source === "INVESTOR" && l.sourceId);
    store.bookedTransactions.unshift({
      id: nextId("BKD"),
      source: "BATCH",
      batchId: batch.batchId,
      invoiceNumber: inv.invoiceNumber,
      sellerId: inv.sellerId,
      obligorId: inv.obligorId,
      obligorEntityId: inv.obligorEntityId,
      productType: inv.productType ?? "DTR",
      reference: inv.invoiceNumber,
      currency: inv.currency,
      amount: coverage,
      faceAmount: inv.amount,
      advanceRate,
      valueDate: inv.requestedDiscountDate,
      maturityDate: inv.dueDate,
      pricingBps: inv.marginBps ?? DEFAULT_MARGIN_BPS,
      baseRatePct: inv.baseRate,
      // Investor takeout legs consume the investor line; the batch revenue model
      // keeps margin on the full coverage, so investorAmount (the skim model) is
      // intentionally left unset here.
      investorAllocations: investorLegs.length ? investorLegs.map((l) => ({ investorId: l.sourceId!, amount: l.amount })) : undefined,
      insurerAllocations: r.funding?.policyId && r.funding.insuredAmount > 0 ? [{ policyId: r.funding.policyId, amount: r.funding.insuredAmount }] : undefined,
      bookedAt: batch.uploadedAt,
      bookedBy: by,
    });
  }
}

// -- Authorized signatories (per seller, or a specific seller entity) --------
export function listSignatories(sellerId?: string): AuthorizedSignatory[] {
  return sellerId ? store.signatories.filter((s) => s.sellerId === sellerId) : store.signatories;
}
export function addSignatory(input: Omit<AuthorizedSignatory, "id">): AuthorizedSignatory {
  const s: AuthorizedSignatory = { ...input, id: nextId("SIG"), name: input.name.trim(), title: input.title.trim() };
  store.signatories.push(s);
  return s;
}
export function removeSignatory(id: string): boolean {
  const i = store.signatories.findIndex((s) => s.id === id);
  if (i < 0) return false;
  store.signatories.splice(i, 1);
  return true;
}

// Is a signer authorized for a seller (optionally a specific entity, and for an
// amount)? Matches by name (case/space-insensitive); an entity-scoped
// transaction accepts an entity-specific OR a group-wide signatory. A signatory
// with a signing limit only qualifies when the amount is within it.
export function isAuthorizedSigner(sellerId: string, entityId: string | undefined, name: string, amount = 0): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(name);
  return store.signatories.some(
    (s) =>
      s.sellerId === sellerId &&
      (!s.entityId || s.entityId === entityId) &&
      norm(s.name) === target &&
      (s.signingLimit == null || amount <= s.signingLimit),
  );
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

// COF curve points (tenor → offer) for preloading the base rate on a deal.
export function cofCurve(): { tenorDays: number; offer: number }[] {
  return store.rates.filter((r) => r.rateType === "COF" && !r.error).map((r) => ({ tenorDays: r.tenorDays, offer: r.offer }));
}

// The 1-day and 30-day SOFR offers used to interpolate short-tenor SOFR.
export function sofrEndpoints(): { one?: number; thirty?: number } {
  const rows = store.rates.filter((r) => r.rateType === "SOFR" && !r.error);
  return { one: rows.find((r) => r.tenorDays === 1)?.offer, thirty: rows.find((r) => r.tenorDays === 30)?.offer };
}

// Linear-interpolate SOFR for a tenor between the 1-day and 30-day points. Used
// for investor deals (funded at COF + margin; investor takes SOFR + margin −
// skim). Tenor is clamped to [1, 30]; beyond 30 days it falls back to the
// closest curve point.
export function interpolateSofr(tenorDays: number): number | undefined {
  const { one, thirty } = sofrEndpoints();
  if (one == null || thirty == null) return resolveBaseRate("SOFR", tenorDays);
  if (tenorDays > 30) return resolveBaseRate("SOFR", tenorDays);
  const t = Math.max(1, tenorDays);
  return one + ((t - 1) / (30 - 1)) * (thirty - one);
}

// COF is priced on a separate MUFG platform. This is the SINGLE integration
// point for COF: today it reads the uploaded COF rate sheet (closest tenor);
// when the external COF feed is wired up, fetch it here (see COF_FEED_URL in
// lib/config) — nothing else needs to change.
export function cofRate(tenorDays: number): number | undefined {
  return resolveBaseRate("COF", tenorDays);
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
  const reserved = store.reservations
    .filter(
      (r) =>
        r.status === "RESERVED" &&
        r.sellerId === sellerId &&
        r.obligorId === obligorId &&
        r.scope !== "SELLER_ONLY" && // ASR follows the obligor side
        reservationInWindow(r, w),
    )
    .reduce((a, r) => a + r.amount, 0);
  const booked = store.bookedTransactions
    .filter((t) => t.sellerId === sellerId && t.obligorId === obligorId && t.scope !== "SELLER_ONLY" && bookedInWindow(t, w))
    .reduce((a, t) => a + outstandingPrincipal(t), 0);
  return reserved + booked;
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
function reservationInWindow(r: { valueDate: string; maturityDate: string }, w?: DateWindow): boolean {
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
  const matches = (r: { obligorId: string }) => {
    if (filter.obligorId && r.obligorId !== filter.obligorId) return false;
    if (filter.country && getObligor(r.obligorId)?.country !== filter.country) return false;
    return true;
  };
  // Reserved forward book holds the full allocation.
  for (const r of store.reservations) {
    if (r.status !== "RESERVED" || !reservationInWindow(r, w) || !matches(r)) continue;
    for (const a of r.insurerAllocations ?? []) if (a.policyId === policyId) total += a.amount;
  }
  // Booked receivables hold the OUTSTANDING share (scaled by principal collected).
  for (const t of store.bookedTransactions) {
    if (!bookedInWindow(t, w) || !matches(t)) continue;
    const frac = outstandingFraction(t);
    for (const a of t.insurerAllocations ?? []) if (a.policyId === policyId) total += a.amount * frac;
  }
  return total;
}

function sum(rs: Reservation[]): number {
  return rs.reduce((a, r) => a + r.amount, 0);
}

// How much a set of discount-style draws (reservations or booked transactions)
// consumes a given limit. Scope gates which side each draw blocks. This is the
// shared draw logic so booked transactions consume EXACTLY like reservations.
// Exposure is the OUTSTANDING principal — a partial collection scales every draw
// (line amount, RRL split, investor and insurer allocations) down by the same
// fraction, and a fully settled receivable draws zero.
function drawForLimit(limit: Limit, items: BookedTransaction[]): number {
  const out = (t: BookedTransaction) => outstandingPrincipal(t);
  const frac = (t: BookedTransaction) => outstandingFraction(t);
  const rrl = (t: BookedTransaction) => (t.rrlAmount ?? 0) * frac(t);
  switch (limit.type) {
    case "SELLER":
      return items.filter((r) => r.sellerId === limit.entityId && r.scope !== "OBLIGOR_ONLY").reduce((a, r) => a + out(r) - rrl(r), 0);
    case "RRL":
      return items.filter((r) => r.sellerId === limit.entityId && r.scope !== "OBLIGOR_ONLY").reduce((a, r) => a + rrl(r), 0);
    case "OBLIGOR":
      return items.filter((r) => r.obligorId === limit.entityId && r.scope !== "SELLER_ONLY").reduce((a, r) => a + out(r), 0);
    case "SWINGLINE": {
      const onSeller = limit.entityType === "SELLER";
      let total = 0;
      for (const r of items) {
        if (onSeller) { if (r.sellerId !== limit.entityId || r.scope === "OBLIGOR_ONLY") continue; total += out(r) - rrl(r); }
        else if (limit.entityType === "OBLIGOR") { if (r.obligorId !== limit.entityId || r.scope === "SELLER_ONLY") continue; total += out(r); }
      }
      return total;
    }
    case "INVESTOR":
      return items.reduce((a, r) => a + (r.investorAllocations?.filter((x) => x.investorId === limit.entityId).reduce((s, x) => s + x.amount * frac(r), 0) ?? 0), 0);
    case "INSURANCE":
      return items.reduce((a, r) => a + (r.insurerAllocations?.filter((x) => x.policyId === limit.entityId).reduce((s, x) => s + x.amount * frac(r), 0) ?? 0), 0);
    default:
      return 0;
  }
}

// Booked transactions consuming a limit, time-phased (real OUTSTANDING exposure).
// A booked receivable stays live until it is settled — an overdue, uncollected
// one keeps consuming (bookedInWindow), unlike a reservation that rolls off at
// maturity.
export function bookedConsumedForLimit(limit: Limit, asOf?: AsOf): number {
  const w = toWindow(asOf);
  const active = store.bookedTransactions.filter((t) => bookedInWindow(t, w));
  return drawForLimit(limit, active);
}

// The single exposure-aware view of a limit — used by every screen. Outstanding
// = seed utilization + booked transactions (time-phased); reserved = the forward
// book (time-phased). Pass asOf for the time-phased view.
export function viewLimit(limit: Limit, asOf?: AsOf): LimitView {
  return toLimitView(
    limit,
    getUtilization(limit.id),
    reservationConsumedForLimit(limit, asOf),
    bookedConsumedForLimit(limit, asOf),
  );
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

// Desk-wide settings (booking-team recipients, etc.). Resilient to older
// snapshots hydrated before the field existed.
export function getSettings(): OrgSettings {
  return (store.settings ??= {});
}

export function updateSettings(patch: Partial<OrgSettings>): OrgSettings {
  store.settings = { ...getSettings(), ...patch };
  return store.settings;
}

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
