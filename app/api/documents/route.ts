import { NextResponse } from "next/server";
import { listDocuments, addDocument, DOC_TYPES, type AttachType } from "@/lib/documents";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { addAudit } from "@/lib/data/store";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file

export async function GET() {
  return NextResponse.json({ documents: await listDocuments() });
}

// Upload a document (multipart/form-data: file + attach fields).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to upload documents.` }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const attachType = String(form.get("attachType") || "");
  const attachId = String(form.get("attachId") || "").trim();
  const attachLabel = String(form.get("attachLabel") || "").trim();
  const docType = String(form.get("docType") || "OTHER");

  if (!["SELLER", "OBLIGOR", "TRANSACTION"].includes(attachType) || !attachId) {
    return NextResponse.json({ error: "Choose what the document attaches to." }, { status: 422 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "Empty file." }, { status: 422 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "File exceeds 15 MB." }, { status: 413 });

  const meta = await addDocument(
    {
      attachType: attachType as AttachType,
      attachId,
      attachLabel,
      docType: DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number]) ? docType : "OTHER",
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      uploadedBy: user.id,
      uploadedByName: user.name,
    },
    buf,
  );

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "DOCUMENT_UPLOAD",
    entityType: "DOCUMENT",
    entityId: meta.id,
    detail: `Uploaded ${meta.fileName} (${meta.docType}) for ${meta.attachType} ${meta.attachLabel || meta.attachId}.`,
  });

  return NextResponse.json({ ok: true, document: meta });
}
