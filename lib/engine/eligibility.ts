import {
  getSeller,
  getObligor,
  getInvestor,
  getInsurancePolicy,
  findLimit,
  viewLimit,
  entitySwingline,
  sellerObligorLimit,
  sellerObligorUsage,
  participationAgreement,
  insuranceBuyerSublimit,
  insuranceCountryLimit,
} from "@/lib/data/store";
import type {
  DiscountTransaction,
  EligibilityCheck,
  EligibilityReport,
  EligibilityCategory,
  InvoiceType,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// MARS-style consolidated eligibility engine. Runs a single discount
// transaction against every seller-facility and transaction parameter and
// returns one categorized report. This is the "check against every aspect in
// one" flow.
//
// Limits are checked against the FUNDED (advance) amount = invoice x advance
// rate, since that is what actually consumes capacity. The obligor is checked
// against BOTH its master line and the per-seller ASR sublimit (tightest binds).
// ---------------------------------------------------------------------------

// Typical advance-rate cap by invoice type. The business line may price above
// these per transaction for return, so exceeding a cap warns rather than fails.
const TYPE_CAP: Record<InvoiceType, number> = {
  FINAL: 1.0,
  PROVISIONAL: 0.9,
  PIPELINE: 0.85,
};

type Sev = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "GREY";

function mm(n: number): string {
  return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}MM`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function expired(dateISO: string | undefined, asOf: string): boolean {
  if (!dateISO) return true;
  return Date.parse(dateISO) < Date.parse(asOf);
}

export function checkDiscount(txn: DiscountTransaction): EligibilityReport {
  const checks: EligibilityCheck[] = [];
  const add = (
    category: EligibilityCategory,
    name: string,
    checkedAgainst: string,
    txnValue: string,
    severity: Sev,
    message: string,
  ) => {
    const status =
      severity === "GREEN"
        ? "PASS"
        : severity === "RED"
          ? "FAIL"
          : severity === "GREY"
            ? "NA"
            : "WARN";
    checks.push({ category, name, checkedAgainst, txnValue, status, severity, message });
  };

  const advanceAmount = Math.round(txn.invoiceAmount * txn.advanceRate);
  const tenorDays = daysBetween(txn.valueDate, txn.maturityDate);
  const seller = getSeller(txn.sellerId);
  const obligor = getObligor(txn.obligorId);

  // A capacity comparison. Exceeding available capacity does NOT clear — the
  // transaction can only be performed up to the available amount, so the check
  // fails and reports the max performable.
  const capacity = (
    cat: EligibilityCategory,
    name: string,
    available: number,
    _approved: number,
    _consumed: number,
    amount: number,
  ) => {
    if (amount > available) {
      const performable = Math.max(available, 0);
      add(cat, name, `${mm(available)} available`, mm(amount), "RED",
        `Does not clear — only ${mm(performable)} of ${mm(amount)} is within the limit (short by ${mm(amount - available)}).`);
    } else {
      add(cat, name, `${mm(available)} available`, mm(amount), "GREEN",
        `Within available capacity.`);
    }
  };

  // ---------------- SELLER FACILITY ----------------
  if (!seller) {
    add("SELLER", "Seller eligible", "Known & eligible seller", txn.sellerId, "RED",
      "Unknown seller.");
  } else {
    add("SELLER", "Seller eligible", "Eligible & active", `${seller.status}${seller.eligible ? "" : " / ineligible"}`,
      seller.eligible && seller.status === "ACTIVE" ? "GREEN" : "RED",
      seller.eligible && seller.status === "ACTIVE" ? "Seller eligible and active." : "Seller not eligible/active.");

    const sl = findLimit("SELLER", seller.id);
    if (sl) {
      const v = viewLimit(sl);
      capacity("SELLER", "Seller credit limit", v.available, v.approvedLimit, v.consumed, advanceAmount);
      add("SELLER", "Credit limit expiry", sl.expiryDate, txn.valueDate,
        expired(sl.expiryDate, txn.valueDate) ? "RED" : "GREEN",
        expired(sl.expiryDate, txn.valueDate) ? "Credit limit expires before value date." : "Credit limit valid through value date.");
      add("SELLER", "Seller max tenor", `${sl.maxTenorDays}d`, `${tenorDays}d`,
        tenorDays > sl.maxTenorDays ? "RED" : "GREEN",
        tenorDays > sl.maxTenorDays ? `Tenor exceeds seller max by ${tenorDays - sl.maxTenorDays}d.` : "Within seller max tenor.");
    } else {
      add("SELLER", "Seller credit limit", "Active seller limit", "—", "RED", "No active seller credit limit.");
    }

    add("SELLER", "Borrower rating", `${seller.borrowerRating} exp ${seller.borrowerRatingExpiry || "—"}`, txn.valueDate,
      expired(seller.borrowerRatingExpiry, txn.valueDate) ? "ORANGE" : "GREEN",
      expired(seller.borrowerRatingExpiry, txn.valueDate) ? "Borrower rating expired — refresh required." : "Borrower rating current.");
    add("SELLER", "ASR rating", `${seller.asrRating} exp ${seller.asrExpiry || "—"}`, txn.valueDate,
      expired(seller.asrExpiry, txn.valueDate) ? "ORANGE" : "GREEN",
      expired(seller.asrExpiry, txn.valueDate) ? "ASR rating expired — refresh required." : "ASR rating current.");

    // Seller swingline (only if the transaction draws swingline)
    const ssw = entitySwingline("SELLER", seller.id);
    if (!txn.usesSwingline) {
      add("SELLER", "Seller swingline", "Applies when drawn", "does not draw swingline", "GREY", "Transaction does not draw swingline.");
    } else if (ssw) {
      const v = viewLimit(ssw);
      capacity("SELLER", "Seller swingline", v.available, v.approvedLimit, v.consumed, advanceAmount);
    } else {
      add("SELLER", "Seller swingline", "Swingline configured", "draws swingline", "ORANGE", "Transaction draws swingline but seller has none configured.");
    }

    // RRL — only counted when enabled
    if (seller.rrlEnabled) {
      const rrlBreach = advanceAmount > seller.rrlLimit;
      const rrlExp = expired(seller.rrlExpiry, txn.valueDate);
      add("SELLER", "RRL (Risk Reimbursement Line)",
        `${mm(seller.rrlLimit)} limit exp ${seller.rrlExpiry || "—"}`, mm(advanceAmount),
        rrlExp ? "RED" : rrlBreach ? "ORANGE" : "GREEN",
        rrlExp ? "RRL expired." : rrlBreach ? `Exceeds RRL by ${mm(advanceAmount - seller.rrlLimit)}.` : "Within RRL.");
    } else {
      add("SELLER", "RRL (Risk Reimbursement Line)", "Not enabled", "—", "GREY", "Seller has no RRL (toggle off).");
    }

    add("SELLER", "Minimum pricing", `${seller.minPricingBps}bps floor`, `${txn.pricingBps}bps`,
      txn.pricingBps < seller.minPricingBps ? "RED" : "GREEN",
      txn.pricingBps < seller.minPricingBps ? `Below seller pricing floor by ${seller.minPricingBps - txn.pricingBps}bps.` : "At/above pricing floor.");
    add("SELLER", "Seller guarantor", seller.guarantor || "None", "—",
      seller.guarantor && seller.guarantor !== "None" ? "GREEN" : "GREY",
      seller.guarantor && seller.guarantor !== "None" ? "Guarantor on file." : "No guarantor.");
    add("SELLER", "GCARS #", "On file", seller.gcarsNumber || "—",
      seller.gcarsNumber ? "GREEN" : "ORANGE",
      seller.gcarsNumber ? "GCARS reference present." : "Missing GCARS reference.");
  }

  // ---------------- OBLIGOR ----------------
  if (!obligor) {
    add("OBLIGOR", "Obligor eligible", "Known & eligible obligor", txn.obligorId, "RED", "Unknown obligor.");
  } else {
    const sev: Sev =
      obligor.eligible && obligor.status === "ACTIVE"
        ? "GREEN"
        : obligor.status === "WATCHLIST"
          ? "ORANGE"
          : "RED";
    add("OBLIGOR", "Obligor eligible", "Eligible & active", `${obligor.status}${obligor.eligible ? "" : " / ineligible"}`, sev,
      sev === "GREEN" ? "Obligor eligible and active." : sev === "ORANGE" ? "Obligor on watchlist — approval required." : "Obligor not eligible.");

    add("OBLIGOR", "Obligor guarantee", obligor.hasGuarantee ? "Guarantee on file" : "None", obligor.hasGuarantee ? "Yes" : "No",
      obligor.hasGuarantee ? "GREEN" : "GREY",
      obligor.hasGuarantee ? "Obligor guarantee present." : "No obligor guarantee.");
    if (obligor.hasGuarantee) {
      add("OBLIGOR", "Guarantee eligibility", "Eligible guarantee", obligor.guaranteeEligible ? "Eligible" : "Not eligible",
        obligor.guaranteeEligible ? "GREEN" : "ORANGE",
        obligor.guaranteeEligible ? "Guarantee eligible." : "Guarantee not eligible — approval required.");
    }

    const ol = findLimit("OBLIGOR", obligor.id);
    if (ol) {
      const v = viewLimit(ol);
      capacity("OBLIGOR", "Obligor master limit", v.available, v.approvedLimit, v.consumed, advanceAmount);
      add("OBLIGOR", "Obligor max tenor", `${ol.maxTenorDays}d`, `${tenorDays}d`,
        tenorDays > ol.maxTenorDays ? "RED" : "GREEN",
        tenorDays > ol.maxTenorDays ? `Tenor exceeds obligor max by ${tenorDays - ol.maxTenorDays}d.` : "Within obligor max tenor.");
    } else {
      add("OBLIGOR", "Obligor master limit", "Active obligor limit", "—", "RED", "No active obligor limit.");
    }

    const osw = entitySwingline("OBLIGOR", obligor.id);
    if (!txn.usesSwingline) {
      add("OBLIGOR", "Obligor swingline", "Applies when drawn", "does not draw swingline", "GREY", "Transaction does not draw swingline.");
    } else if (osw) {
      const v = viewLimit(osw);
      capacity("OBLIGOR", "Obligor swingline", v.available, v.approvedLimit, v.consumed, advanceAmount);
    } else {
      add("OBLIGOR", "Obligor swingline", "Swingline configured", "draws swingline", "GREY", "Obligor has no swingline (not applicable).");
    }
  }

  // ---------------- ASR APPROVED OBLIGOR SUBLIMIT ----------------
  if (seller && obligor) {
    const sol = sellerObligorLimit(seller.id, obligor.id);
    if (!sol) {
      add("ASR", "ASR approved obligor", `${seller.name} ASR approved list`, obligor.name, "RED",
        "Obligor is not on this seller's ASR approved list.");
    } else {
      add("ASR", "ASR approved obligor", `${seller.name} ASR approved list`, obligor.name, "GREEN",
        "Obligor approved under seller ASR.");
      const usage = sellerObligorUsage(seller.id, obligor.id);
      const available = sol.approvedLimit - usage;
      capacity("ASR", "ASR obligor sublimit", available, sol.approvedLimit, usage, advanceAmount);
      add("ASR", "ASR sublimit tenor", `${sol.maxTenorDays}d`, `${tenorDays}d`,
        tenorDays > sol.maxTenorDays ? "RED" : "GREEN",
        tenorDays > sol.maxTenorDays ? `Tenor exceeds ASR sublimit max by ${tenorDays - sol.maxTenorDays}d.` : "Within ASR sublimit tenor.");
    }
  }

  // ---------------- TRANSACTION TERMS ----------------
  const inRange = txn.advanceRate >= 0.85 && txn.advanceRate <= 1.0;
  add("TRANSACTION", "Advance rate range", "85% – 100%", `${(txn.advanceRate * 100).toFixed(1)}%`,
    inRange ? "GREEN" : "RED",
    inRange ? "Advance rate in valid range." : "Advance rate outside 85–100%.");
  const cap = TYPE_CAP[txn.invoiceType];
  add("TRANSACTION", "Advance vs invoice type", `${txn.invoiceType} typical ≤ ${(cap * 100).toFixed(0)}%`, `${(txn.advanceRate * 100).toFixed(1)}%`,
    txn.advanceRate <= cap ? "GREEN" : "YELLOW",
    txn.advanceRate <= cap ? `Within ${txn.invoiceType} typical advance.` : `Above ${txn.invoiceType} typical — business-line override for return.`);
  add("TRANSACTION", "Funded (advance) amount", `${(txn.advanceRate * 100).toFixed(1)}% of ${mm(txn.invoiceAmount)}`, mm(advanceAmount), "GREEN",
    "Funded amount limits are checked against.");

  // ---------------- DISTRIBUTION ----------------
  if (txn.distributed) {
    const investor = txn.investorId ? getInvestor(txn.investorId) : undefined;
    const part = txn.participationAmount ?? 0;
    if (!investor) {
      add("DISTRIBUTION", "Investor", "Selected investor", txn.investorId ?? "—", "RED", "Distributed deal requires an investor.");
    } else if (seller) {
      const pa = participationAgreement(investor.id, seller.id);
      add("DISTRIBUTION", "Participation agreement", "Executed agreement", pa?.executed ? "Executed" : "Not executed",
        pa?.executed ? "GREEN" : "RED",
        pa?.executed ? "Executed participation agreement on file." : "No executed participation agreement for this investor/seller.");

      const il = findLimit("INVESTOR", investor.id);
      if (il) {
        const v = viewLimit(il);
        capacity("DISTRIBUTION", "Investor approved limit", v.available, v.approvedLimit, v.consumed, part);
      }
      add("DISTRIBUTION", "Investor pricing", `${investor.pricingFloorBps}bps floor`, `${txn.pricingBps}bps`,
        txn.pricingBps < investor.pricingFloorBps ? "RED" : "GREEN",
        txn.pricingBps < investor.pricingFloorBps ? "Below investor pricing floor." : "At/above investor pricing floor.");
      add("DISTRIBUTION", "Investor tenor", `${investor.minTenorDays}–${investor.maxTenorDays}d`, `${tenorDays}d`,
        tenorDays < investor.minTenorDays || tenorDays > investor.maxTenorDays ? "RED" : "GREEN",
        tenorDays < investor.minTenorDays || tenorDays > investor.maxTenorDays ? "Tenor outside investor band." : "Within investor tenor band.");
      const pctOfAdvance = advanceAmount > 0 ? (part / advanceAmount) * 100 : 0;
      add("DISTRIBUTION", "Participation amount", `≤ funded ${mm(advanceAmount)}`, `${mm(part)} (${pctOfAdvance.toFixed(1)}%)`,
        part > advanceAmount ? "RED" : "GREEN",
        part > advanceAmount ? "Participation exceeds the funded amount." : `Participation is ${pctOfAdvance.toFixed(1)}% of the funded amount.`);
    }
  }

  // ---------------- INSURANCE ----------------
  if (txn.insured) {
    const allocations = txn.insurerAllocations ?? [];
    if (allocations.length === 0) {
      add("INSURANCE", "Insurer allocation", "At least one insurer", "none", "RED", "Insured deal requires an insurer allocation.");
    }
    let allocTotal = 0;
    for (const alloc of allocations) {
      allocTotal += alloc.amount;
      const policy = getInsurancePolicy(alloc.policyId);
      const tag = policy ? `${policy.insurerName} ${policy.policyNumber}` : alloc.policyId;
      if (!policy) {
        add("INSURANCE", `Policy ${alloc.policyId}`, "Known policy", alloc.policyId, "RED", "Unknown policy.");
        continue;
      }
      const valid = !expired(policy.expiryDate, txn.valueDate) && Date.parse(policy.effectiveDate) <= Date.parse(txn.valueDate);
      add("INSURANCE", `Policy validity — ${tag}`, `${policy.effectiveDate} → ${policy.expiryDate}`, txn.valueDate,
        valid ? "GREEN" : "RED", valid ? "Policy valid on value date." : "Policy not valid on value date.");

      if (obligor) {
        const bsl = insuranceBuyerSublimit(policy.id, obligor.id);
        if (!bsl) {
          add("INSURANCE", `Buyer sublimit — ${tag}`, "Buyer covered", obligor.name, "RED", "Buyer not covered under this policy.");
        } else {
          capacity("INSURANCE", `Buyer sublimit — ${tag}`, bsl.sublimit, bsl.sublimit, 0, alloc.amount);
        }
        const cl = insuranceCountryLimit(policy.id, obligor.country);
        if (!cl) {
          add("INSURANCE", `Country limit — ${tag}`, `${obligor.country} covered`, obligor.country, "RED", "Country not covered under this policy.");
        } else {
          capacity("INSURANCE", `Country limit — ${tag}`, cl.limit, cl.limit, 0, alloc.amount);
        }
      }
      add("INSURANCE", `Insurance max tenor — ${tag}`, `${policy.maxTenorDays}d`, `${tenorDays}d`,
        tenorDays > policy.maxTenorDays ? "RED" : "GREEN",
        tenorDays > policy.maxTenorDays ? "Tenor exceeds policy max." : "Within policy max tenor.");
      const covered = Math.round(policy.coveragePercent * alloc.amount);
      add("INSURANCE", `Coverage — ${tag}`, `${(policy.coveragePercent * 100).toFixed(0)}% coverage`, `${mm(covered)} covered / ${mm(alloc.amount - covered)} residual`, "GREEN",
        `${(policy.coveragePercent * 100).toFixed(0)}% of ${mm(alloc.amount)} insured.`);
      add("INSURANCE", `Recourse — ${tag}`, policy.recourseToSeller ? "Recourse to seller" : "Non-recourse", policy.recourseToSeller ? "Yes" : "No",
        policy.recourseToSeller ? "GREEN" : "YELLOW",
        policy.recourseToSeller ? "Uninsured residual has recourse to the seller." : "Non-recourse — residual retained by the bank.");
    }
    if (allocations.length > 1 || allocTotal > 0) {
      add("INSURANCE", "Total allocation", `≤ funded ${mm(advanceAmount)}`, mm(allocTotal),
        allocTotal > advanceAmount ? "RED" : "GREEN",
        allocTotal > advanceAmount ? "Insured allocation exceeds funded amount." : `Allocated across ${allocations.length} insurer(s).`);
    }
  }

  const decision =
    checks.some((c) => c.severity === "RED")
      ? "REJECTED"
      : checks.some((c) => c.severity === "ORANGE")
        ? "EXCEPTION_REQUIRED"
        : checks.some((c) => c.severity === "YELLOW")
          ? "ELIGIBLE_WITH_WARNING"
          : "ELIGIBLE";

  return { transaction: txn, advanceAmount, tenorDays, checks, decision };
}
