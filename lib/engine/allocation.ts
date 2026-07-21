import type {
  Investor,
  InsurancePolicy,
  InvoiceFunding,
  FundingLeg,
  Currency,
} from "@/lib/types";
import type { WorkingLimit } from "./availability";

// ---------------------------------------------------------------------------
// Funding allocation engine. Given an eligible invoice, decide how it is
// funded: distributed to investors first (takeout), with the residual retained
// as bank hold. Insurance is a risk overlay on the bank-held portion — it
// covers a percentage of the bank's retained exposure, it is not a cash source.
//
// This function is a PLANNER: it reads available capacity but does not consume
// it. runBatch commits consumption from the returned plan only once the invoice
// is confirmed eligible, so an exception invoice never eats investor/insurance
// capacity.
// ---------------------------------------------------------------------------

export interface InvestorSlot {
  master: Investor;
  working: WorkingLimit;
}

export interface PolicySlot {
  master: InsurancePolicy;
  working: WorkingLimit;
}

export interface AllocContext {
  investors: InvestorSlot[];
  policies: PolicySlot[];
}

function investorEligible(
  inv: Investor,
  obligorId: string,
  currency: Currency,
  tenorDays: number,
): boolean {
  if (inv.status !== "ACTIVE") return false;
  if (inv.currency !== currency) return false;
  if (
    inv.eligibleObligorIds.length > 0 &&
    !inv.eligibleObligorIds.includes(obligorId)
  ) {
    return false;
  }
  if (tenorDays < inv.minTenorDays || tenorDays > inv.maxTenorDays) return false;
  return true;
}

export function planFunding(
  amount: number,
  obligorId: string,
  currency: Currency,
  tenorDays: number,
  ctx: AllocContext,
): InvoiceFunding {
  const legs: FundingLeg[] = [];
  let remaining = amount;

  // 1. Investor takeout, in listed order.
  for (const slot of ctx.investors) {
    if (remaining <= 0) break;
    if (!investorEligible(slot.master, obligorId, currency, tenorDays)) continue;

    const free = slot.working.available;
    if (free <= 0) continue;

    // Respect the investor's max ticket per invoice.
    const cap = Math.min(remaining, free, slot.master.maxTicket);
    if (cap < slot.master.minTicket) continue; // sub-minimum ticket — skip

    legs.push({
      source: "INVESTOR",
      sourceId: slot.master.id,
      sourceName: slot.master.name,
      amount: cap,
    });
    remaining -= cap;
  }

  // 2. Bank hold — residual the bank retains and funds itself.
  const bankHeld = remaining;
  if (bankHeld > 0) {
    legs.push({ source: "BANK_HOLD", amount: bankHeld });
  }

  // 3. Insurance overlay on the bank-held exposure (first eligible policy).
  let insuredAmount = 0;
  let policyId: string | undefined;
  let policyName: string | undefined;
  if (bankHeld > 0) {
    for (const slot of ctx.policies) {
      const p = slot.master;
      if (p.status !== "ACTIVE") continue;
      if (
        p.coveredObligorIds.length > 0 &&
        !p.coveredObligorIds.includes(obligorId)
      ) {
        continue;
      }
      if (tenorDays > p.maxTenorDays) continue;

      const free = slot.working.available;
      if (free <= 0) continue;

      insuredAmount = Math.min(p.coveragePercent * bankHeld, free);
      policyId = p.id;
      policyName = `${p.insurerName} · ${p.policyNumber}`;
      break;
    }
  }

  return {
    legs,
    bankHeld,
    insuredAmount,
    uninsuredResidual: bankHeld - insuredAmount,
    policyId,
    policyName,
  };
}
