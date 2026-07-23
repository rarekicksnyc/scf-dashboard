import { NextResponse } from "next/server";
import { updateSellerObligorLimit, removeSellerObligorLimit, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Edit an ASR approved-obligor sublimit (amount / max tenor) — keyed by the
// seller/obligor pair. Feeds the ASR checks in the eligibility engine.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to edit limits.` }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  if (typeof b.sellerId !== "string" || typeof b.obligorId !== "string") {
    return NextResponse.json({ error: "Expected sellerId and obligorId." }, { status: 400 });
  }

  const patch: { approvedLimit?: number; maxTenorDays?: number } = {};
  if (b.approvedLimit != null && Number(b.approvedLimit) >= 0) patch.approvedLimit = Number(b.approvedLimit);
  if (b.maxTenorDays != null && Number(b.maxTenorDays) >= 0) patch.maxTenorDays = Number(b.maxTenorDays);

  const updated = updateSellerObligorLimit(b.sellerId, b.obligorId, patch);
  if (!updated) return NextResponse.json({ error: "ASR sublimit not found." }, { status: 404 });

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "ASR_SUBLIMIT_EDIT",
    entityType: "ASR_SUBLIMIT",
    entityId: `${b.sellerId}/${b.obligorId}`,
    detail: `Updated ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
  });

  return NextResponse.json({ ok: true, sublimit: updated });
}

// Remove an obligor group from a seller's ASR approved list.
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to remove limits.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (typeof b.sellerId !== "string" || typeof b.obligorId !== "string") {
    return NextResponse.json({ error: "Expected sellerId and obligorId." }, { status: 400 });
  }
  try {
    removeSellerObligorLimit(b.sellerId, b.obligorId);
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "ASR_SUBLIMIT_DELETE",
      entityType: "ASR_SUBLIMIT",
      entityId: `${b.sellerId}/${b.obligorId}`,
      detail: `Removed ASR sublimit ${b.sellerId}/${b.obligorId}.`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
