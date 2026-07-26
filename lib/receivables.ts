import type { BookedTransaction, ReceivableStatus } from "@/lib/types";
import { daysBetween } from "@/lib/format";
import { DAY_COUNT_BASIS } from "@/lib/config";

// ---------------------------------------------------------------------------
// Receivable lifecycle — the single, pure source for everything derived from a
// booked transaction after it is on the books: how much principal is still
// outstanding, its settlement status, whether it is overdue, the aging bucket,
// and the additional (default) interest owed on a past-due balance.
//
// Nothing here is stored. Status is always computed from the collection facts
// on the record plus the as-of date, so it can never disagree with the ledger
// (single source of truth). The store's exposure views call into this module so
// a partial collection reduces exposure everywhere at once.
// ---------------------------------------------------------------------------

// Principal (funded coverage) recovered so far. The discount / margin is revenue
// and accrues separately over the tenor — it is not part of principal
// settlement, so a collection never touches revenue.
export function collectedPrincipal(t: BookedTransaction): number {
  return (t.collections ?? []).reduce((a, c) => a + c.amount, 0);
}

// Principal still outstanding = funded amount − principal collected.
export function outstandingPrincipal(t: BookedTransaction): number {
  return Math.max(0, t.amount - collectedPrincipal(t));
}

// The fraction of the original exposure still live (1 = untouched, 0 = fully
// collected). Used to scale every limit draw (line, RRL split, investor and
// insurer allocations) down as principal is recovered.
export function outstandingFraction(t: BookedTransaction): number {
  if (t.amount <= 0) return 0;
  return outstandingPrincipal(t) / t.amount;
}

// A receivable is closed once its principal is fully recovered (an explicit
// settledAt is set when the closing collection is recorded, but a rounding-safe
// zero balance closes it too).
export function isSettled(t: BookedTransaction): boolean {
  return t.settledAt != null || outstandingPrincipal(t) < 1;
}

// Derived settlement state. Order matters: a declared default wins over
// everything, then a closed (settled) receivable, then past-due, then partial.
export function receivableStatus(t: BookedTransaction, asOf: string): ReceivableStatus {
  if (t.defaultedAt) return "DEFAULTED";
  if (isSettled(t)) return "SETTLED";
  if (asOf > t.maturityDate) return "OVERDUE";
  if (collectedPrincipal(t) > 0) return "PARTIALLY_COLLECTED";
  return "OUTSTANDING";
}

// Days a still-open receivable is past its maturity date (0 if settled,
// defaulted, or not yet due).
export function overdueDays(t: BookedTransaction, asOf: string): number {
  if (isSettled(t) || t.defaultedAt) return 0;
  return Math.max(0, daysBetween(t.maturityDate, asOf));
}

export type AgeBucket = "CURRENT" | "D1_30" | "D31_60" | "D61_90" | "D90_PLUS";

export const AGE_BUCKET_LABEL: Record<AgeBucket, string> = {
  CURRENT: "Current",
  D1_30: "1 to 30 days",
  D31_60: "31 to 60 days",
  D61_90: "61 to 90 days",
  D90_PLUS: "Over 90 days",
};

// Aging bucket by days past due (current = not yet overdue).
export function ageBucket(t: BookedTransaction, asOf: string): AgeBucket {
  const od = overdueDays(t, asOf);
  if (od <= 0) return "CURRENT";
  if (od <= 30) return "D1_30";
  if (od <= 60) return "D31_60";
  if (od <= 90) return "D61_90";
  return "D90_PLUS";
}

// Additional (default) interest on a past-due balance. Erik's rule: charge it
// with the SAME discount calculation as the original deal — the original all-in
// rate (margin + base) applied to the outstanding principal over the overdue
// days on the actual/360 basis. Returns zero cleanly when the deal is current.
export function additionalInterest(
  t: BookedTransaction,
  asOf: string,
): { days: number; allInRatePct: number; principal: number; amount: number } {
  const days = overdueDays(t, asOf);
  const base = t.baseRatePct ?? 0;
  const allInRatePct = t.pricingBps / 100 + base;
  const principal = outstandingPrincipal(t);
  const amount = principal * (allInRatePct / 100) * (days / DAY_COUNT_BASIS);
  return { days, allInRatePct, principal, amount };
}

// Whether a booked transaction is live exposure within a time-phasing window.
// Unlike a reservation (which rolls off at its maturity), a booked receivable is
// REAL money out and stays on the books until it is actually settled — an
// overdue, uncollected receivable keeps consuming its limits. A settled
// receivable drops off on the date it closed.
export function bookedInWindow(
  t: BookedTransaction,
  w?: { from: string; to: string },
): boolean {
  if (!w) return true;
  if (t.valueDate > w.to) return false; // funds after the window
  if (t.settledAt) return t.settledAt >= w.from; // closed on the settle date
  return true; // open receivable stays live until collected
}
