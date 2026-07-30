import { NextResponse } from "next/server";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { addCoverage, removeCoverage, storeGetUserById, getSeller, getObligor, addAudit } from "@/lib/data/store";

// Assign / unassign seller or obligor coverage to a user. Gated to Manage roles
// (the authority model) and audited. Multiple users may cover one entity (backup).
async function requireManage() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "MANAGE_ROLES")) return { error: NextResponse.json({ error: `Role ${user.role} is not permitted to manage coverage.` }, { status: 403 }) };
  return { user };
}

export async function POST(request: Request) {
  const g = await requireManage();
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const entityType = b.entityType === "OBLIGOR" ? "OBLIGOR" : b.entityType === "SELLER" ? "SELLER" : null;
  if (!b.userId || !storeGetUserById(b.userId)) return NextResponse.json({ error: "Unknown user." }, { status: 400 });
  if (!entityType || !b.entityId) return NextResponse.json({ error: "Expected entityType (SELLER|OBLIGOR) and entityId." }, { status: 400 });
  const name = entityType === "SELLER" ? getSeller(b.entityId)?.name : getObligor(b.entityId)?.name;
  if (!name) return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  const rec = addCoverage({ userId: b.userId, entityType, entityId: b.entityId });
  if (!rec) return NextResponse.json({ error: "That coverage already exists." }, { status: 409 });
  const who = storeGetUserById(b.userId)?.name ?? b.userId;
  addAudit({ actorUserId: g.user.id, actorName: g.user.name, action: "COVERAGE_ADD", entityType: "COVERAGE", entityId: rec.id, detail: `Assigned ${who} to ${entityType.toLowerCase()} ${name}.` });
  return NextResponse.json({ ok: true, coverage: rec });
}

export async function DELETE(request: Request) {
  const g = await requireManage();
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  if (!removeCoverage(String(b.id ?? ""))) return NextResponse.json({ error: "Coverage not found." }, { status: 404 });
  addAudit({ actorUserId: g.user.id, actorName: g.user.name, action: "COVERAGE_REMOVE", entityType: "COVERAGE", entityId: String(b.id), detail: `Removed coverage ${b.id}.` });
  return NextResponse.json({ ok: true });
}
