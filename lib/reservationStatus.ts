import { checkDiscount } from "@/lib/engine/eligibility";
import { checkSwinglineReservation } from "@/lib/engine/reservation";
import type { DiscountTransaction, Reservation } from "@/lib/types";

// Live re-evaluation of a soft-warning reservation. A reservation booked with an
// exception should stop being flagged the moment the underlying breach is
// resolved (e.g. the obligor group expiry is entered) — the flag is DERIVED, not
// just stored. Returns true only if re-running the same eligibility test on the
// reservation's current parameters STILL does not clear.
//
// The reservation is excluded from availability during the re-check (its own
// held capacity must not count against it). checkDiscount / checkSwingline are
// synchronous, so the temporary status change is restored before anything else
// can observe it.
export function reservationStillBreaches(r: Reservation): boolean {
  if (!r.exception) return false;

  const prevStatus = r.status;
  r.status = "CANCELLED"; // drop from availability for the re-check
  try {
    if (r.kind === "SWINGLINE") {
      const entityType: "SELLER" | "OBLIGOR" = r.sellerId ? "SELLER" : "OBLIGOR";
      const entityId = r.sellerId || r.obligorId;
      const window = r.valueDate && r.maturityDate ? { from: r.valueDate, to: r.maturityDate } : undefined;
      const decision = checkSwinglineReservation(
        entityType,
        entityId,
        r.amount,
        r.swinglineDirection ?? "REDUCTION",
        r.swinglineKind ?? "REGULAR",
        window,
      );
      return decision.decision === "BLOCK";
    }

    const txn: DiscountTransaction = {
      sellerId: r.sellerId,
      obligorId: r.obligorId,
      rrlAmount: r.rrlAmount ?? 0,
      invoiceNumber: "RESERVATION",
      invoiceAmount: r.amount,
      currency: r.currency,
      invoiceType: "FINAL",
      advanceRate: 1,
      valueDate: r.valueDate,
      maturityDate: r.maturityDate,
      pricingBps: r.pricingBps,
      distributed: false,
      insured: false,
    };
    const report = checkDiscount(txn);
    return report.decision === "REJECTED" || report.decision === "EXCEPTION_REQUIRED";
  } finally {
    r.status = prevStatus; // restore
  }
}
