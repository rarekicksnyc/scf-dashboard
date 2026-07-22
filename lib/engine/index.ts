import type {
  Invoice,
  InvoiceResult,
  CheckResult,
  EligibilityStatus,
  BatchResult,
  BatchSummary,
  LimitView,
  Seller,
  Program,
  InvoiceFunding,
  DateWindow,
} from "@/lib/types";
import {
  findLimit,
  getSeller,
  getObligor,
  getProgram,
  activeInvestors,
  activePolicies,
  viewLimit,
} from "@/lib/data/store";
import {
  makeWorking,
  consume,
  viewOf,
  type WorkingLimit,
} from "./availability";
import {
  planFunding,
  type AllocContext,
  type InvestorSlot,
  type PolicySlot,
} from "./allocation";
import { priceDeal } from "@/lib/pricing";
import { obligorEntityFindings } from "./obligorEntity";
import { DEFAULT_MARGIN_BPS } from "@/lib/config";
import { mm2 as fmt, daysBetween } from "@/lib/format";

// ---------------------------------------------------------------------------
// Eligibility engine. Pure over its inputs (store snapshot + invoice list) —
// it never mutates the store. Callers persist the result.
// ---------------------------------------------------------------------------

// A limit check reads a working limit's available capacity and returns a
// standard result. It does NOT consume — consumption happens once, after all
// checks pass, so a failed invoice never eats capacity.
function capacityCheck(
  checkName: string,
  working: WorkingLimit | undefined,
  amount: number,
  missingIsFail: boolean,
): CheckResult | null {
  if (!working) {
    if (!missingIsFail) return null; // limit type not applicable
    return {
      checkName,
      status: "FAIL",
      severity: "RED",
      message: `No active ${checkName.replace("_CHECK", "").replace(/_/g, " ").toLowerCase()} found.`,
      breachAmount: amount,
    };
  }
  const available = working.available;
  if (amount > available) {
    const breach = amount - available;
    // Above approved ceiling entirely → hard reject. Otherwise route to
    // exception (credit can approve a temporary excess).
    const overCeiling = working.consumed >= working.approvedLimit;
    return {
      checkName,
      status: overCeiling ? "FAIL" : "EXCEPTION",
      severity: overCeiling ? "RED" : "ORANGE",
      message: `Exceeds available capacity by ${fmt(breach)} (available ${fmt(available)}).`,
      breachAmount: breach,
    };
  }
  // Warn as the invoice pushes utilization past the warn threshold.
  const projected = (working.consumed + amount) / working.approvedLimit;
  if (projected >= working.limit.warnThreshold) {
    return {
      checkName,
      status: "PASS_WITH_WARNING",
      severity: "YELLOW",
      message: `Passes; utilization reaches ${(projected * 100).toFixed(1)}% after funding.`,
    };
  }
  return {
    checkName,
    status: "PASS",
    severity: "GREEN",
    message: "Within available capacity.",
  };
}

// The tightest applicable max tenor across every limit that binds the invoice.
function tenorCheck(
  tenorDays: number,
  program: Program,
  sellerLimitTenor: number | undefined,
  asrLimitTenor: number | undefined,
  obligorLimitTenor: number | undefined,
): CheckResult {
  const candidates: Array<[string, number | undefined]> = [
    ["program", program.maxTenorDays],
    ["seller", sellerLimitTenor],
    ["ASR", asrLimitTenor],
    ["obligor", obligorLimitTenor],
  ];
  let bindingName = "program";
  let permitted = Infinity;
  for (const [name, days] of candidates) {
    if (days != null && days < permitted) {
      permitted = days;
      bindingName = name;
    }
  }
  if (tenorDays > permitted) {
    return {
      checkName: "MAX_TENOR_CHECK",
      status: "FAIL",
      severity: "RED",
      message: `Tenor ${tenorDays}d exceeds ${bindingName} max tenor ${permitted}d by ${tenorDays - permitted}d.`,
    };
  }
  return {
    checkName: "MAX_TENOR_CHECK",
    status: "PASS",
    severity: "GREEN",
    message: `Tenor ${tenorDays}d within ${bindingName} max ${permitted}d.`,
  };
}

// Legal documentation completeness (Phase 4). Any required document that is not
// RECEIVED routes the invoice to exception — funding is blocked until the docs
// are in place.
function documentCheck(seller: Seller | undefined): CheckResult | null {
  if (!seller) return null;
  const bad = seller.documents.filter((d) => d.status !== "RECEIVED");
  if (bad.length === 0) return null;
  return {
    checkName: "DOCUMENT_CHECK",
    status: "EXCEPTION",
    severity: "ORANGE",
    message: `Missing/expired legal document(s): ${bad
      .map((d) => `${d.type} (${d.status})`)
      .join(", ")}.`,
  };
}

function finalStatus(checks: CheckResult[]): EligibilityStatus {
  if (checks.some((c) => c.severity === "RED")) return "REJECTED";
  if (checks.some((c) => c.severity === "ORANGE")) return "EXCEPTION_REQUIRED";
  if (checks.some((c) => c.severity === "YELLOW")) return "ELIGIBLE_WITH_WARNING";
  return "ELIGIBLE";
}

interface WorkingSet {
  seller?: WorkingLimit;
  asr?: WorkingLimit;
  swingline?: WorkingLimit;
  obligors: Map<string, WorkingLimit>;
  alloc: AllocContext;
  window?: DateWindow; // batch's value-to-maturity span for time-phasing reservations
}

// window is the batch's overall [earliest value, latest maturity] span. Seeding
// each limit's starting available from viewLimit(limit, window) means only
// reservations whose own window overlaps the batch reduce its capacity — a
// reservation outside the batch's active period does not, matching the
// interactive engine. Investor/insurance capacity is not reservation-driven.
function buildWorkingSet(seller: Seller, window?: DateWindow): WorkingSet {
  const sellerLimit = findLimit("SELLER", seller.id);
  const asrLimit = findLimit("ASR", seller.id);
  // Swingline is per-entity now — the seller's own swingline (if it has one).
  const swinglineLimit = findLimit("SWINGLINE", seller.id);

  const investors: InvestorSlot[] = activeInvestors()
    .map((master) => {
      const limit = findLimit("INVESTOR", master.id);
      if (!limit) return null;
      return { master, working: makeWorking(viewLimit(limit)) } satisfies InvestorSlot;
    })
    .filter((s): s is InvestorSlot => s !== null);

  const policies: PolicySlot[] = activePolicies()
    .map((master) => {
      const limit = findLimit("INSURANCE", master.id);
      if (!limit) return null;
      return { master, working: makeWorking(viewLimit(limit)) } satisfies PolicySlot;
    })
    .filter((s): s is PolicySlot => s !== null);

  return {
    seller: sellerLimit ? makeWorking(viewLimit(sellerLimit, window)) : undefined,
    asr: asrLimit ? makeWorking(viewLimit(asrLimit, window)) : undefined,
    swingline: swinglineLimit ? makeWorking(viewLimit(swinglineLimit, window)) : undefined,
    obligors: new Map(),
    alloc: { investors, policies },
    window,
  };
}

function workingObligor(ws: WorkingSet, obligorId: string): WorkingLimit | undefined {
  if (ws.obligors.has(obligorId)) return ws.obligors.get(obligorId);
  const limit = findLimit("OBLIGOR", obligorId);
  const w = limit ? makeWorking(viewLimit(limit, ws.window)) : undefined;
  if (w) ws.obligors.set(obligorId, w);
  return w;
}

// ---------------------------------------------------------------------------
// runBatch: process invoices in order against a single working snapshot so
// cumulative batch consumption is captured correctly.
// ---------------------------------------------------------------------------

export function runBatch(
  invoices: Invoice[],
  meta: { batchId: string; fileName: string; uploadedAt: string; makerUserId: string },
  options: { approvedOverrides?: Set<string> } = {},
): BatchResult {
  const overrides = options.approvedOverrides ?? new Set<string>();
  const sellerId = invoices[0]?.sellerId;
  const seller = sellerId ? getSeller(sellerId) : undefined;
  const program = seller ? getProgram(seller.programId) : undefined;

  // The batch's overall active span — from the earliest requested value date to
  // the latest due (maturity) date — is the window used to time-phase
  // reservations against this batch.
  const batchWindow: DateWindow | undefined = invoices.length
    ? {
        from: invoices.reduce((m, i) => (i.requestedDiscountDate < m ? i.requestedDiscountDate : m), invoices[0].requestedDiscountDate),
        to: invoices.reduce((m, i) => (i.dueDate > m ? i.dueDate : m), invoices[0].dueDate),
      }
    : undefined;

  const results: InvoiceResult[] = [];
  const ws: WorkingSet = seller
    ? buildWorkingSet(seller, batchWindow)
    : { obligors: new Map(), alloc: { investors: [], policies: [] } };

  // Legal documentation is a seller/program-level condition — evaluated once
  // and applied to every invoice in the batch.
  const docCheck = documentCheck(seller);

  const seenInFile = new Set<string>();

  for (const invoice of invoices) {
    const checks: CheckResult[] = [];
    const amount = invoice.amount;

    if (docCheck) checks.push(docCheck);

    // --- Data + status validation ------------------------------------------
    if (!seller || seller.id !== invoice.sellerId) {
      checks.push({
        checkName: "SELLER_STATUS_CHECK",
        status: "FAIL",
        severity: "RED",
        message: `Unknown or mixed seller '${invoice.sellerId}'.`,
      });
    } else if (seller.status !== "ACTIVE") {
      checks.push({
        checkName: "SELLER_STATUS_CHECK",
        status: "FAIL",
        severity: "RED",
        message: `Seller status is ${seller.status}.`,
      });
    } else {
      checks.push({
        checkName: "SELLER_STATUS_CHECK",
        status: "PASS",
        severity: "GREEN",
        message: "Seller active.",
      });
    }

    const obligor = getObligor(invoice.obligorId);
    if (!obligor) {
      checks.push({
        checkName: "OBLIGOR_STATUS_CHECK",
        status: "FAIL",
        severity: "RED",
        message: `Unknown obligor '${invoice.obligorId}'.`,
      });
    } else if (obligor.status === "SUSPENDED" || obligor.status === "EXPIRED") {
      checks.push({
        checkName: "OBLIGOR_STATUS_CHECK",
        status: "FAIL",
        severity: "RED",
        message: `Obligor status is ${obligor.status}.`,
      });
    } else if (obligor.status === "WATCHLIST") {
      checks.push({
        checkName: "OBLIGOR_STATUS_CHECK",
        status: "EXCEPTION",
        severity: "ORANGE",
        message: "Obligor is on watchlist — approval required.",
      });
    } else {
      checks.push({
        checkName: "OBLIGOR_STATUS_CHECK",
        status: "PASS",
        severity: "GREEN",
        message: "Obligor active.",
      });
    }

    // Obligor legal entity (multi-entity) — when the schedule names a specific
    // entity within the group, gate it on the same rules as the interactive
    // engine (shared helper). It still consumes the group aggregate below.
    if (invoice.obligorEntityId) {
      const entityAdvance = Math.round(amount * (invoice.advanceRate ?? 1));
      for (const fnd of obligorEntityFindings(invoice.obligorEntityId, invoice.obligorId, entityAdvance, invoice.requestedDiscountDate)) {
        if (fnd.severity === "GREY") continue; // batch has no N/A row
        checks.push({
          checkName: fnd.key,
          status: fnd.severity === "GREEN" ? "PASS" : fnd.severity === "ORANGE" ? "EXCEPTION" : "FAIL",
          severity: fnd.severity,
          message: fnd.message,
        });
      }
    }

    // Duplicate within the uploaded file.
    const dupKey = `${invoice.sellerId}|${invoice.obligorId}|${invoice.invoiceNumber}`;
    if (seenInFile.has(dupKey)) {
      checks.push({
        checkName: "DUPLICATE_INVOICE_CHECK",
        status: "FAIL",
        severity: "RED",
        message: "Duplicate invoice number within this batch.",
      });
    } else {
      seenInFile.add(dupKey);
      checks.push({
        checkName: "DUPLICATE_INVOICE_CHECK",
        status: "PASS",
        severity: "GREEN",
        message: "No duplicate.",
      });
    }

    // Amount + currency sanity.
    if (!(amount > 0)) {
      checks.push({
        checkName: "INVOICE_DATA_CHECK",
        status: "FAIL",
        severity: "RED",
        message: "Invoice amount is missing or non-positive.",
      });
    }
    if (seller && invoice.currency !== seller.currency) {
      checks.push({
        checkName: "CURRENCY_CHECK",
        status: "FAIL",
        severity: "RED",
        message: `Currency ${invoice.currency} does not match program currency ${seller.currency}.`,
      });
    }

    // --- Tenor -------------------------------------------------------------
    const tenorDays = daysBetween(invoice.requestedDiscountDate, invoice.dueDate);
    if (program) {
      checks.push(
        tenorCheck(
          tenorDays,
          program,
          ws.seller?.limit.maxTenorDays,
          ws.asr?.limit.maxTenorDays,
          workingObligor(ws, invoice.obligorId)?.limit.maxTenorDays,
        ),
      );
    }

    // --- Limit capacity checks (read-only; consumption is deferred) --------
    const sellerCheck = capacityCheck("SELLER_LIMIT_CHECK", ws.seller, amount, true);
    if (sellerCheck) checks.push(sellerCheck);

    const asrCheck = capacityCheck("ASR_LIMIT_CHECK", ws.asr, amount, true);
    if (asrCheck) checks.push(asrCheck);

    const obligorWorking = workingObligor(ws, invoice.obligorId);
    const obligorCheck = capacityCheck(
      "OBLIGOR_LIMIT_CHECK",
      obligorWorking,
      amount,
      true,
    );
    if (obligorCheck) checks.push(obligorCheck);

    // --- Funding allocation (Phase 3) --------------------------------------
    // Plan how the invoice would be funded: investor takeout first, bank-held
    // residual second, insurance overlay on the bank-held portion. The plan
    // reads current capacities but does not consume — consumption is committed
    // below only for eligible invoices. Skipped once a hard reject exists.
    const hasHardReject = checks.some((c) => c.severity === "RED");
    let funding: InvoiceFunding | undefined;
    if (!hasHardReject) {
      funding = planFunding(
        amount,
        invoice.obligorId,
        invoice.currency,
        tenorDays,
        ws.alloc,
      );
      // Swingline funds the bank-held portion temporarily pending distribution.
      const swinglineCheck = capacityCheck(
        "SWINGLINE_LIMIT_CHECK",
        ws.swingline,
        funding.bankHeld,
        false,
      );
      if (swinglineCheck) checks.push(swinglineCheck);
    }

    // --- Pricing (shared with the eligibility engine) ----------------------
    const coverage = invoice.coverageAmount ?? amount * (invoice.advanceRate ?? 1);
    const pricing = priceDeal({
      productType: invoice.productType,
      baseRateType: invoice.baseRateType,
      baseRate: invoice.baseRate,
      marginBps: invoice.marginBps ?? DEFAULT_MARGIN_BPS,
      coverage,
      tenorDays,
    });
    const discountRate = pricing.allInRatePct / 100;
    const discountFee = pricing.productType === "UTRC" ? pricing.commitmentFee : pricing.discount;
    const netProceeds = pricing.purchasePrice;

    let status = finalStatus(checks);
    // Checker-approved override: an EXCEPTION_REQUIRED invoice whose breach a
    // checker approved is upgraded to EXCEPTION_APPROVED and funds (recording a
    // temporary excess against the breached limit).
    if (status === "EXCEPTION_REQUIRED" && overrides.has(invoice.invoiceNumber)) {
      status = "EXCEPTION_APPROVED";
    }
    const funded =
      status === "ELIGIBLE" ||
      status === "ELIGIBLE_WITH_WARNING" ||
      status === "EXCEPTION_APPROVED";

    // Only consume capacity for invoices that are eligible or merely warned.
    // Rejected / exception invoices do NOT eat capacity — they await a decision.
    if (funded) {
      if (ws.seller) consume(ws.seller, amount);
      if (ws.asr) consume(ws.asr, amount);
      if (obligorWorking) consume(obligorWorking, amount);
      if (funding) {
        if (ws.swingline) consume(ws.swingline, funding.bankHeld);
        for (const leg of funding.legs) {
          if (leg.source === "INVESTOR" && leg.sourceId) {
            const slot = ws.alloc.investors.find(
              (s) => s.master.id === leg.sourceId,
            );
            if (slot) consume(slot.working, leg.amount);
          }
        }
        if (funding.policyId && funding.insuredAmount > 0) {
          const pol = ws.alloc.policies.find(
            (s) => s.master.id === funding!.policyId,
          );
          if (pol) consume(pol.working, funding.insuredAmount);
        }
      }
    }

    const breachAmount = Math.max(
      0,
      ...checks.map((c) => c.breachAmount ?? 0),
    );

    results.push({
      invoice,
      tenorDays,
      discountRate,
      discountFee,
      netProceeds,
      checks,
      status,
      breachAmount,
      funding: funded ? funding : undefined,
      settlementStatus: funded ? "PENDING" : "NOT_APPLICABLE",
    });
  }

  const summary = summarize(results);
  const postBatchLimits = collectPostBatchLimits(ws);

  return {
    batchId: meta.batchId,
    sellerId: sellerId ?? "",
    uploadedAt: meta.uploadedAt,
    fileName: meta.fileName,
    makerUserId: meta.makerUserId,
    summary,
    results,
    postBatchLimits,
  };
}

function summarize(results: InvoiceResult[]): BatchSummary {
  const s: BatchSummary = {
    totalCount: results.length,
    eligibleCount: 0,
    warningCount: 0,
    exceptionCount: 0,
    rejectedCount: 0,
    totalRequested: 0,
    eligibleAmount: 0,
    exceptionAmount: 0,
    rejectedAmount: 0,
  };
  for (const r of results) {
    s.totalRequested += r.invoice.amount;
    switch (r.status) {
      case "ELIGIBLE":
        s.eligibleCount++;
        s.eligibleAmount += r.invoice.amount;
        break;
      case "ELIGIBLE_WITH_WARNING":
        s.warningCount++;
        s.eligibleAmount += r.invoice.amount;
        break;
      case "EXCEPTION_APPROVED":
        s.eligibleCount++;
        s.eligibleAmount += r.invoice.amount;
        break;
      case "EXCEPTION_REQUIRED":
        s.exceptionCount++;
        s.exceptionAmount += r.invoice.amount;
        break;
      case "REJECTED":
      case "PENDING_DATA":
        s.rejectedCount++;
        s.rejectedAmount += r.invoice.amount;
        break;
    }
  }
  return s;
}

function collectPostBatchLimits(ws: WorkingSet): LimitView[] {
  const views: LimitView[] = [];
  if (ws.seller) views.push(viewOf(ws.seller));
  if (ws.asr) views.push(viewOf(ws.asr));
  if (ws.swingline) views.push(viewOf(ws.swingline));
  for (const w of ws.obligors.values()) views.push(viewOf(w));
  for (const s of ws.alloc.investors) views.push(viewOf(s.working));
  for (const s of ws.alloc.policies) views.push(viewOf(s.working));
  return views;
}
