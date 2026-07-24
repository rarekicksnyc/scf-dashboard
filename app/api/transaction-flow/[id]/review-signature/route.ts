import { NextResponse } from "next/server";
import { getTransactionWorkflow, advanceWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Human review of a flagged signature. Confirming valid moves it forward;
// marking invalid keeps it flagged (the client must re-execute with a valid signer).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });

  const b = await request.json().catch(() => ({}));
  const valid = b.valid === true;
  advanceWorkflow(id, {
    status: valid ? "SIGNATURE_VERIFIED" : "SIGNATURE_FLAGGED",
    by: user.name,
    event: valid
      ? `Signature reviewed and confirmed valid by ${user.name} — proceeding.`
      : `Signature reviewed and rejected by ${user.name} — advise the client to re-execute with an authorized signatory.`,
    patch: { signatureValid: valid, signatureReviewedBy: user.name },
  });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_SIGNATURE_REVIEW", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Signature ${valid ? "confirmed valid" : "rejected"} for ${wf.reference}.` });
  return NextResponse.json({ ok: true, workflow: getTransactionWorkflow(id) });
}
