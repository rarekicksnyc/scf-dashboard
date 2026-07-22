import { NextResponse } from "next/server";
import { setCountryEligible, addCountry, removeCountry, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Country enforceability register. POST adds a country (when a name is supplied)
// or toggles a country's eligibility; DELETE removes one entirely. All gated by
// CHANGE_LIMIT and audited.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to change the country register.` },
      { status: 403 },
    );
  }
  const b = await request.json().catch(() => null);
  if (!b?.code) {
    return NextResponse.json({ error: "Expected a country code." }, { status: 400 });
  }

  // Add a new country when a name is supplied; otherwise toggle eligibility.
  if (b.name) {
    if (!/^[A-Za-z]{2}$/.test(String(b.code))) {
      return NextResponse.json({ error: "Country code must be 2 letters (ISO)." }, { status: 400 });
    }
    try {
      const country = addCountry(b.code, b.name, Boolean(b.eligible));
      addAudit({
        actorUserId: user.id,
        actorName: user.name,
        action: "COUNTRY_ADD",
        entityType: "COUNTRY",
        entityId: country.code,
        detail: `Added country ${country.code} (${country.name}) — ${country.eligible ? "eligible" : "not eligible"}.`,
      });
      return NextResponse.json({ ok: true, country });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 422 });
    }
  }

  if (typeof b.eligible !== "boolean") {
    return NextResponse.json({ error: "Expected { code, eligible } or { code, name }." }, { status: 400 });
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

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to remove a country.` },
      { status: 403 },
    );
  }
  const b = await request.json().catch(() => null);
  if (!b?.code) {
    return NextResponse.json({ error: "Expected a country code." }, { status: 400 });
  }
  try {
    removeCountry(b.code);
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "COUNTRY_REMOVE",
      entityType: "COUNTRY",
      entityId: b.code,
      detail: `Removed country ${b.code} from the register.`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
