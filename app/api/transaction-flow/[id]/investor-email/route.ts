import { NextResponse } from "next/server";
import { getTransactionWorkflow, advanceWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { workflowEmail, investorAttachment } from "@/lib/txndocs";
import { emlResponse } from "@/lib/email";

// Draft the investor email (.eml) with the investor Schedule A attached — the
// investor's portion only, at the interpolated SOFR + (margin − skim).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const attachment = investorAttachment(wf);
  if (!attachment) return NextResponse.json({ error: "This transaction has no investor participation." }, { status: 422 });

  const { subject, body } = workflowEmail("INVESTOR_EMAIL", wf);
  advanceWorkflow(id, { by: user.name, event: `Investor email drafted for ${wf.investorName || "investor"}.` });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_INVESTOR_EMAIL", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Drafted investor email for ${wf.reference}.` });

  return emlResponse(`investor-email-${wf.reference}.eml`, { subject, body, attachments: [attachment] });
}
