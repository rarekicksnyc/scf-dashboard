import { NextResponse } from "next/server";
import { updateInsurancePolicy, getInsurancePolicy, recordUnchanged, recordRev, bumpRecordRev, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Edit an insurance policy's annual minimum premium (the insurer-rate figure the
// policy must generate over the fiscal year; a shortfall becomes the seller's
// year-end top-up). Gated to Change limit, four-eyes-audited, conflict-guarded.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to edit policies.` }, { status: 403 });
  }

  const policy = getInsurancePolicy(id);
  if (!policy) return NextResponse.json({ error: "Insurance policy not found." }, { status: 404 });

  const b = await request.json().catch(() => ({}));
  const key = `policy:${id}`;
  if (b.rev != null && !recordUnchanged(key, Number(b.rev))) {
    return NextResponse.json({ error: "This policy was changed by another user since you opened it.", current: recordRev(key) }, { status: 409 });
  }

  if (b.minimumPremium == null || Number.isNaN(Number(b.minimumPremium)) || Number(b.minimumPremium) < 0) {
    return NextResponse.json({ error: "Expected a non-negative minimumPremium." }, { status: 400 });
  }
  const minimumPremium = Number(b.minimumPremium);
  const before = policy.minimumPremium ?? 0;
  const updated = updateInsurancePolicy(id, { minimumPremium });
  const newRev = bumpRecordRev(key);

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "INSURANCE_POLICY_EDIT",
    entityType: "INSURANCE_POLICY",
    entityId: id,
    detail: `Minimum premium ${before} → ${minimumPremium} on ${policy.insurerName} · ${policy.policyNumber}.`,
  });

  return NextResponse.json({ ok: true, policy: updated, rev: newRev });
}
