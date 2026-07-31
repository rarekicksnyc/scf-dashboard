import { NextResponse } from "next/server";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { listPendingLimits, approveLimit, rejectLimit, getSeller, getObligor, addAudit } from "@/lib/data/store";

// Four-eyes queue for new limits. A limit created via the register is PENDING and
// grants no capacity until a DIFFERENT authorized user approves it here, recording
// the GCARS/approval reference. Approving/rejecting requires Approve exception.
export async function GET() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT") && !roleHas(user.role, "APPROVE_EXCEPTION")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  const pending = listPendingLimits().map((l) => ({
    id: l.id, type: l.type, entityType: l.entityType, entityId: l.entityId,
    entityName: l.entityType === "SELLER" ? getSeller(l.entityId)?.name : l.entityType === "OBLIGOR" ? getObligor(l.entityId)?.name : l.entityId,
    approvedLimit: l.approvedLimit, maxTenorDays: l.maxTenorDays, expiryDate: l.expiryDate,
    reference: l.approval?.reference, requestedBy: l.approval?.requestedBy, requestedByName: l.approval?.requestedByName, requestedAt: l.approval?.requestedAt,
  }));
  return NextResponse.json({ pending });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "APPROVE_EXCEPTION")) {
    return NextResponse.json({ error: `Role ${user.role} cannot approve limits.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (b.action === "approve") {
    const r = approveLimit(id, user.id, user.name);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    addAudit({ actorUserId: user.id, actorName: user.name, action: "LIMIT_APPROVE", entityType: "LIMIT", entityId: id, detail: `Approved limit ${id} (ref ${r.limit?.approval?.reference}); maker ${r.limit?.approval?.requestedByName}.` });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "reject") {
    const r = rejectLimit(id, user.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    addAudit({ actorUserId: user.id, actorName: user.name, action: "LIMIT_REJECT", entityType: "LIMIT", entityId: id, detail: `Rejected pending limit ${id}.` });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Expected action approve|reject." }, { status: 400 });
}
