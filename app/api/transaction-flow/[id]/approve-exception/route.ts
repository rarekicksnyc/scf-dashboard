import { NextResponse } from "next/server";
import { getTransactionWorkflow, approveWorkflowException, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Checker approves a single-deal booking exception (four-eyes). The approver must
// hold APPROVE_EXCEPTION and cannot be the maker who requested it. Once approved,
// the booking can proceed on the Transaction Flow.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "APPROVE_EXCEPTION")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to approve exceptions.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });

  const res = approveWorkflowException(id, user.id, user.name);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });

  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_EXCEPTION_APPROVE", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Approved booking exception on ${wf.reference} (maker ${wf.exceptionRequestedByName}).` });
  return NextResponse.json({ ok: true });
}
