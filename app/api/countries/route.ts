import { NextResponse } from "next/server";
import { setCountryEligible, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Toggle a country's enforceability (eligibility as a domicile). Gated by
// CHANGE_LIMIT and audited.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to change country eligibility.` },
      { status: 403 },
    );
  }
  const b = await request.json().catch(() => null);
  if (!b?.code || typeof b.eligible !== "boolean") {
    return NextResponse.json({ error: "Expected { code, eligible }." }, { status: 400 });
  }
  setCountryEligible(b.code, b.eligible);
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "COUNTRY_ELIGIBILITY",
    entityType: "COUNTRY",
    entityId: b.code,
    detail: `${b.code} enforceability ${b.eligible ? "enabled" : "disabled"}.`,
  });
  return NextResponse.json({ ok: true });
}
