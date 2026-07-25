import { NextResponse } from "next/server";
import { removeBookedTransaction, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Reverse a booking — removes the booked transaction (exposure + calendar +
// forward book update) and marks its workflow reversed. Gated by UPLOAD_BATCH.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to reverse bookings.` }, { status: 403 });
  }
  const removed = removeBookedTransaction(id, user.name);
  if (!removed) return NextResponse.json({ error: "Booked transaction not found." }, { status: 404 });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "BOOKING_REVERSE", entityType: "BOOKED_TRANSACTION", entityId: id, detail: `Reversed booking ${id} (${removed.reference}).` });
  return NextResponse.json({ ok: true });
}
