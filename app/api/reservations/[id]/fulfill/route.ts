import { NextResponse } from "next/server";
import { getReservation, fulfillReservation, addAudit } from "@/lib/data/store";
import { fundedDeals } from "@/lib/deals";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { mm } from "@/lib/format";

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
