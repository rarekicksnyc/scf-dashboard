import { NextResponse } from "next/server";
import { removeSeller, updateSeller, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { AsrRating, EntityStatus, Seller } from "@/lib/types";

// Edit seller facility fields (name, ratings + expiries, GCARS, guarantor, min
// pricing, RRL enable/limit/expiry, status). Gated by CHANGE_LIMIT and audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to edit sellers.` }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  const patch: Partial<Seller> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.cdl === "string") {
    if (!/^\d{8}$/.test(b.cdl)) return NextResponse.json({ error: "CDL must be an 8-digit customer code." }, { status: 422 });
    patch.cdl = b.cdl;
  }
  if (typeof b.asrRating === "string" && b.asrRating.trim()) patch.asrRating = b.asrRating.trim() as AsrRating;
  if (typeof b.asrExpiry === "string") patch.asrExpiry = b.asrExpiry;
  if (typeof b.borrowerRating === "string") patch.borrowerRating = b.borrowerRating.trim();
  if (typeof b.borrowerRatingExpiry === "string") patch.borrowerRatingExpiry = b.borrowerRatingExpiry;
  if (typeof b.gcarsNumber === "string") patch.gcarsNumber = b.gcarsNumber.trim();
  if (typeof b.guarantor === "string") patch.guarantor = b.guarantor.trim();
  if (b.minPricingBps != null && Number(b.minPricingBps) >= 0) patch.minPricingBps = Number(b.minPricingBps);
  if (typeof b.rrlEnabled === "boolean") patch.rrlEnabled = b.rrlEnabled;
  if (b.rrlLimit != null && Number(b.rrlLimit) >= 0) patch.rrlLimit = Number(b.rrlLimit);
  if (typeof b.rrlExpiry === "string") patch.rrlExpiry = b.rrlExpiry;
  if (typeof b.status === "string") patch.status = b.status as EntityStatus;
  if (typeof b.eligible === "boolean") patch.eligible = b.eligible;

  const updated = updateSeller(id, patch);
  if (!updated) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "SELLER_EDIT",
    entityType: "SELLER",
    entityId: id,
    detail: `Updated ${Object.keys(patch).join(", ")}.`,
  });
  return NextResponse.json({ ok: true, seller: updated });
}

// Remove a seller (facility) and everything tied only to it — its limits,
// eligible entities, ASR sublimits, and participation agreements. Gated by
// CHANGE_LIMIT and audited; blocked while it has an active forward book.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to remove sellers.` }, { status: 403 });
  }
  try {
    removeSeller(id);
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "SELLER_DELETE",
      entityType: "SELLER",
      entityId: id,
      detail: `Removed seller ${id} and its limits, entities, ASR sublimits, and participation agreements.`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
