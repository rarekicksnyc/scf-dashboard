import { NextResponse } from "next/server";
import { getReservation, fulfillReservation, addAudit } from "@/lib/data/store";
import { fundedDeals } from "@/lib/deals";
import { checkDiscount } from "@/lib/engine/eligibility";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { mm, blockingChecks } from "@/lib/format";
import type { DiscountTransaction } from "@/lib/types";

// Link a reservation to the actual transaction (invoice) that realised it, then
// release the reservation (status FUNDED). The invoice must be a funded
// transaction for the SAME seller/obligor — that is the confirmation the
// reservation belongs to that transaction.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to fulfill reservations.` }, { status: 403 });
  }

  const r = getReservation(id);
  if (!r) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (r.status !== "RESERVED") return NextResponse.json({ error: `Reservation is ${r.status}, not open.` }, { status: 422 });

  const b = await request.json().catch(() => ({}));
  const invoiceNumber = String(b.invoiceNumber || "").trim();
  if (!invoiceNumber) return NextResponse.json({ error: "Choose the transaction (invoice) that fulfills this reservation." }, { status: 400 });

  // Confirm the invoice is a funded transaction for this reservation's names.
  const match = fundedDeals({ sellerId: r.sellerId, obligorId: r.obligorId }).find(
    (d) => d.invoiceNumber === invoiceNumber,
  );
  if (!match) {
    return NextResponse.json(
      { error: `No funded transaction '${invoiceNumber}' found for this seller/obligor.` },
      { status: 422 },
    );
  }

  // Governance: a reservation booked with a soft-warning exception cannot be
  // released to its transaction unless the flagged breach is now resolved. We
  // re-run eligibility on the reservation's live parameters (excluding itself
  // from availability) — if it still does not clear, the breach persists and the
  // transaction must not go through until it is addressed.
  if (r.exception && r.kind !== "SWINGLINE") {
    const prevStatus = r.status;
    r.status = "CANCELLED"; // drop from availability for the re-check
    const txn: DiscountTransaction = {
      sellerId: r.sellerId,
      obligorId: r.obligorId,
      rrlAmount: r.rrlAmount ?? 0,
      invoiceNumber,
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
    r.status = prevStatus; // restore
    const stillBreaching = report.decision === "REJECTED" || report.decision === "EXCEPTION_REQUIRED";
    if (stillBreaching) {
      const breachReasons = blockingChecks(report.checks).map((c) => c.message);
      return NextResponse.json(
        {
          error: "This reservation was booked with a soft-warning exception and the breach is still not resolved — the transaction cannot be released until it is addressed.",
          breachReasons,
          originalException: r.exceptionReasons,
        },
        { status: 422 },
      );
    }
  }

  const updated = fulfillReservation(id, invoiceNumber);
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "RESERVATION_FULFILL",
    entityType: "RESERVATION",
    entityId: id,
    detail: `Fulfilled ${id} (${mm(r.amount)}) with transaction ${invoiceNumber}; released from reserved exposure.`,
  });

  return NextResponse.json({ reservation: updated, transaction: match });
}
