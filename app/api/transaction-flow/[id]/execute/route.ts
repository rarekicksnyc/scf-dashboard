import { NextResponse } from "next/server";
import { getTransactionWorkflow, advanceWorkflow, isAuthorizedSigner, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { addDocument } from "@/lib/documents";

// Upload the executed request document and check the signer against the seller's
// (or seller-entity's) authorized-signatory list. A match verifies the signer;
// anyone not on the list is flagged for review.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });

  const b = await request.json().catch(() => ({}));
  const signerName = String(b.signerName || "").trim();
  const signerTitle = String(b.signerTitle || "").trim();
  const sellerEntityId = typeof b.sellerEntityId === "string" && b.sellerEntityId ? b.sellerEntityId : undefined;
  if (!signerName) return NextResponse.json({ error: "Enter the name of the person who signed." }, { status: 400 });

  // Store the executed file in the repository, if provided.
  let executedDocId = wf.executedDocId;
  if (typeof b.fileBase64 === "string" && b.fileBase64 && b.fileName) {
    const data = Buffer.from(b.fileBase64, "base64");
    const doc = await addDocument(
      { attachType: "TRANSACTION", attachId: wf.id, attachLabel: `${wf.sellerName} / ${wf.obligorName} ${wf.reference}`, docType: "EXECUTED_REQUEST", fileName: String(b.fileName), contentType: String(b.contentType || "application/octet-stream"), uploadedBy: user.id, uploadedByName: user.name },
      data,
    );
    executedDocId = doc.id;
  }

  const authorized = isAuthorizedSigner(wf.sellerId, sellerEntityId, signerName);
  advanceWorkflow(id, {
    status: authorized ? "SIGNATURE_VERIFIED" : "SIGNATURE_FLAGGED",
    by: user.name,
    event: authorized
      ? `Executed doc uploaded — signer "${signerName}" matched the authorized-signatory list. Verified.`
      : `Executed doc uploaded — signer "${signerName}" is NOT on the authorized-signatory list. Flagged for review.`,
    patch: { executedDocId, signerName, signerTitle, signatureValid: authorized },
  });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_EXECUTE", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Executed ${wf.reference}; signer ${signerName} ${authorized ? "authorized" : "NOT authorized (flagged)"}.` });

  return NextResponse.json({ ok: true, authorized, workflow: getTransactionWorkflow(id) });
}
