import { NextResponse } from "next/server";
import { updateSellerEntity, removeSellerEntity, recordUnchanged, recordRev, bumpRecordRev, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Edit an eligible seller legal entity (name, CDL, domicile) from Data Management.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to edit entities.` }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  const key = `sellerEntity:${id}`;
  if (b.rev != null && !recordUnchanged(key, Number(b.rev))) {
    return NextResponse.json({ error: "This seller entity was changed by another user since you opened it.", current: recordRev(key) }, { status: 409 });
  }
  const patch: { name?: string; cdl?: string; domicile?: string } = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.cdl === "string") {
    if (!/^\d{8}$/.test(b.cdl)) {
      return NextResponse.json({ error: "CDL must be an 8-digit customer code." }, { status: 422 });
    }
    patch.cdl = b.cdl;
  }
  if (typeof b.domicile === "string" && b.domicile.trim()) patch.domicile = b.domicile.trim();

  const updated = updateSellerEntity(id, patch);
  if (!updated) return NextResponse.json({ error: "Seller entity not found." }, { status: 404 });
  const newRev = bumpRecordRev(key);

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "SELLER_ENTITY_EDIT",
    entityType: "SELLER_ENTITY",
    entityId: id,
    detail: `Updated ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
  });

  return NextResponse.json({ ok: true, entity: updated, rev: newRev });
}

// Remove an eligible seller legal entity.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to remove entities.` }, { status: 403 });
  }
  if (!removeSellerEntity(id)) {
    return NextResponse.json({ error: "Seller entity not found." }, { status: 404 });
  }
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "SELLER_ENTITY_DELETE",
    entityType: "SELLER_ENTITY",
    entityId: id,
    detail: `Removed seller entity ${id}.`,
  });
  return NextResponse.json({ ok: true });
}
