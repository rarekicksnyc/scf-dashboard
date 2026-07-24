import { NextResponse } from "next/server";
import { getTransactionWorkflow, bookTransactionFromWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Final step: book the transaction in the system. Creates the time-phased booked
// transaction (real outstanding across every limit), removes the reservation it
// realises, and marks the workflow BOOKED. Forward book + calendar update.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to book transactions.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  if (wf.status !== "SIGNATURE_VERIFIED" && wf.status !== "BOOKING_EMAILED") {
    return NextResponse.json({ error: "Verify the signature (and draft the booking email) before booking." }, { status: 422 });
  }
  const result = bookTransactionFromWorkflow(id, user.name);
  if (!result) return NextResponse.json({ error: "Could not book." }, { status: 422 });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_BOOK", entityType: "BOOKED_TRANSACTION", entityId: result.booked.id, detail: `Booked ${wf.reference} (${result.booked.id}); reservation ${wf.reservationId ?? "—"} removed.` });
  return NextResponse.json({ ok: true, workflow: result.workflow, booked: result.booked });
}
