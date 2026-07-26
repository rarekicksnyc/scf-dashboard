import { NextResponse } from "next/server";
import { getReservation } from "@/lib/data/store";
import { checkDiscount } from "@/lib/engine/eligibility";
import { checkSwinglineReservation } from "@/lib/engine/reservation";
import { getCurrentUser } from "@/lib/auth";
import type { DiscountTransaction } from "@/lib/types";

// The full eligibility breakdown for a reservation, computed LIVE on its current
// parameters (so any adjustment or data change is reflected). The reservation is
// excluded from availability so it does not count against itself. Read-only.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await getCurrentUser(); // any authenticated user may view
  const { id } = await params;
  const r = getReservation(id);
  if (!r) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  const prev = r.status;
  r.status = "CANCELLED"; // exclude self from availability during the re-check
  try {
    if (r.kind === "SWINGLINE") {
      const entityType: "SELLER" | "OBLIGOR" = r.sellerId ? "SELLER" : "OBLIGOR";
      const entityId = r.sellerId || r.obligorId;
      const window = r.valueDate && r.maturityDate ? { from: r.valueDate, to: r.maturityDate } : undefined;
      const decision = checkSwinglineReservation(entityType, entityId, r.amount, r.swinglineDirection ?? "REDUCTION", r.swinglineKind ?? "REGULAR", window);
      return NextResponse.json({ kind: "SWINGLINE", decision: decision.decision, checks: decision.checks });
    }

    const txn: DiscountTransaction = {
      sellerId: r.sellerId,
      obligorId: r.obligorId,
      rrlAmount: r.rrlAmount ?? 0,
      invoiceNumber: id,
      invoiceAmount: r.amount,
      currency: r.currency,
      invoiceType: "FINAL",
      advanceRate: 1, // reservation amount is the coverage
      valueDate: r.valueDate,
      maturityDate: r.maturityDate,
      pricingBps: r.pricingBps,
      distributed: Boolean(r.investorAllocations?.length),
      investorAllocations: r.investorAllocations,
      insured: Boolean(r.insurerAllocations?.length),
      insurerAllocations: r.insurerAllocations,
    };
    const report = checkDiscount(txn);
    return NextResponse.json({ kind: "DISCOUNT", report });
  } finally {
    r.status = prev;
  }
}
