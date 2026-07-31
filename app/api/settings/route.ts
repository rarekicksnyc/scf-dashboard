import { NextResponse } from "next/server";
import { getSettings, updateSettings, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Desk-wide settings (currently the booking / funding-team recipients). Gated by
// CHANGE_LIMIT (Portfolio Manager & Administrator).
export async function GET() {
  return NextResponse.json({ settings: getSettings() });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to change settings.` }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const patch: { bookingTeamEmails?: string } = {};
  if (typeof body.bookingTeamEmails === "string") patch.bookingTeamEmails = body.bookingTeamEmails.trim();
  const settings = updateSettings(patch);
  addAudit({ actorUserId: user.id, actorName: user.name, action: "SETTINGS_UPDATE", entityType: "SETTINGS", entityId: "org", detail: `Updated booking-team recipients.` });
  return NextResponse.json({ ok: true, settings });
}
