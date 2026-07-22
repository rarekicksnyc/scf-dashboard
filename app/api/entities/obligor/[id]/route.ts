import { NextResponse } from "next/server";
import { updateObligorEntity, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { PcgFlag } from "@/lib/types";

// Edit an eligible obligor legal entity from Data Management — the same fields
// the eligibility engine gates on (domicile, rating, insurance, PCG).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to edit entities.` }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  const patch: {
    name?: string; cdl?: string; bookingCdl?: string; domicile?: string;
    borrowerRating?: string; borrowerRatingExpiry?: string;
    insurancePolicyId?: string | undefined; insuranceExpiry?: string;
    pcg?: PcgFlag; pcgExpiry?: string; pcgLimit?: number;
  } = {};

  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  for (const key of ["cdl", "bookingCdl"] as const) {
    if (typeof b[key] === "string") {
      if (!/^\d{8}$/.test(b[key])) {
        return NextResponse.json({ error: `${key} must be an 8-digit customer code.` }, { status: 422 });
      }
      patch[key] = b[key];
    }
  }
  if (typeof b.domicile === "string" && b.domicile.trim()) patch.domicile = b.domicile.trim();
  if (typeof b.borrowerRating === "string") patch.borrowerRating = b.borrowerRating.trim();
  if (typeof b.borrowerRatingExpiry === "string") patch.borrowerRatingExpiry = b.borrowerRatingExpiry;
  if ("insurancePolicyId" in b) patch.insurancePolicyId = b.insurancePolicyId || undefined;
  if (typeof b.insuranceExpiry === "string") patch.insuranceExpiry = b.insuranceExpiry;
  if (["Y", "N", "N/A"].includes(b.pcg)) patch.pcg = b.pcg as PcgFlag;
  if (typeof b.pcgExpiry === "string") patch.pcgExpiry = b.pcgExpiry;
  if (b.pcgLimit != null && Number(b.pcgLimit) >= 0) patch.pcgLimit = Number(b.pcgLimit);

  const updated = updateObligorEntity(id, patch);
  if (!updated) return NextResponse.json({ error: "Obligor entity not found." }, { status: 404 });

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "OBLIGOR_ENTITY_EDIT",
    entityType: "OBLIGOR_ENTITY",
    entityId: id,
    detail: `Updated ${Object.keys(patch).join(", ")}.`,
  });

  return NextResponse.json({ ok: true, entity: updated });
}
