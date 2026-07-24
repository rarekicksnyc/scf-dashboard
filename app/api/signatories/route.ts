import { NextResponse } from "next/server";
import { addSignatory, removeSignatory, getSeller, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Authorized signatories per seller (or a specific seller entity). Used by the
// executed-document signature check. Gated by CHANGE_LIMIT.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to manage signatories.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (!getSeller(b.sellerId)) return NextResponse.json({ error: "Unknown seller." }, { status: 422 });
  if (!b.name || !b.title) return NextResponse.json({ error: "Name and title are required." }, { status: 422 });
  const s = addSignatory({
    sellerId: b.sellerId,
    entityId: typeof b.entityId === "string" && b.entityId ? b.entityId : undefined,
    name: String(b.name),
    title: String(b.title),
    signingLimit: b.signingLimit != null && b.signingLimit !== "" ? Number(b.signingLimit) : undefined,
  });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "SIGNATORY_ADD", entityType: "SIGNATORY", entityId: s.id, detail: `Added signatory ${s.name} (${s.title}) for ${b.sellerId}${s.entityId ? ` / ${s.entityId}` : ""}.` });
  return NextResponse.json({ ok: true, signatory: s });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to manage signatories.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (!removeSignatory(String(b.id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "SIGNATORY_DELETE", entityType: "SIGNATORY", entityId: String(b.id), detail: `Removed signatory ${b.id}.` });
  return NextResponse.json({ ok: true });
}
