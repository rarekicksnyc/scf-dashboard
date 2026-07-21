import { NextResponse } from "next/server";
import {
  setRolePermission,
  setUserRole,
  storeGetUserById,
  addAudit,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Manage the authority model: toggle a role's permission, or assign a user's
// role. Gated by MANAGE_ROLES and audited. Guards against removing MANAGE_ROLES
// from ADMIN (which would lock everyone out of this screen).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "MANAGE_ROLES")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to manage roles.` },
      { status: 403 },
    );
  }

  const b = await request.json().catch(() => null);
  if (!b?.kind) {
    return NextResponse.json({ error: "Expected a 'kind'." }, { status: 400 });
  }

  if (b.kind === "ROLE_PERM") {
    if (b.role === "ADMIN" && b.permission === "MANAGE_ROLES" && !b.enabled) {
      return NextResponse.json(
        { error: "Cannot remove Manage roles from Administrator (would lock out this screen)." },
        { status: 422 },
      );
    }
    setRolePermission(b.role, b.permission, Boolean(b.enabled));
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "ROLE_PERMISSION_CHANGE",
      entityType: "ROLE",
      entityId: b.role,
      detail: `${b.enabled ? "Granted" : "Revoked"} ${b.permission} ${b.enabled ? "to" : "from"} ${b.role}.`,
    });
    return NextResponse.json({ ok: true });
  }

  if (b.kind === "USER_ROLE") {
    const target = storeGetUserById(b.userId);
    if (!target) {
      return NextResponse.json({ error: "Unknown user." }, { status: 404 });
    }
    const from = target.role;
    setUserRole(b.userId, b.role);
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "USER_ROLE_CHANGE",
      entityType: "USER",
      entityId: b.userId,
      detail: `${target.name}: ${from} → ${b.role}.`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
}
