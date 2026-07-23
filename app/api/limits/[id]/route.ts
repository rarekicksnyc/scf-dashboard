import { NextResponse } from "next/server";
import { updateLimit, removeLimit, addAudit } from "@/lib/data/store";
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
  const patch: {
    approvedLimit?: number;
    maxTenorDays?: number;
    expiryDate?: string;
    status?: EntityStatus;
    cdl?: string;
  } = {};
  if (b.approvedLimit != null && Number(b.approvedLimit) >= 0) patch.approvedLimit = Number(b.approvedLimit);
  if (b.maxTenorDays != null && Number(b.maxTenorDays) >= 0) patch.maxTenorDays = Number(b.maxTenorDays);
  if (typeof b.expiryDate === "string") patch.expiryDate = b.expiryDate;
  if (typeof b.status === "string") patch.status = b.status as EntityStatus;
  if (typeof b.cdl === "string") {
    if (!/^\d{8}$/.test(b.cdl)) {
      return NextResponse.json({ error: "CDL must be an 8-digit customer code." }, { status: 422 });
    }
    patch.cdl = b.cdl;
  }

  const updated = updateLimit(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Limit not found." }, { status: 404 });
  }

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "LIMIT_EDIT",
    entityType: "LIMIT",
    entityId: id,
    detail: `Updated ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
  });

  return NextResponse.json({ ok: true, limit: updated });
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
