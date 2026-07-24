import { NextResponse } from "next/server";
import { getTransactionWorkflow, advanceWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { getDocument } from "@/lib/documents";
import { workflowEmail, workflowAttachments } from "@/lib/txndocs";
import { emlResponse, type EmlAttachment } from "@/lib/email";

// Draft the booking / funding-team email (.eml) with the EXECUTED document and
// Schedule A attached. Only once the signature is verified.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  if (wf.status !== "SIGNATURE_VERIFIED" && wf.status !== "BOOKING_EMAILED") {
    return NextResponse.json({ error: "The signature must be verified before emailing the booking team." }, { status: 422 });
  }

  const { subject, body } = workflowEmail("BOOKING_EMAIL", wf);
  // Attach the executed document if uploaded, plus the generated Schedule A.
  const generated = workflowAttachments(wf); // [request, schedule]
  const attachments: EmlAttachment[] = [];
  if (wf.executedDocId) {
    const doc = await getDocument(wf.executedDocId);
    if (doc) attachments.push({ filename: `EXECUTED-${doc.meta.fileName}`, mime: doc.meta.contentType || "application/octet-stream", base64: doc.data.toString("base64") });
  }
  if (attachments.length === 0) attachments.push(generated[0]); // fall back to the generated request
  attachments.push(generated[1]); // Schedule A

  if (wf.status === "SIGNATURE_VERIFIED") {
    advanceWorkflow(id, { status: "BOOKING_EMAILED", by: user.name, event: "Booking / funding-team email drafted with executed docs." });
  }
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_BOOKING_EMAIL", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Drafted booking email for ${wf.reference}.` });

  return emlResponse(`booking-email-${wf.reference}.eml`, { subject, body, attachments });
}
