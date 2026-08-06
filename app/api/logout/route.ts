import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionUser } from "@/lib/auth";
import { addAudit } from "@/lib/data/store";

// Clear the session cookie.
export async function POST() {
  const user = await getSessionUser().catch(() => null);
  if (user) addAudit({ actorUserId: user.id, actorName: user.name, action: "LOGOUT", entityType: "SESSION", entityId: user.id, detail: "Signed out." });
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
