import { NextResponse } from "next/server";
import { getDocument, replaceDocumentFile, deleteDocument } from "@/lib/documents";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { addAudit } from "@/lib/data/store";

const MAX_BYTES = 15 * 1024 * 1024;

// Download a document.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "content-type": doc.meta.contentType,
      "content-disposition": `attachment; filename="${doc.meta.fileName.replace(/"/g, "")}"`,
    },
  });
}

// Replace the file on an existing document (keeps the slot + attachment).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to replace documents.` }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "Empty file." }, { status: 422 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "File exceeds 15 MB." }, { status: 413 });

  const meta = await replaceDocumentFile(id, file.name, file.type || "application/octet-stream", buf);
  if (!meta) return NextResponse.json({ error: "Not found." }, { status: 404 });

  addAudit({
    actorUserId: user.id, actorName: user.name,
    action: "DOCUMENT_REPLACE", entityType: "DOCUMENT", entityId: id,
    detail: `Replaced file with ${meta.fileName}.`,
  });
  return NextResponse.json({ ok: true, document: meta });
}

// Delete a document.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to delete documents.` }, { status: 403 });
  }
  const ok = await deleteDocument(id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  addAudit({
    actorUserId: user.id, actorName: user.name,
    action: "DOCUMENT_DELETE", entityType: "DOCUMENT", entityId: id, detail: `Deleted document ${id}.`,
  });
  return NextResponse.json({ ok: true });
}
