import { NextResponse } from "next/server";
import { updateSellerObligorLimit, addSellerObligorLimit, sellerObligorLimit, sublimitApproved, removeSellerObligorLimit, recordUnchanged, recordRev, bumpRecordRev, addAudit } from "@/lib/data/store";
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

  const key = `asr:${b.sellerId}:${b.obligorId}`;
  if (b.rev != null && !recordUnchanged(key, Number(b.rev))) {
    return NextResponse.json({ error: "This ASR sublimit was changed by another user since you opened it.", current: recordRev(key) }, { status: 409 });
  }

  const existing = sellerObligorLimit(b.sellerId, b.obligorId);
  if (!existing) return NextResponse.json({ error: "ASR sublimit not found." }, { status: 404 });

  const patch: { approvedLimit?: number; maxTenorDays?: number } = {};
  if (b.approvedLimit != null && Number(b.approvedLimit) >= 0) patch.approvedLimit = Number(b.approvedLimit);
  if (b.maxTenorDays != null && Number(b.maxTenorDays) >= 0) patch.maxTenorDays = Number(b.maxTenorDays);

  // Four-eyes: a LIVE sublimit's approved amount/tenor may not be mutated in place
  // (that would grant the new capacity on one pair of eyes). Require a GCARS
  // reference and STAGE the change into pendingEdit for a second user to approve —
  // parity with the master-limit edit route. Only a not-yet-live (PENDING) record,
  // which grants no capacity yet, may be corrected in place.
  if (sublimitApproved(existing)) {
    const reference = typeof b.reference === "string" ? b.reference.trim() : "";
    if (!reference) return NextResponse.json({ error: "A GCARS / credit-approval reference is required to change a live ASR sublimit — the change is staged for a second approver." }, { status: 422 });
    const newApproved = patch.approvedLimit ?? existing.approvedLimit;
    const newTenor = patch.maxTenorDays ?? existing.maxTenorDays;
    addSellerObligorLimit(b.sellerId, b.obligorId, newApproved, newTenor, { reference, requestedBy: user.id, requestedByName: user.name });
    const newRev = bumpRecordRev(key);
    addAudit({
      actorUserId: user.id, actorName: user.name, action: "ASR_SUBLIMIT_EDIT_REQUEST", entityType: "ASR_SUBLIMIT", entityId: `${b.sellerId}/${b.obligorId}`,
      detail: `Requested ASR sublimit change (${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")}) — pending four-eyes (ref ${reference}).`,
    });
    return NextResponse.json({ ok: true, pending: true, rev: newRev, message: "Change staged — a second approver must confirm it before it takes effect." });
  }

  const updated = updateSellerObligorLimit(b.sellerId, b.obligorId, patch);
  if (!updated) return NextResponse.json({ error: "ASR sublimit not found." }, { status: 404 });
  const newRev = bumpRecordRev(key);

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "ASR_SUBLIMIT_EDIT",
    entityType: "ASR_SUBLIMIT",
    entityId: `${b.sellerId}/${b.obligorId}`,
    detail: `Updated ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")} (pending record, in place).`,
  });

  return NextResponse.json({ ok: true, sublimit: updated, rev: newRev });
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
