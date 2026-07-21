import { NextResponse } from "next/server";
import { getReservation, cancelReservation, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Cancel a reservation (releases its held capacity).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to cancel reservations.` },
      { status: 403 },
    );
  }
  const r = getReservation(id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  cancelReservation(id);
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "RESERVATION_CANCEL",
    entityType: "RESERVATION",
    entityId: id,
    detail: `Cancelled reservation ${id}.`,
  });
  return NextResponse.json({ reservation: r });
}
