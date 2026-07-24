import type { Limit, Utilization, LimitView } from "@/lib/types";

// ---------------------------------------------------------------------------
// THE availability formula. Every screen and every eligibility check derives
// remaining capacity through this function and only this function. If the
// definition of "available" ever changes, it changes here once.
//
//   available = approved
//             - fundedOutstanding
//             - pendingApproved
//             - pendingSettlement
//             - pendingRequested
//             + confirmedRepayments
// ---------------------------------------------------------------------------

export function computeConsumed(u: Utilization): number {
  return (
    u.fundedOutstanding +
    u.pendingApproved +
    u.pendingSettlement +
    u.pendingRequested -
    u.confirmedRepayments
  );
}

// reserved = future reservations booked against this limit (0 when none).
export function toLimitView(
  limit: Limit,
  u: Utilization,
  reserved = 0,
  bookedOutstanding = 0,
): LimitView {
  // Outstanding = seed utilization + booked transactions (both are real drawn
  // exposure); reserved = the forward book. Both reduce available capacity.
  const outstanding = computeConsumed(u) + bookedOutstanding;
  const consumed = outstanding + reserved;
  const available = limit.approvedLimit - consumed;
  const utilizationPct =
    limit.approvedLimit > 0 ? consumed / limit.approvedLimit : 0;
  return {
    limit,
    approvedLimit: limit.approvedLimit,
    outstanding,
    reserved,
    consumed,
    available,
    utilizationPct,
  };
}

// A mutable working copy the batch engine decrements as invoices are
// provisionally accepted, so invoice #400 in a batch sees the capacity that
// invoices #1–399 already consumed. This is what makes "each invoice passes
// alone but the batch breaches" behave correctly.
export interface WorkingLimit {
  limit: Limit;
  approvedLimit: number;
  consumed: number;
  get available(): number;
}

export function makeWorking(view: LimitView): WorkingLimit {
  return {
    limit: view.limit,
    approvedLimit: view.approvedLimit,
    consumed: view.consumed,
    get available() {
      return this.approvedLimit - this.consumed;
    },
  };
}

export function consume(working: WorkingLimit, amount: number): void {
  working.consumed += amount;
}

export function viewOf(working: WorkingLimit): LimitView {
  const utilizationPct =
    working.approvedLimit > 0 ? working.consumed / working.approvedLimit : 0;
  return {
    limit: working.limit,
    approvedLimit: working.approvedLimit,
    outstanding: working.consumed,
    reserved: 0,
    consumed: working.consumed,
    available: working.available,
    utilizationPct,
  };
}
