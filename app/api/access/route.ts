import { NextResponse } from "next/server";
import {
  setRolePermission,
  setUserRole,
  storeGetUserById,
  addUser,
  deleteUser,
  updateUserName,
  addAudit,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import type { Role } from "@/lib/types";

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

  if (b.kind === "USER_ADD") {
    const name = String(b.name || "").trim();
    const role = b.role as Role;
    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 422 });
    const password = typeof b.password === "string" && b.password.length >= 4 ? b.password : "demo1234";
    const created = addUser({ name, role: role || "VIEWER", passwordHash: hashPassword(password) });
    addAudit({
      actorUserId: user.id, actorName: user.name,
      action: "USER_ADD", entityType: "USER", entityId: created.id,
      detail: `Added user ${name} (${created.role}).`,
    });
    return NextResponse.json({ ok: true, user: { id: created.id, name: created.name, role: created.role } });
  }

  if (b.kind === "USER_DELETE") {
    const target = storeGetUserById(b.userId);
    if (!target) return NextResponse.json({ error: "Unknown user." }, { status: 404 });
    if (b.userId === user.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 422 });
    deleteUser(b.userId);
    addAudit({
      actorUserId: user.id, actorName: user.name,
      action: "USER_DELETE", entityType: "USER", entityId: b.userId,
      detail: `Deleted user ${target.name}.`,
    });
    return NextResponse.json({ ok: true });
  }

  if (b.kind === "USER_RENAME") {
    const target = storeGetUserById(b.userId);
    if (!target) return NextResponse.json({ error: "Unknown user." }, { status: 404 });
    const name = String(b.name || "").trim();
    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 422 });
    const from = target.name;
    updateUserName(b.userId, name);
    addAudit({
      actorUserId: user.id, actorName: user.name,
      action: "USER_RENAME", entityType: "USER", entityId: b.userId,
      detail: `Renamed user ${from} → ${name}.`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
}
