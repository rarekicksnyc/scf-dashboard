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
  sellerObligorLimit,
  sellerObligorUsage,
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
import { sellerDomicileFinding, obligorGroupDomicileFinding } from "./domicile";
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
  // Pick each governing limit for the batch window's value date, so selection and
  // time-phased consumption both key off the same date (parity with the
  // interactive engine, which uses txn.valueDate = window.from).
  const sellerLimit = findLimit("SELLER", seller.id, window?.from);
  const asrLimit = findLimit("ASR", seller.id, window?.from);
  // Swingline is per-entity now — the seller's own swingline (if it has one).
  const swinglineLimit = findLimit("SWINGLINE", seller.id, window?.from);

  // Time-phase investor/insurance capacity to the SAME batch window as the credit
  // lines (parity with the interactive engine, which windows them) — selecting the
  // governing limit at the window's value date and viewing consumption over it.
  const investors: InvestorSlot[] = activeInvestors()
    .map((master) => {
      const limit = findLimit("INVESTOR", master.id, window?.from);
      if (!limit) return null;
      return { master, working: makeWorking(viewLimit(limit, window)) } satisfies InvestorSlot;
    })
    .filter((s): s is InvestorSlot => s !== null);

  const policies: PolicySlot[] = activePolicies()
    .map((master) => {
      const limit = findLimit("INSURANCE", master.id, window?.from);
      if (!limit) return null;
      return { master, working: makeWorking(viewLimit(limit, window)) } satisfies PolicySlot;
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
  const limit = findLimit("OBLIGOR", obligorId, ws.window?.from);
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
    const amount = invoice.amount; // invoice FACE amount (for data validation / reporting)
    // The COVERAGE (funded / advance) amount is what actually draws the limits and
    // is what the ledger books — so every capacity check, funding plan, and
    // consumption below uses coverage, not face. This keeps the batch engine in
    // agreement with the interactive engine and the booked ledger.
    const coverage = invoice.coverageAmount ?? amount * (invoice.advanceRate ?? 1);

    // The funded amount that draws the limits must be positive — a negative or
    // zero coverage would trivially pass every capacity check and bypass four-eyes.
    if (!(coverage > 0)) {
      checks.push({ checkName: "INVOICE_DATA_CHECK", status: "FAIL", severity: "RED", message: `Coverage/funded amount must be positive (got ${Math.round(coverage)}).` });
    }

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

    // Commingling / buffer days vs the seller facility's approved days. Only when
    // both are present; over the approved days needs an exception (does not block).
    if (seller && invoice.bufferDays != null && seller.comminglingDays != null && invoice.bufferDays > seller.comminglingDays) {
      checks.push({
        checkName: "COMMINGLING_CHECK",
        status: "EXCEPTION",
        severity: "ORANGE",
        message: `Buffer days ${invoice.bufferDays}d exceed the approved commingling days ${seller.comminglingDays}d — exception required.`,
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

    // Domicile enforceability — same shared rules as the interactive engine
    // (parity): seller jurisdiction, and the obligor GROUP jurisdiction when no
    // specific legal entity is booked (the entity's own domicile is checked above).
    const domFindings = [
      seller ? sellerDomicileFinding(seller) : null,
      obligorGroupDomicileFinding(invoice.obligorId, invoice.obligorEntityId),
    ];
    for (const fnd of domFindings) {
      if (!fnd || fnd.severity === "GREY") continue;
      checks.push({
        checkName: fnd.key,
        status: fnd.severity === "GREEN" ? "PASS" : fnd.severity === "ORANGE" ? "EXCEPTION" : "FAIL",
        severity: fnd.severity,
        message: fnd.message,
      });
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
    // Checked against COVERAGE (the funded amount that draws the line), not face.
    const sellerCheck = capacityCheck("SELLER_LIMIT_CHECK", ws.seller, coverage, true);
    if (sellerCheck) checks.push(sellerCheck);

    const asrCheck = capacityCheck("ASR_LIMIT_CHECK", ws.asr, coverage, true);
    if (asrCheck) checks.push(asrCheck);

    // Per-obligor ASR sublimit + approved-list gate (parity with the interactive
    // engine): funds only obligors on the seller's ASR approved list, within the
    // pair sublimit; a pending (four-eyes) sublimit grants no capacity.
    if (seller && getObligor(invoice.obligorId)) {
      const sol = sellerObligorLimit(seller.id, invoice.obligorId);
      const win: DateWindow | undefined = invoice.requestedDiscountDate && invoice.dueDate ? { from: invoice.requestedDiscountDate, to: invoice.dueDate } : undefined;
      if (!sol) {
        checks.push({ checkName: "ASR_SUBLIMIT_CHECK", status: "FAIL", severity: "RED", message: `Obligor '${invoice.obligorId}' is not on ${seller.name}'s ASR approved list.` });
      } else if (sol.approval?.status === "PENDING") {
        // A governance-PENDING sublimit grants no capacity and is NOT a breach a
        // checker may override — hard reject (RED), matching the interactive engine
        // (eligibility.ts). ORANGE would let an exception override fund it.
        checks.push({ checkName: "ASR_SUBLIMIT_CHECK", status: "FAIL", severity: "RED", message: "ASR sublimit is pending four-eyes approval — it grants no capacity until a second user approves it." });
      } else {
        // Tenor gate against the pair sublimit's own approved tenor (parity with
        // eligibility.ts) — a deal over sol.maxTenorDays is a hard reject.
        if (tenorDays > sol.maxTenorDays) {
          checks.push({ checkName: "ASR_SUBLIMIT_CHECK", status: "FAIL", severity: "RED", message: `Tenor ${tenorDays}d exceeds the ASR sublimit max ${sol.maxTenorDays}d by ${tenorDays - sol.maxTenorDays}d.` });
        }
        const avail = sol.approvedLimit - sellerObligorUsage(seller.id, invoice.obligorId, win);
        if (coverage > avail) {
          checks.push({ checkName: "ASR_SUBLIMIT_CHECK", status: "EXCEPTION", severity: "ORANGE", message: `ASR sublimit: draws ${Math.round(coverage)} but only ${Math.round(Math.max(avail, 0))} available — exceeds by ${Math.round(coverage - avail)}.` });
        } else {
          checks.push({ checkName: "ASR_SUBLIMIT_CHECK", status: "PASS", severity: "GREEN", message: "Within the ASR sublimit." });
        }
      }
    }

    const obligorWorking = workingObligor(ws, invoice.obligorId);
    const obligorCheck = capacityCheck(
      "OBLIGOR_LIMIT_CHECK",
      obligorWorking,
      coverage,
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
        coverage,
        invoice.obligorId,
        invoice.currency,
        tenorDays,
        ws.alloc,
      );
      // The swingline MIRRORS the seller credit line — whatever books on the credit
      // limit books on the swingline at the SAME amount (parity with the interactive
      // engine at eligibility.ts:174-182 and the store's swingline consumption,
      // which mirror the full seller booking, NOT the post-distribution residual).
      const swinglineCheck = capacityCheck(
        "SWINGLINE_LIMIT_CHECK",
        ws.swingline,
        coverage,
        false,
      );
      if (swinglineCheck) checks.push(swinglineCheck);
    }

    // --- Pricing (shared with the eligibility engine) ----------------------
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
    if (status === "EXCEPTION_REQUIRED" && overrides.has(`${invoice.sellerId}|${invoice.obligorId}|${invoice.invoiceNumber}`)) {
      status = "EXCEPTION_APPROVED";
    }
    const funded =
      status === "ELIGIBLE" ||
      status === "ELIGIBLE_WITH_WARNING" ||
      status === "EXCEPTION_APPROVED";

    // Only consume capacity for invoices that are eligible or merely warned.
    // Rejected / exception invoices do NOT eat capacity — they await a decision.
    if (funded) {
      if (ws.seller) consume(ws.seller, coverage);
      if (ws.asr) consume(ws.asr, coverage);
      if (obligorWorking) consume(obligorWorking, coverage);
      if (funding) {
        if (ws.swingline) consume(ws.swingline, coverage); // swingline mirrors the seller line at full amount
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
