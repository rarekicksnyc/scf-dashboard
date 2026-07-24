import { NextResponse } from "next/server";
import { getTransactionWorkflow, advanceWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { workflowEmail, workflowAttachments } from "@/lib/txndocs";
import { emlResponse } from "@/lib/email";

// Generate the client execution-request email draft (.eml) with the request doc
// and Schedule A attached, and mark the workflow CLIENT_EMAILED. The user opens
// the .eml in Outlook, reviews, and sends it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });

  const { subject, body } = workflowEmail("CLIENT_EMAIL", wf);
  const attachments = workflowAttachments(wf);

  // Advance the workflow (once past docs). Keep BOOKED/EXECUTED states as-is.
  if (wf.status === "IN_PROGRESS") {
    advanceWorkflow(id, { status: "CLIENT_EMAILED", by: user.name, event: "Client execution-request email drafted." });
  }
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_CLIENT_EMAIL", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Drafted client email for ${wf.reference}.` });

  return emlResponse(`client-email-${wf.reference}.eml`, { subject, body, attachments });
}
