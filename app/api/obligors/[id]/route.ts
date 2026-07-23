import { NextResponse } from "next/server";
import { updateObligor, removeObligor, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { Obligor } from "@/lib/types";

// Edit an obligor group (group-level expiry) from Data Management.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to edit obligors.` }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  const patch: Partial<Obligor> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.cdl === "string") {
    if (!/^\d{8}$/.test(b.cdl)) return NextResponse.json({ error: "CDL must be an 8-digit customer code." }, { status: 422 });
    patch.cdl = b.cdl;
  }
  if (typeof b.country === "string" && b.country.trim()) patch.country = b.country.trim();
  if (typeof b.sector === "string") patch.sector = b.sector.trim();
  if (typeof b.expiryDate === "string") patch.expiryDate = b.expiryDate;
  if (typeof b.status === "string") patch.status = b.status as Obligor["status"];
  if (typeof b.eligible === "boolean") patch.eligible = b.eligible;
  if (typeof b.hasGuarantee === "boolean") patch.hasGuarantee = b.hasGuarantee;
  if (typeof b.guaranteeEligible === "boolean") patch.guaranteeEligible = b.guaranteeEligible;

  const updated = updateObligor(id, patch);
  if (!updated) return NextResponse.json({ error: "Obligor not found." }, { status: 404 });

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "OBLIGOR_EDIT",
    entityType: "OBLIGOR",
    entityId: id,
    detail: `Updated ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
  });

  return NextResponse.json({ ok: true, obligor: updated });
}

// Remove an obligor group and everything tied only to it.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to remove obligors.` }, { status: 403 });
  }
  try {
    removeObligor(id);
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "OBLIGOR_DELETE",
      entityType: "OBLIGOR",
      entityId: id,
      detail: `Removed obligor group ${id} and its limits, entities, and ASR sublimits.`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
