import { NextResponse } from "next/server";
import {
  addParentGuarantee,
  updateParentGuarantee,
  removeParentGuarantee,
  addAudit,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { ParentCompanyGuarantee } from "@/lib/types";

// Parent Company Guarantee register. POST adds, PATCH edits (by id), DELETE
// removes. All gated by CHANGE_LIMIT (Product Manager & Administrator) and audited.

function readFields(b: Record<string, unknown>): Partial<Omit<ParentCompanyGuarantee, "id">> {
  const patch: Partial<Omit<ParentCompanyGuarantee, "id">> = {};
  if (typeof b.parentName === "string") patch.parentName = b.parentName.trim();
  if ("sellerId" in b) patch.sellerId = (b.sellerId as string) || undefined;
  if ("obligorId" in b) patch.obligorId = (b.obligorId as string) || undefined;
  if ("coveredObligorId" in b) patch.coveredObligorId = (b.coveredObligorId as string) || undefined;
  if (typeof b.continuing === "boolean") patch.continuing = b.continuing;
  if ("expiryDate" in b) patch.expiryDate = (b.expiryDate as string) || undefined;
  if (b.limitAmount != null && b.limitAmount !== "") patch.limitAmount = Number(b.limitAmount);
  if ("notes" in b) patch.notes = (b.notes as string) || undefined;
  return patch;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to manage guarantees.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const fields = readFields(b);
  if (!fields.parentName) {
    return NextResponse.json({ error: "Parent company name is required." }, { status: 400 });
  }
  if (!fields.continuing && !fields.expiryDate) {
    return NextResponse.json({ error: "Set an expiry date, or mark it a continuing unconditional guarantee." }, { status: 422 });
  }
  const pcg = addParentGuarantee({
    parentName: fields.parentName,
    sellerId: fields.sellerId,
    obligorId: fields.obligorId,
    coveredObligorId: fields.coveredObligorId,
    continuing: Boolean(fields.continuing),
    expiryDate: fields.continuing ? undefined : fields.expiryDate,
    limitAmount: fields.limitAmount,
    notes: fields.notes,
  });
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "PCG_ADD",
    entityType: "PCG",
    entityId: pcg.id,
    detail: `Added PCG from ${pcg.parentName}${pcg.continuing ? " (continuing unconditional)" : ` exp ${pcg.expiryDate}`}.`,
  });
  return NextResponse.json({ ok: true, pcg });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to manage guarantees.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (typeof b.id !== "string") return NextResponse.json({ error: "Expected a PCG id." }, { status: 400 });
  const patch = readFields(b);
  if (patch.continuing === false && "expiryDate" in patch && !patch.expiryDate) {
    return NextResponse.json({ error: "A non-continuing guarantee needs an expiry date." }, { status: 422 });
  }
  const updated = updateParentGuarantee(b.id, patch);
  if (!updated) return NextResponse.json({ error: "PCG not found." }, { status: 404 });
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "PCG_EDIT",
    entityType: "PCG",
    entityId: b.id,
    detail: `Updated ${Object.keys(patch).join(", ")}.`,
  });
  return NextResponse.json({ ok: true, pcg: updated });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to manage guarantees.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  if (typeof b.id !== "string") return NextResponse.json({ error: "Expected a PCG id." }, { status: 400 });
  if (!removeParentGuarantee(b.id)) return NextResponse.json({ error: "PCG not found." }, { status: 404 });
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "PCG_DELETE",
    entityType: "PCG",
    entityId: b.id,
    detail: `Removed PCG ${b.id}.`,
  });
  return NextResponse.json({ ok: true });
}
