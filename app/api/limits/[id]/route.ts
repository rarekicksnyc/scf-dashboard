import { NextResponse } from "next/server";
import { updateLimit, removeLimit, getLimitById, stageLimitEdit, recordUnchanged, recordRev, bumpRecordRev, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { EntityStatus } from "@/lib/types";

// Edit an existing limit's amount, max tenor, expiry, or status.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to edit limits.` },
      { status: 403 },
    );
  }

  const b = await request.json().catch(() => ({}));

  // Edit-conflict guard: if the editor sent the version it loaded and someone
  // else has changed this limit since, reject instead of silently overwriting.
  const key = `limit:${id}`;
  if (b.rev != null && !recordUnchanged(key, Number(b.rev))) {
    return NextResponse.json({ error: "This limit was changed by another user since you opened it.", current: recordRev(key) }, { status: 409 });
  }

  const limit = getLimitById(id);
  if (!limit) return NextResponse.json({ error: "Limit not found." }, { status: 404 });

  // Amount / tenor / expiry are risk-relevant — a change to any is STAGED for a
  // second approver (old value keeps serving). Status and CDL apply immediately.
  const staged: { approvedLimit?: number; maxTenorDays?: number; expiryDate?: string } = {};
  if (b.approvedLimit != null && Number(b.approvedLimit) >= 0 && Number(b.approvedLimit) !== limit.approvedLimit) staged.approvedLimit = Number(b.approvedLimit);
  if (b.maxTenorDays != null && Number(b.maxTenorDays) >= 0 && Number(b.maxTenorDays) !== limit.maxTenorDays) staged.maxTenorDays = Number(b.maxTenorDays);
  if (typeof b.expiryDate === "string" && b.expiryDate !== limit.expiryDate) staged.expiryDate = b.expiryDate;
  const hasStaged = Object.keys(staged).length > 0;

  const immediate: { status?: EntityStatus; cdl?: string } = {};
  if (typeof b.status === "string") immediate.status = b.status as EntityStatus;
  if (typeof b.cdl === "string") {
    if (!/^\d{8}$/.test(b.cdl)) return NextResponse.json({ error: "CDL must be an 8-digit customer code." }, { status: 422 });
    immediate.cdl = b.cdl;
  }

  if (hasStaged) {
    const reference = typeof b.reference === "string" ? b.reference.trim() : "";
    if (!reference) return NextResponse.json({ error: "A GCARS / credit-approval reference is required to change a limit's amount, tenor, or expiry." }, { status: 422 });
    stageLimitEdit(id, staged, { reference, requestedBy: user.id, requestedByName: user.name });
  }
  if (Object.keys(immediate).length > 0) updateLimit(id, immediate);

  const newRev = bumpRecordRev(key);
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "LIMIT_EDIT",
    entityType: "LIMIT",
    entityId: id,
    detail: hasStaged
      ? `Requested change (pending four-eyes): ${Object.entries(staged).map(([k, v]) => `${k}=${v}`).join(", ")}${Object.keys(immediate).length ? `; applied ${Object.entries(immediate).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}.`
      : `Updated ${Object.entries(immediate).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
  });

  return NextResponse.json({ ok: true, pending: hasStaged, limit: getLimitById(id), rev: newRev });
}

// Remove a limit line entirely (e.g. drop a swingline or RRL from a seller).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to remove limits.` }, { status: 403 });
  }
  try {
    removeLimit(id);
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "LIMIT_DELETE",
      entityType: "LIMIT",
      entityId: id,
      detail: `Removed limit ${id}.`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
