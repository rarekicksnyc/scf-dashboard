import { NextResponse } from "next/server";
import {
  setCdl,
  setLimitAmount,
  setEntitySwingline,
  addAudit,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Setup mutations — assign CDL, edit a main limit amount, and toggle/size a
// per-entity swingline. Gated by CHANGE_LIMIT.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to change setup.` },
      { status: 403 },
    );
  }

  const b = await request.json().catch(() => null);
  if (!b || !b.entityType || !b.entityId) {
    return NextResponse.json(
      { error: "Expected entityType and entityId." },
      { status: 400 },
    );
  }
  const entityType: "SELLER" | "OBLIGOR" = b.entityType;
  const changes: string[] = [];

  if (typeof b.cdl === "string") {
    setCdl(entityType, b.entityId, b.cdl);
    changes.push(`CDL=${b.cdl}`);
  }
  if (b.limitId && Number(b.limitAmount) >= 0) {
    setLimitAmount(b.limitId, Number(b.limitAmount));
    changes.push(`${b.limitId}=${Number(b.limitAmount)}`);
  }
  if (typeof b.swinglineEnabled === "boolean") {
    setEntitySwingline(
      entityType,
      b.entityId,
      b.swinglineEnabled,
      Number(b.swinglineAmount) || 0,
    );
    changes.push(
      b.swinglineEnabled
        ? `swingline ON @ ${Number(b.swinglineAmount) || 0}`
        : "swingline OFF",
    );
  }

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "SETUP_UPDATE",
    entityType,
    entityId: b.entityId,
    detail: changes.join("; ") || "no changes",
  });

  return NextResponse.json({ ok: true, changes });
}
