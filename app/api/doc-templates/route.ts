import { NextResponse } from "next/server";
import { listDocTemplates, upsertDocTemplate, deleteDocTemplate, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { DocTemplateType } from "@/lib/types";

const TYPES: DocTemplateType[] = ["PURCHASE_REQUEST", "COMMITMENT_REQUEST", "CLIENT_EMAIL", "BOOKING_EMAIL"];

export async function GET() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  return NextResponse.json({ templates: listDocTemplates() });
}

// Create/update a template. A body with a sellerId writes a per-seller override;
// without, it edits the default.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to edit templates.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (!TYPES.includes(b.type)) return NextResponse.json({ error: "Unknown template type." }, { status: 400 });
  if (typeof b.body !== "string" || !b.body.trim()) return NextResponse.json({ error: "Template body is required." }, { status: 422 });
  const t = upsertDocTemplate({
    type: b.type,
    sellerId: typeof b.sellerId === "string" && b.sellerId ? b.sellerId : undefined,
    subject: typeof b.subject === "string" ? b.subject : undefined,
    body: b.body,
  });
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "TEMPLATE_EDIT",
    entityType: "DOC_TEMPLATE",
    entityId: t.id,
    detail: `Edited ${t.type}${t.sellerId ? ` for ${t.sellerId}` : " (default)"}.`,
  });
  return NextResponse.json({ ok: true, template: t });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to delete templates.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (typeof b.id !== "string") return NextResponse.json({ error: "Expected a template id." }, { status: 400 });
  if (!deleteDocTemplate(b.id)) return NextResponse.json({ error: "Only per-seller overrides can be deleted." }, { status: 422 });
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TEMPLATE_DELETE", entityType: "DOC_TEMPLATE", entityId: b.id, detail: `Removed template override ${b.id}.` });
  return NextResponse.json({ ok: true });
}
