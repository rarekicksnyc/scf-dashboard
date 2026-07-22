import { NextResponse } from "next/server";
import { resetExposure, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Clear every booked and reserved exposure so all limits return to full
// availability (limits/sellers/obligors untouched). Used to reset the tool to a
// clean slate before a demo or a fresh cycle. Gated by CHANGE_LIMIT and audited.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to reset exposure.` },
      { status: 403 },
    );
  }

  // Guard against an accidental click — the client must confirm.
  const b = await request.json().catch(() => ({}));
  if (b?.confirm !== true) {
    return NextResponse.json({ error: "Confirmation required." }, { status: 400 });
  }

  const counts = resetExposure();
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "RESET_EXPOSURE",
    entityType: "SYSTEM",
    entityId: "exposure",
    detail: `Reset all exposure to full availability — cleared ${counts.utilizations} booked utilization(s), ${counts.reservations} reservation(s), and ${counts.batches} batch(es).`,
  });

  return NextResponse.json({ ok: true, cleared: counts });
}
