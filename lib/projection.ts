import { listBookedTransactions, getReservations } from "@/lib/data/store";
import { outstandingPrincipal } from "@/lib/receivables";
import type { BookedTransaction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Expected outstanding projection — funded principal live on each date. Combines
// the live book (bookings) with the forward book (reservations that will fund).
// Assumes repayment at maturity and uses recorded collections up to today; a
// past-due (unsettled) receivable stays live. Swinglines are capacity, not funded
// principal, so they are NOT included here.
// ---------------------------------------------------------------------------

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Funded principal of one booked deal expected to be outstanding on date D.
function bookedOutstandingOn(t: BookedTransaction, D: string, today: string): number {
  if (D < t.valueDate) return 0;            // not funded yet
  if (t.settledAt) return 0;                // closed (principal recovered / written off)
  const remaining = outstandingPrincipal(t); // net of collections recorded to date
  if (remaining <= 0) return 0;
  if (D >= t.maturityDate && D > today) return 0; // future: assume repaid at maturity
  return remaining;                          // funded and live (incl. past-due up to today)
}

// A date → expected-outstanding map over [fromISO, fromISO + days). Cheap enough
// to compute for a year-wide range and look up per calendar cell.
export function expectedOutstandingByDate(fromISO: string, days: number): Record<string, number> {
  const today = new Date().toISOString().slice(0, 10);
  const booked = listBookedTransactions();
  const resv = getReservations().filter((r) => r.status === "RESERVED" && r.kind !== "SWINGLINE");
  const out: Record<string, number> = {};
  const span = Math.max(1, Math.min(days, 400));
  for (let i = 0; i < span; i++) {
    const D = addDays(fromISO, i);
    let sum = 0;
    for (const t of booked) sum += bookedOutstandingOn(t, D, today);
    for (const r of resv) if (r.valueDate <= D && D < r.maturityDate) sum += r.amount;
    out[D] = Math.round(sum);
  }
  return out;
}
