import { NextResponse } from "next/server";
import { cancelTransactionWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Cancel an in-progress transaction workflow (cannot cancel one already booked).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to cancel transactions.` }, { status: 403 });
  }
  if (!cancelTransactionWorkflow(id, user.name)) {
    return NextResponse.json({ error: "Cannot cancel (not found or already booked)." }, { status: 422 });
  }
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_CANCEL", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Cancelled workflow ${id}.` });
  return NextResponse.json({ ok: true });
}
