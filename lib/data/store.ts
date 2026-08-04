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
import type { CustomFieldDef, CustomRegister, KpiTile, WatchRule, CoverageAssignment, NotificationEvent, TemplateFieldDef, LimitApproval, LimitPendingEdit } from "@/lib/types";
import { DEFAULT_TEMPLATES } from "@/lib/data/templates";
import { toLimitView, computeConsumed } from "@/lib/engine/availability";
import { daysBetween, limitActiveOn, limitNotYetEffective } from "@/lib/format";
import { DEFAULT_MARGIN_BPS } from "@/lib/config";
import {
  bookedInWindow,
  outstandingPrincipal,
  outstandingFraction,
  additionalInterest,
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
  roleLabels: Record<string, string>; // display label per role key (built-in + custom)
  countries: Country[];
  rates: RateRow[];
  docTemplates: DocTemplate[];
  transactionWorkflows: TransactionWorkflow[];
  bookedTransactions: BookedTransaction[];
  signatories: AuthorizedSignatory[];
  settings: OrgSettings; // desk-wide, runtime-editable settings
  // Creator Mode — governed declarative extensions (see lib/types.ts).
  customFields: CustomFieldDef[];
  customFieldValues: Record<string, Record<string, string>>; // "ENTITY:id" → { fieldKey: value }
  customRegisters: CustomRegister[];
  kpiTiles: KpiTile[];
  watchRules: WatchRule[];
  templateFields: TemplateFieldDef[]; // custom report/template columns
  hiddenReportColumns: Record<string, string[]>; // target → hidden built-in column keys
  coverage: CoverageAssignment[]; // user ↔ seller/obligor coverage
  notifications: NotificationEvent[]; // stored notification events (exceptions)
  rev: number; // global change counter — bumped on every audited action (live sync)
  recordRevs: Record<string, number>; // per-record change counters (edit-conflict guard)
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
    roleLabels: { OPERATIONS: "Operations", CREDIT_OFFICER: "Credit Officer", PRODUCT_MANAGER: "Portfolio Manager", RELATIONSHIP_MANAGER: "Relationship Manager", RISK_MANAGER: "Risk Manager", ADMIN: "Administrator", VIEWER: "Viewer" },
    countries: structuredClone(seed.countries),
    rates: structuredClone(seed.rates),
    docTemplates: structuredClone(DEFAULT_TEMPLATES),
    transactionWorkflows: [],
    bookedTransactions: [],
    signatories: [],
    settings: {},
    customFields: [],
    customFieldValues: {},
    customRegisters: [],
    kpiTiles: [],
    watchRules: [],
    templateFields: [],
    hiddenReportColumns: {},
    coverage: [],
    notifications: [],
    rev: 0,
    recordRevs: {},
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

  // Portfolio Managers (alongside Administrators) may manage roles and users.
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

  // Creator Mode (governed platform extensions) is available to Portfolio Manager
  // and Administrator. Grant it in persisted state; future Roles & Access edits win.
  once("creator-mode-pm-admin-2026-07", () => {
    for (const role of ["PRODUCT_MANAGER", "ADMIN"] as Role[]) {
      const perms = store.rolePermissions[role] ?? [];
      if (!perms.includes("CREATOR_MODE")) store.rolePermissions[role] = [...perms, "CREATOR_MODE"];
    }
  });

  // Reports are restricted to Administrator and Portfolio Manager. Strip
  // VIEW_REPORTS from every other role in persisted state (once); future changes
  // via Roles & Access are respected.
  once("reports-admin-pm-only-2026-07", () => {
    for (const role of Object.keys(store.rolePermissions) as Role[]) {
      if (role === "ADMIN" || role === "PRODUCT_MANAGER") continue;
      store.rolePermissions[role] = (store.rolePermissions[role] ?? []).filter((p) => p !== "VIEW_REPORTS");
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
      | "status" | "eligible" | "internalRating" | "contactEmail" | "comminglingDays"
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

// A fingerprint of the exposure-relevant parameters a checker actually sanctioned.
// If the deal's window or amount changes after approval (e.g. a different
// settlementBasis reshapes [funding, maturity]), the approval no longer applies.
export function workflowExceptionFingerprint(wf: TransactionWorkflow): string {
  return `${wf.valueDate}|${wf.maturityDate}|${Math.round(wf.coverage)}|${Math.round(wf.amount)}`;
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
  wf.exceptionApprovedFingerprint = undefined;
  wf.timeline.push({ at: new Date().toISOString(), by: makerName, event: `Exception approval requested: ${reason}` });
  // Alert co-covering reviewers (four-eyes) — everyone covering this seller/obligor
  // who can approve, except the maker.
  notifyWorkflowException(wf, makerId);
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
  wf.exceptionApprovedFingerprint = workflowExceptionFingerprint(wf); // sanction THIS window/amount only
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
    executionDate: wf.executionDate,
    settlementBasis: wf.settlementBasis,
    valueDate: wf.valueDate, // funding date (T+n); exposure consumes from here
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

// Ops confirms the funds were sent for a T+n booking (settlement confirmation).
// Purely informational — exposure already consumes from the funding date; this
// records that the money actually went out. Nothing for the PM to do.
export function confirmFundsSent(id: string, by: string): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t || t.fundsSentAt) return undefined;
  t.fundsSentAt = new Date().toISOString().slice(0, 10);
  t.fundsSentBy = by;
  return t;
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

// Accrue the additional (default) interest all at once: called when the client
// confirms it will repay the past-due balance. Freezes the amount at today's
// date so it stops growing. Only valid while the receivable is past due with a
// non-zero indicative amount, and only once.
export function confirmAdditionalInterest(id: string, by: string): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t || t.additionalInterestConfirmedAt) return undefined;
  const ai = additionalInterest(t, today());
  if (ai.amount <= 0) return undefined; // not past due — nothing to accrue
  void by; // audited at the route level
  t.additionalInterestConfirmedAt = today();
  t.additionalInterestAccrued = ai.amount;
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
  // A fully-repaid receivable is closed — it cannot be declared in default (that
  // would mislabel a settled deal as DEFAULTED and, on write-off, overwrite the
  // real collection date). Guard on actual collections, not settledAt (a prior
  // write-off sets settledAt without a real full collection).
  const collected = (t.collections ?? []).reduce((a, c) => a + c.amount, 0);
  if (collected >= t.amount) return undefined;
  // WRITE_OFF and INSURANCE_CLAIM are mutually exclusive recovery routes for the
  // same principal: a write-off sets settledAt (collapsing outstanding to 0), which
  // would silently zero a subsequent claim payout. Refuse to write off while a
  // non-DENIED claim is open — clear the claim/default first.
  if (input.workout === "WRITE_OFF" && t.insuranceClaim && t.insuranceClaim.status !== "DENIED") return undefined;
  t.defaultedAt = today();
  t.defaultReason = input.reason;
  t.workout = input.workout;
  // A write-off recognises the loss now — the exposure comes off the line
  // (settledAt frees it everywhere). The status still reads DEFAULTED because
  // defaultedAt takes precedence in receivableStatus.
  if (input.workout === "WRITE_OFF") t.settledAt = today();
  return t;
}

// Clear a default (e.g. the obligor cured) so the receivable returns to its
// normal open state. If a write-off had frozen the exposure off (settledAt set
// without a real full collection), restore it too.
export function clearReceivableDefault(id: string): BookedTransaction | undefined {
  const t = getBookedTransaction(id);
  if (!t) return undefined;
  const collected = (t.collections ?? []).reduce((a, c) => a + c.amount, 0);
  if (t.settledAt && collected < t.amount) t.settledAt = undefined;
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
  // Idempotent: never overwrite a claim that is already FILED or PAID (that would
  // reset a paid claim back to FILED and let it be paid again). Only a DENIED
  // claim may be re-filed (e.g. appealed).
  if (t.insuranceClaim && t.insuranceClaim.status !== "DENIED") return t;
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
  // Only a FILED claim can be decided. Deciding an already-PAID/DENIED claim is a
  // no-op — otherwise a second PAID would book the insured amount AGAIN, recovering
  // principal beyond the insured allocation (double-recovery).
  if (t.insuranceClaim.status !== "FILED") return t;
  // A PAID claim must actually recover live principal. If nothing is outstanding
  // (the receivable was written off / settled), there is nothing to recover —
  // refuse rather than book a $0 collection and record it as an insurance recovery.
  if (status === "PAID" && (t.settledAt || (t.collections ?? []).reduce((a, c) => a + c.amount, 0) >= t.amount)) return undefined;
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
    // If this funded invoice realises an open reservation (a deal that was
    // forward-booked and is now funded via a batch), release that reservation so
    // exposure is not double-counted (reserved + booked). Match conservatively —
    // same seller, obligor, funded amount, and value date — so an unrelated
    // reservation is never dropped. The interactive booking path already does
    // this by removing the reservation it realises.
    const match = store.reservations.find(
      (rsv) =>
        rsv.status === "RESERVED" &&
        rsv.kind !== "SWINGLINE" &&
        rsv.sellerId === inv.sellerId &&
        rsv.obligorId === inv.obligorId &&
        Math.abs(rsv.amount - coverage) < 1 &&
        rsv.valueDate === inv.requestedDiscountDate,
    );
    if (match) fulfillReservation(match.id, inv.invoiceNumber);
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

// Edit a policy's economic terms (currently the annual minimum premium). Mutates
// the single stored policy so every reader — the premium tracker, the eligibility
// engine, the dropdowns — sees the change at once.
export function updateInsurancePolicy(id: string, patch: Partial<Pick<InsurancePolicy, "minimumPremium">>): InsurancePolicy | undefined {
  const p = store.insurancePolicies.find((x) => x.id === id);
  if (!p) return undefined;
  if (patch.minimumPremium !== undefined) p.minimumPremium = Math.max(0, patch.minimumPremium);
  return p;
}

export function activeInvestors(): Investor[] {
  return store.investors.filter((i) => i.status === "ACTIVE");
}

export function activePolicies(): InsurancePolicy[] {
  return store.insurancePolicies.filter((p) => p.status === "ACTIVE");
}

// ---------------------------------------------------------------------------
// Creator Mode registry — declarative extensions (custom fields, registers, KPI
// tiles, watch rules). Accessors default undefined→empty so a snapshot saved
// before Creator Mode existed still hydrates cleanly.
// ---------------------------------------------------------------------------

// --- Custom fields --------------------------------------------------------
export function listCustomFields(entityType?: CustomFieldDef["entityType"]): CustomFieldDef[] {
  const all = (store.customFields ??= []);
  return entityType ? all.filter((f) => f.entityType === entityType) : all;
}
export function addCustomField(def: Omit<CustomFieldDef, "id" | "updatedAt">): CustomFieldDef {
  const field: CustomFieldDef = { ...def, id: nextId("CFLD"), updatedAt: new Date().toISOString() };
  (store.customFields ??= []).push(field);
  return field;
}
export function updateCustomField(id: string, patch: Partial<Omit<CustomFieldDef, "id" | "entityType" | "key">>): CustomFieldDef | undefined {
  const f = (store.customFields ??= []).find((x) => x.id === id);
  if (!f) return undefined;
  if (patch.label !== undefined) f.label = patch.label;
  if (patch.type !== undefined) f.type = patch.type;
  if (patch.options !== undefined) f.options = patch.options;
  f.updatedAt = new Date().toISOString();
  return f;
}
export function removeCustomField(id: string): boolean {
  const arr = (store.customFields ??= []);
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}
export function getCustomFieldValues(entityType: CustomFieldDef["entityType"], entityId: string): Record<string, string> {
  return (store.customFieldValues ??= {})[`${entityType}:${entityId}`] ?? {};
}
export function setCustomFieldValues(entityType: CustomFieldDef["entityType"], entityId: string, values: Record<string, string>): void {
  (store.customFieldValues ??= {})[`${entityType}:${entityId}`] = values;
}

// --- Custom registers -----------------------------------------------------
export function listCustomRegisters(): CustomRegister[] {
  return (store.customRegisters ??= []);
}
export function getCustomRegister(id: string): CustomRegister | undefined {
  return (store.customRegisters ??= []).find((r) => r.id === id);
}
export function addCustomRegister(reg: Omit<CustomRegister, "id" | "updatedAt">): CustomRegister {
  const r: CustomRegister = { ...reg, id: nextId("CREG"), updatedAt: new Date().toISOString() };
  (store.customRegisters ??= []).push(r);
  return r;
}
export function updateCustomRegister(id: string, patch: Partial<Omit<CustomRegister, "id">>): CustomRegister | undefined {
  const r = (store.customRegisters ??= []).find((x) => x.id === id);
  if (!r) return undefined;
  if (patch.name !== undefined) r.name = patch.name;
  if (patch.description !== undefined) r.description = patch.description;
  if (patch.columns !== undefined) r.columns = patch.columns;
  if (patch.rows !== undefined) r.rows = patch.rows;
  r.updatedAt = new Date().toISOString();
  return r;
}
export function removeCustomRegister(id: string): boolean {
  const arr = (store.customRegisters ??= []);
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

// --- KPI tiles ------------------------------------------------------------
export function listKpiTiles(): KpiTile[] {
  return (store.kpiTiles ??= []);
}
export function addKpiTile(tile: Omit<KpiTile, "id" | "updatedAt">): KpiTile {
  const t: KpiTile = { ...tile, id: nextId("KPI"), updatedAt: new Date().toISOString() };
  (store.kpiTiles ??= []).push(t);
  return t;
}
export function updateKpiTile(id: string, patch: Partial<Omit<KpiTile, "id">>): KpiTile | undefined {
  const t = (store.kpiTiles ??= []).find((x) => x.id === id);
  if (!t) return undefined;
  if (patch.label !== undefined) t.label = patch.label;
  if (patch.formula !== undefined) t.formula = patch.formula;
  if (patch.format !== undefined) t.format = patch.format;
  t.updatedAt = new Date().toISOString();
  return t;
}
export function removeKpiTile(id: string): boolean {
  const arr = (store.kpiTiles ??= []);
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

// --- Watch rules ----------------------------------------------------------
export function listWatchRules(): WatchRule[] {
  return (store.watchRules ??= []);
}
export function addWatchRule(rule: Omit<WatchRule, "id" | "updatedAt">): WatchRule {
  const r: WatchRule = { ...rule, id: nextId("WRUL"), updatedAt: new Date().toISOString() };
  (store.watchRules ??= []).push(r);
  return r;
}
export function updateWatchRule(id: string, patch: Partial<Omit<WatchRule, "id">>): WatchRule | undefined {
  const r = (store.watchRules ??= []).find((x) => x.id === id);
  if (!r) return undefined;
  if (patch.label !== undefined) r.label = patch.label;
  if (patch.scope !== undefined) r.scope = patch.scope;
  if (patch.expression !== undefined) r.expression = patch.expression;
  if (patch.severity !== undefined) r.severity = patch.severity;
  if (patch.message !== undefined) r.message = patch.message;
  if (patch.enabled !== undefined) r.enabled = patch.enabled;
  r.updatedAt = new Date().toISOString();
  return r;
}
export function removeWatchRule(id: string): boolean {
  const arr = (store.watchRules ??= []);
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

// --- Template / report fields --------------------------------------------
export function listTemplateFields(target?: TemplateFieldDef["target"]): TemplateFieldDef[] {
  const all = (store.templateFields ??= []);
  return target ? all.filter((f) => f.target === target) : all;
}
export function addTemplateField(def: Omit<TemplateFieldDef, "id" | "updatedAt">): TemplateFieldDef {
  const f: TemplateFieldDef = { ...def, id: nextId("TFLD"), updatedAt: new Date().toISOString() };
  (store.templateFields ??= []).push(f);
  return f;
}
export function updateTemplateField(id: string, patch: Partial<Omit<TemplateFieldDef, "id" | "target" | "key">>): TemplateFieldDef | undefined {
  const f = (store.templateFields ??= []).find((x) => x.id === id);
  if (!f) return undefined;
  if (patch.label !== undefined) f.label = patch.label;
  if (patch.kind !== undefined) f.kind = patch.kind;
  if (patch.formula !== undefined) f.formula = patch.formula;
  if (patch.text !== undefined) f.text = patch.text;
  if (patch.options !== undefined) f.options = patch.options;
  if (patch.format !== undefined) f.format = patch.format;
  f.updatedAt = new Date().toISOString();
  return f;
}
export function removeTemplateField(id: string): boolean {
  const arr = (store.templateFields ??= []);
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

// Hidden built-in report columns (per target). Empty = all built-ins shown.
export function getHiddenReportColumns(target: string): string[] {
  return (store.hiddenReportColumns ??= {})[target] ?? [];
}
export function setHiddenReportColumns(target: string, keys: string[]): void {
  (store.hiddenReportColumns ??= {})[target] = [...new Set(keys)];
}

// ---------------------------------------------------------------------------
// Coverage — user ↔ seller/obligor assignments. Multiple users per entity
// (OOO backup); notifications route to whoever covers the entity.
// ---------------------------------------------------------------------------
export function listCoverage(): CoverageAssignment[] { return (store.coverage ??= []); }
export function coverageForUser(userId: string): CoverageAssignment[] {
  return (store.coverage ??= []).filter((c) => c.userId === userId);
}
export function coveredEntityIds(userId: string): { sellers: Set<string>; obligors: Set<string> } {
  const sellers = new Set<string>(), obligors = new Set<string>();
  for (const c of coverageForUser(userId)) (c.entityType === "SELLER" ? sellers : obligors).add(c.entityId);
  return { sellers, obligors };
}
export function usersCoveringEntity(entityType: "SELLER" | "OBLIGOR", entityId: string): string[] {
  return (store.coverage ??= []).filter((c) => c.entityType === entityType && c.entityId === entityId).map((c) => c.userId);
}
export function addCoverage(a: Omit<CoverageAssignment, "id">): CoverageAssignment | undefined {
  const arr = (store.coverage ??= []);
  const existing = arr.find((c) => c.userId === a.userId && c.entityType === a.entityType && c.entityId === a.entityId);
  if (existing) { existing.backup = a.backup; return existing; } // same pairing → just update primary/backup
  const rec: CoverageAssignment = { ...a, id: nextId("COV") };
  arr.push(rec);
  return rec;
}
export function removeCoverage(id: string): boolean {
  const arr = (store.coverage ??= []);
  const i = arr.findIndex((c) => c.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Notification events (stored). Live digest items are derived in lib/notifications.
// ---------------------------------------------------------------------------
export function addNotification(n: Omit<NotificationEvent, "id" | "createdAt">): NotificationEvent {
  const rec: NotificationEvent = { ...n, id: nextId("NTF"), createdAt: new Date().toISOString() };
  (store.notifications ??= []).unshift(rec);
  return rec;
}
export function listNotificationsForUser(userId: string, limit = 50): NotificationEvent[] {
  return (store.notifications ??= []).filter((n) => n.userId === userId).slice(0, limit);
}
export function unreadNotificationCount(userId: string): number {
  return (store.notifications ??= []).filter((n) => n.userId === userId && !n.readAt).length;
}
export function markNotificationRead(id: string, userId: string): boolean {
  const n = (store.notifications ??= []).find((x) => x.id === id && x.userId === userId);
  if (!n) return false;
  if (!n.readAt) n.readAt = new Date().toISOString();
  return true;
}
export function markAllNotificationsRead(userId: string): number {
  let count = 0;
  for (const n of (store.notifications ??= [])) if (n.userId === userId && !n.readAt) { n.readAt = new Date().toISOString(); count++; }
  return count;
}

// Loan ops handoff: when a transaction's documents are executed AND the signer is
// verified (ready to book), notify the operations team (loan ops) in-app. They can
// then open/download the executed document and draft the loan-ops email. Notifies
// every Operations user; any operator assigned via coverage is included.
export function notifyOpsDocsReady(wf: TransactionWorkflow): number {
  const ops = store.users.filter((u) => u.role === "OPERATIONS");
  let sent = 0;
  for (const u of ops) {
    addNotification({
      userId: u.id,
      type: "EXECUTED_DOC",
      title: "Executed documents ready to book",
      body: `${wf.reference} (${wf.sellerName} / ${wf.obligorName}) has executed, signature-verified documents — ready for booking/funding.`,
      ref: wf.reference,
      href: "/eligibility",
    });
    sent++;
  }
  return sent;
}

// Four-eyes exception routing: notify every user who covers the deal's seller or
// obligor, can approve exceptions, and is NOT the maker — so a second authorized
// reviewer is alerted. Safe to call on every exception request (idempotent enough;
// one event per covering reviewer per call).
export function notifyWorkflowException(wf: TransactionWorkflow, makerId: string): number {
  const reviewers = new Set<string>([
    ...usersCoveringEntity("SELLER", wf.sellerId),
    ...usersCoveringEntity("OBLIGOR", wf.obligorId),
  ]);
  reviewers.delete(makerId);
  let sent = 0;
  for (const uid of reviewers) {
    const u = storeGetUserById(uid);
    if (!u || !roleHasPermission(u.role, "APPROVE_EXCEPTION")) continue;
    addNotification({
      userId: uid,
      type: "EXCEPTION",
      title: `Exception needs a second approver`,
      body: `${wf.reference} (${wf.sellerName} / ${wf.obligorName}) has a booking exception awaiting four-eyes approval.`,
      ref: wf.reference,
      href: "/eligibility",
    });
    sent++;
  }
  return sent;
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
// Among same type+entity ACTIVE-status limits, the one that governs on a date.
// With a single candidate (the common case) it is returned unchanged. With more
// than one (a same-date renewal/overlap), the one active on the date wins —
// expiry is exclusive, so an old limit expiring on X and a new one effective on X
// hand off cleanly. Ties/none fall back to the latest-effective for determinism.
function governingLimit(cands: Limit[], asOf: string): Limit | undefined {
  if (cands.length <= 1) return cands[0];
  const active = cands.filter((l) => limitActiveOn(l, asOf));
  // Prefer a limit active on the date; then one already in effect (lapsed/open) so
  // a renewal GAP resolves to the expired limit (the engine flags it) rather than a
  // not-yet-effective one that would silently grant capacity before it takes effect.
  const effectiveAlready = cands.filter((l) => !limitNotYetEffective(l.effectiveDate, asOf));
  const pool = active.length ? active : effectiveAlready.length ? effectiveAlready : cands;
  return pool.slice().sort((a, b) => Date.parse(b.effectiveDate || "1970-01-01") - Date.parse(a.effectiveDate || "1970-01-01"))[0];
}

// Four-eyes: a limit grants capacity only when approved (or legacy/unset). While a
// new limit awaits its second approver it exists but counts for nothing.
export function limitApproved(l: Limit): boolean {
  return !l.approval || l.approval.status === "APPROVED";
}
// A limit the engine should count: active status AND approved.
function limitLive(l: Limit): boolean {
  return l.status === "ACTIVE" && limitApproved(l);
}

export function findLimit(
  type: LimitType,
  entityId: string,
  asOf?: string,
): Limit | undefined {
  const cands = store.limits.filter((l) => l.type === type && l.entityId === entityId && limitLive(l));
  if (cands.length <= 1) return cands[0];
  return governingLimit(cands, asOf ?? new Date().toISOString().slice(0, 10));
}

// Limit ids superseded on a date: within a (type,entity) group of >1 ACTIVE
// limits, every one except the governing limit. Used to drop double-counted
// duplicates from the portfolio without hiding a solo (even if lapsed) limit.
function supersededLimitIds(asOf: string): Set<string> {
  const groups = new Map<string, Limit[]>();
  for (const l of store.limits) {
    if (!limitLive(l)) continue;
    const k = `${l.type}:${l.entityId}`;
    const arr = groups.get(k);
    if (arr) arr.push(l); else groups.set(k, [l]);
  }
  const out = new Set<string>();
  for (const cands of groups.values()) {
    if (cands.length <= 1) continue;
    const gov = governingLimit(cands, asOf);
    for (const l of cands) if (l !== gov) out.add(l.id);
  }
  return out;
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
  // Suppress superseded duplicates (a same-date limit renewal) so capacity is
  // never double-counted; a solo limit still shows even once lapsed.
  const date = typeof asOf === "string" ? asOf : new Date().toISOString().slice(0, 10);
  const suppressed = supersededLimitIds(date);
  // Pending (unapproved) limits grant no capacity, so they are excluded from the
  // portfolio totals; they surface in the limit-approvals queue instead.
  return store.limits.filter((l) => !suppressed.has(l.id) && limitApproved(l)).map((l) => viewLimit(l, asOf));
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
  // Key on the full seller|obligor|invoice tuple (not the invoice number alone),
  // so approving one exception can never auto-fund a different obligor's breach.
  return new Set(
    store.exceptions
      .filter((e) => e.batchId === batchId && e.status === "APPROVED")
      .map((e) => `${e.sellerId}|${e.obligorId}|${e.invoiceNumber}`),
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
  // Every audited action is a real state change — signal it to live clients.
  bumpRevision();
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

// ---------------------------------------------------------------------------
// Change signalling. `rev` is a global counter bumped on every audited action —
// clients poll it and refresh only when it moves (live sync without pushing to
// idle screens). `recordRevs` tracks a version per editable record so a save can
// detect that someone else changed it since the editor was opened (edit-conflict
// guard) instead of silently overwriting.
// ---------------------------------------------------------------------------

export function getRevision(): number {
  return (store.rev ??= 0);
}

export function bumpRevision(): void {
  store.rev = getRevision() + 1;
}

// Current version of one record (0 if never edited). Key format is
// "type:id", e.g. "limit:LMT-SELLER-001".
export function recordRev(key: string): number {
  return (store.recordRevs ??= {})[key] ?? 0;
}

// Bump a record's version (and the global counter). Call after applying an edit.
export function bumpRecordRev(key: string): number {
  (store.recordRevs ??= {})[key] = recordRev(key) + 1;
  bumpRevision();
  return store.recordRevs[key];
}

// Edit-conflict check: true when the editor's loaded version still matches the
// current one. A null/undefined expected version skips the check (backward
// compatible with callers that do not send one).
export function recordUnchanged(key: string, expected: number | null | undefined): boolean {
  if (expected == null) return true;
  return recordRev(key) === expected;
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

// --- Dynamic roles (PM/Admin can add or remove custom roles) --------------
const BUILTIN_ROLE_KEYS = new Set(["OPERATIONS", "CREDIT_OFFICER", "PRODUCT_MANAGER", "RELATIONSHIP_MANAGER", "RISK_MANAGER", "ADMIN", "VIEWER"]);
export function isBuiltinRole(key: string): boolean { return BUILTIN_ROLE_KEYS.has(key); }
export function listRoleKeys(): string[] { return Object.keys(store.rolePermissions); }
export function roleLabelOf(key: string): string { return (store.roleLabels ??= {})[key] ?? key; }
export function listRoles(): { key: string; label: string; builtin: boolean; users: number }[] {
  return listRoleKeys().map((key) => ({ key, label: roleLabelOf(key), builtin: isBuiltinRole(key), users: store.users.filter((u) => u.role === key).length }));
}
export function addRole(label: string): { ok: boolean; error?: string; key?: string } {
  const clean = label.trim();
  if (!clean) return { ok: false, error: "A role name is required." };
  const key = clean.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!key) return { ok: false, error: "Invalid role name." };
  if (store.rolePermissions[key]) return { ok: false, error: `A role "${key}" already exists.` };
  store.rolePermissions[key] = [];
  (store.roleLabels ??= {})[key] = clean;
  return { ok: true, key };
}
export function removeRole(key: string): { ok: boolean; error?: string } {
  if (isBuiltinRole(key)) return { ok: false, error: "Built-in roles cannot be deleted." };
  if (!store.rolePermissions[key]) return { ok: false, error: "Role not found." };
  const assigned = store.users.filter((u) => u.role === key).length;
  if (assigned > 0) return { ok: false, error: `Reassign the ${assigned} user${assigned === 1 ? "" : "s"} on this role before deleting it.` };
  delete store.rolePermissions[key];
  delete (store.roleLabels ??= {})[key];
  return { ok: true };
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
  // When present, the limit is created PENDING four-eyes approval (grants no
  // capacity until a different user approves it, recording this reference).
  approval?: { reference: string; requestedBy: string; requestedByName: string };
}

export function addLimit(input: NewLimitInput): Limit {
  // Mint the id from the store-wide monotonic counter (never the live count),
  // so an id freed by a delete is never handed out again — no stale reference
  // can ever resolve to a different limit. Seed ids (LMT-<type>-NNN, 3-pad) stay
  // as-is; new ids are 5-pad and can never string-collide with them.
  store.seq += 1;
  const limit: Limit = {
    id: `LMT-${input.type}-${String(store.seq).padStart(5, "0")}`,
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
    // When a requester + reference are supplied, the limit is created PENDING and
    // grants no capacity until a second user approves it (four-eyes).
    approval: input.approval
      ? { status: "PENDING", reference: input.approval.reference, requestedBy: input.approval.requestedBy, requestedByName: input.approval.requestedByName, requestedAt: new Date().toISOString() }
      : undefined,
  };
  store.limits.push(limit);
  return limit;
}

// --- Limit approvals (four-eyes) -----------------------------------------
export function listPendingLimits(): Limit[] {
  return store.limits.filter((l) => l.approval?.status === "PENDING");
}
export function approveLimit(id: string, approverId: string, approverName: string): { ok: boolean; error?: string; limit?: Limit } {
  const l = store.limits.find((x) => x.id === id);
  if (!l || !l.approval) return { ok: false, error: "Limit approval not found." };
  if (l.approval.status === "APPROVED") return { ok: false, error: "Already approved." };
  if (l.approval.requestedBy === approverId) return { ok: false, error: "You requested this limit — a different user must approve it (four-eyes)." };
  l.approval.status = "APPROVED";
  l.approval.approvedBy = approverId;
  l.approval.approvedByName = approverName;
  l.approval.approvedAt = new Date().toISOString();
  return { ok: true, limit: l };
}
export function rejectLimit(id: string, rejecterId: string): { ok: boolean; error?: string } {
  const i = store.limits.findIndex((x) => x.id === id);
  if (i < 0 || !store.limits[i].approval) return { ok: false, error: "Limit approval not found." };
  if (store.limits[i].approval!.status === "APPROVED") return { ok: false, error: "Already approved — cannot reject." };
  if (store.limits[i].approval!.requestedBy === rejecterId) return { ok: false, error: "A different user must action this request (four-eyes)." };
  store.limits.splice(i, 1); // a rejected new limit is removed
  return { ok: true };
}

// --- Staged limit edits (four-eyes on changes to a LIVE limit) ------------
export function getLimitById(id: string): Limit | undefined {
  return store.limits.find((l) => l.id === id);
}
export function stageLimitEdit(id: string, patch: Pick<LimitPendingEdit, "approvedLimit" | "maxTenorDays" | "expiryDate">, input: { reference: string; requestedBy: string; requestedByName: string }): Limit | undefined {
  const l = getLimitById(id);
  if (!l) return undefined;
  l.pendingEdit = { ...patch, reference: input.reference, requestedBy: input.requestedBy, requestedByName: input.requestedByName, requestedAt: new Date().toISOString() };
  return l;
}
export function listPendingLimitEdits(): Limit[] {
  return store.limits.filter((l) => l.pendingEdit);
}
export function approveLimitEdit(id: string, approverId: string, approverName: string): { ok: boolean; error?: string } {
  const l = getLimitById(id);
  if (!l?.pendingEdit) return { ok: false, error: "No pending edit." };
  if (l.pendingEdit.requestedBy === approverId) return { ok: false, error: "You requested this change — a different user must approve it (four-eyes)." };
  if (l.pendingEdit.approvedLimit != null) l.approvedLimit = l.pendingEdit.approvedLimit;
  if (l.pendingEdit.maxTenorDays != null) l.maxTenorDays = l.pendingEdit.maxTenorDays;
  if (l.pendingEdit.expiryDate != null) l.expiryDate = l.pendingEdit.expiryDate;
  void approverName;
  l.pendingEdit = undefined;
  return { ok: true };
}
export function rejectLimitEdit(id: string, rejecterId: string): { ok: boolean; error?: string } {
  const l = getLimitById(id);
  if (!l?.pendingEdit) return { ok: false, error: "No pending edit." };
  if (l.pendingEdit.requestedBy === rejecterId) return { ok: false, error: "A different user must action this change (four-eyes)." };
  l.pendingEdit = undefined;
  return { ok: true };
}

// ASR sublimits (per seller/obligor pair) carry the same four-eyes model.
export function sublimitApproved(s: SellerObligorLimit): boolean {
  return !s.approval || s.approval.status === "APPROVED";
}
export function listPendingSublimits(): SellerObligorLimit[] {
  // A record is pending if its first approval is PENDING OR it carries a staged
  // edit to an already-live sublimit (four-eyes on the change).
  return store.sellerObligorLimits.filter((s) => s.approval?.status === "PENDING" || s.pendingEdit);
}
export function approveSublimit(sellerId: string, obligorId: string, approverId: string, approverName: string): { ok: boolean; error?: string } {
  const s = store.sellerObligorLimits.find((x) => x.sellerId === sellerId && x.obligorId === obligorId);
  if (!s) return { ok: false, error: "Sublimit approval not found." };
  // A staged edit to a live sublimit: the approver commits the parked value.
  if (s.pendingEdit) {
    if (s.pendingEdit.requestedBy === approverId) return { ok: false, error: "You requested this sublimit change — a different user must approve it (four-eyes)." };
    if (s.pendingEdit.approvedLimit != null) s.approvedLimit = s.pendingEdit.approvedLimit;
    if (s.pendingEdit.maxTenorDays != null) s.maxTenorDays = s.pendingEdit.maxTenorDays;
    s.pendingEdit = undefined;
    return { ok: true };
  }
  if (!s.approval) return { ok: false, error: "Sublimit approval not found." };
  if (s.approval.status === "APPROVED") return { ok: false, error: "Already approved." };
  if (s.approval.requestedBy === approverId) return { ok: false, error: "You requested this sublimit — a different user must approve it (four-eyes)." };
  s.approval.status = "APPROVED";
  s.approval.approvedBy = approverId;
  s.approval.approvedByName = approverName;
  s.approval.approvedAt = new Date().toISOString();
  return { ok: true };
}
export function rejectSublimit(sellerId: string, obligorId: string, rejecterId: string): { ok: boolean; error?: string } {
  const i = store.sellerObligorLimits.findIndex((x) => x.sellerId === sellerId && x.obligorId === obligorId);
  if (i < 0) return { ok: false, error: "Sublimit approval not found." };
  const s = store.sellerObligorLimits[i];
  // Rejecting a staged edit discards ONLY the change — the live sublimit stays.
  if (s.pendingEdit) {
    if (s.pendingEdit.requestedBy === rejecterId) return { ok: false, error: "A different user must action this request (four-eyes)." };
    s.pendingEdit = undefined;
    return { ok: true };
  }
  if (!s.approval) return { ok: false, error: "Sublimit approval not found." };
  if (s.approval.status === "APPROVED") return { ok: false, error: "Already approved — cannot reject." };
  if (s.approval.requestedBy === rejecterId) return { ok: false, error: "A different user must action this request (four-eyes)." };
  store.sellerObligorLimits.splice(i, 1);
  return { ok: true };
}

export function addSeller(input: {
  name: string;
  cdl: string;
  creditLimit: number;
  maxTenorDays: number;
  expiryDate: string;
  approval?: { reference: string; requestedBy: string; requestedByName: string };
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
    approval: input.approval,
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
  approval?: { reference: string; requestedBy: string; requestedByName: string };
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
    approval: input.approval,
  });
  return obligor;
}

export function addSellerObligorLimit(
  sellerId: string,
  obligorId: string,
  approvedLimit: number,
  maxTenorDays: number,
  approvalInput?: { reference: string; requestedBy: string; requestedByName: string },
): void {
  const approval: LimitApproval | undefined = approvalInput
    ? { status: "PENDING", reference: approvalInput.reference, requestedBy: approvalInput.requestedBy, requestedByName: approvalInput.requestedByName, requestedAt: new Date().toISOString() }
    : undefined;
  const existing = store.sellerObligorLimits.find(
    (x) => x.sellerId === sellerId && x.obligorId === obligorId,
  );
  if (existing) {
    const isLive = !existing.approval || existing.approval.status === "APPROVED";
    if (isLive && approvalInput) {
      // Four-eyes staged edit: a LIVE sublimit's approved value stays live and
      // keeps granting capacity; the change is parked in pendingEdit until a
      // second user approves it. Never overwrite the live value in place.
      existing.pendingEdit = {
        approvedLimit,
        maxTenorDays,
        reference: approvalInput.reference,
        requestedBy: approvalInput.requestedBy,
        requestedByName: approvalInput.requestedByName,
        requestedAt: new Date().toISOString(),
      };
    } else {
      // Not yet live (still pending its first approval) — safe to update in place.
      existing.approvedLimit = approvedLimit;
      existing.maxTenorDays = maxTenorDays;
      if (approval) existing.approval = approval;
    }
  } else {
    store.sellerObligorLimits.push({ sellerId, obligorId, approvedLimit, maxTenorDays, approval });
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
  asOf?: string,
): Limit | undefined {
  // Resolve the GOVERNING swingline for the date (mirrors findLimit), so at a
  // swingline renewal overlap it picks the same record as the seller/obligor line
  // it mirrors — not just the first live one.
  const cands = store.limits.filter(
    (l) => l.type === "SWINGLINE" && l.entityType === entityType && l.entityId === entityId && limitLive(l),
  );
  if (cands.length <= 1) return cands[0];
  return governingLimit(cands, asOf ?? new Date().toISOString().slice(0, 10));
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
