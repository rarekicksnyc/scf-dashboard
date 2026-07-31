import { NextResponse } from "next/server";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { listPendingLimits, approveLimit, rejectLimit, listPendingSublimits, approveSublimit, rejectSublimit, listPendingLimitEdits, approveLimitEdit, rejectLimitEdit, getLimitById, getSeller, getObligor, addAudit } from "@/lib/data/store";

// Four-eyes queue for new limits. A limit created via the register is PENDING and
// grants no capacity until a DIFFERENT authorized user approves it here, recording
// the GCARS/approval reference. Approving/rejecting requires Approve exception.
export async function GET() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT") && !roleHas(user.role, "APPROVE_EXCEPTION")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  const pending = [
    ...listPendingLimits().map((l) => ({
      id: l.id, kind: "LIMIT", type: l.type,
      entityName: l.entityType === "SELLER" ? getSeller(l.entityId)?.name : l.entityType === "OBLIGOR" ? getObligor(l.entityId)?.name : l.entityId,
      approvedLimit: l.approvedLimit, maxTenorDays: l.maxTenorDays, expiryDate: l.expiryDate,
      reference: l.approval?.reference, requestedByName: l.approval?.requestedByName,
    })),
    ...listPendingSublimits().map((s) => ({
      id: `SOL:${s.sellerId}:${s.obligorId}`, kind: s.pendingEdit ? "SUBLIMIT_EDIT" : "SUBLIMIT", type: s.pendingEdit ? "ASR sublimit (edit)" : "ASR sublimit",
      entityName: `${getObligor(s.obligorId)?.name ?? s.obligorId} · under ${getSeller(s.sellerId)?.name ?? s.sellerId}`,
      approvedLimit: s.pendingEdit ? (s.pendingEdit.approvedLimit ?? s.approvedLimit) : s.approvedLimit,
      maxTenorDays: s.pendingEdit ? (s.pendingEdit.maxTenorDays ?? s.maxTenorDays) : s.maxTenorDays,
      expiryDate: "—",
      reference: s.pendingEdit ? s.pendingEdit.reference : s.approval?.reference,
      requestedByName: s.pendingEdit ? s.pendingEdit.requestedByName : s.approval?.requestedByName,
      note: s.pendingEdit ? `was ${s.approvedLimit.toLocaleString()} / ${s.maxTenorDays}d` : undefined,
    })),
    ...listPendingLimitEdits().map((l) => ({
      id: l.id, kind: "LIMIT_EDIT", type: `${l.type} (edit)`,
      entityName: l.entityType === "SELLER" ? getSeller(l.entityId)?.name : l.entityType === "OBLIGOR" ? getObligor(l.entityId)?.name : l.entityId,
      approvedLimit: l.pendingEdit!.approvedLimit ?? l.approvedLimit,
      maxTenorDays: l.pendingEdit!.maxTenorDays ?? l.maxTenorDays,
      expiryDate: l.pendingEdit!.expiryDate ?? l.expiryDate,
      reference: l.pendingEdit!.reference, requestedByName: l.pendingEdit!.requestedByName,
      note: `was ${l.approvedLimit.toLocaleString()} / ${l.maxTenorDays}d / ${l.expiryDate}`,
    })),
  ];
  return NextResponse.json({ pending });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "APPROVE_EXCEPTION")) {
    return NextResponse.json({ error: `Role ${user.role} cannot approve limits.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const id = String(b.id ?? "");
  const isSublimit = id.startsWith("SOL:");
  const [, sellerId, obligorId] = isSublimit ? id.split(":") : ["", "", ""];
  // A LIVE limit with a staged edit is an EDIT approval; a not-yet-live pending
  // limit is a NEW approval. They are mutually exclusive on one record.
  const isEdit = !isSublimit && Boolean(getLimitById(id)?.pendingEdit);
  const kindLabel = isSublimit ? "ASR sublimit" : isEdit ? "limit change" : "limit";

  if (b.action === "approve") {
    const r = isSublimit ? approveSublimit(sellerId, obligorId, user.id, user.name) : isEdit ? approveLimitEdit(id, user.id, user.name) : approveLimit(id, user.id, user.name);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    addAudit({ actorUserId: user.id, actorName: user.name, action: "LIMIT_APPROVE", entityType: isSublimit ? "ASR_SUBLIMIT" : "LIMIT", entityId: id, detail: `Approved ${kindLabel} ${id}.` });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "reject") {
    const r = isSublimit ? rejectSublimit(sellerId, obligorId, user.id) : isEdit ? rejectLimitEdit(id, user.id) : rejectLimit(id, user.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    addAudit({ actorUserId: user.id, actorName: user.name, action: "LIMIT_REJECT", entityType: isSublimit ? "ASR_SUBLIMIT" : "LIMIT", entityId: id, detail: `Rejected pending ${kindLabel} ${id}.` });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Expected action approve|reject." }, { status: 400 });
}
