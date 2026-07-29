import { NextResponse } from "next/server";
import { getTransactionWorkflow, advanceWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { workflowEmail, investorOfferAttachments } from "@/lib/txndocs";
import { emlResponse } from "@/lib/email";

// Draft the investor OFFER (.eml): the investor Purchase Request (client pricing
// replaced with the investor's own terms) and the investor Schedule A, both at
// the interpolated SOFR + (margin − skim). The skim is never shown to the investor.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const attachments = investorOfferAttachments(wf);
  if (attachments.length === 0) return NextResponse.json({ error: "This transaction has no investor participation." }, { status: 422 });

  const { subject, body } = workflowEmail("INVESTOR_EMAIL", wf);
  advanceWorkflow(id, { by: user.name, event: `Investor offer drafted for ${wf.investorName || "investor"}.` });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_INVESTOR_EMAIL", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Drafted investor offer for ${wf.reference}.` });

  return emlResponse(`investor-offer-${wf.reference}.eml`, { subject, body, attachments });
}
