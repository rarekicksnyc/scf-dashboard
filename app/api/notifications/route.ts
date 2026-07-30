import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listNotificationsForUser, unreadNotificationCount, markNotificationRead, markAllNotificationsRead } from "@/lib/data/store";
import { coverageDigest, digestCount } from "@/lib/notifications";

// The bell feed for the current user: the live coverage digest (maturities,
// today's reservations, limits due) plus stored events (exceptions) with read
// state. No mutation here beyond marking read; everything is scoped to the caller.
export async function GET() {
  const user = await getCurrentUser();
  const today = new Date().toISOString().slice(0, 10);
  const digest = coverageDigest(user.id, today);
  const events = listNotificationsForUser(user.id);
  const unreadEvents = unreadNotificationCount(user.id);
  return NextResponse.json({ digest, events, unreadEvents, badge: unreadEvents + digestCount(digest) });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const b = await request.json().catch(() => ({}));
  if (b.action === "readAll") return NextResponse.json({ ok: true, marked: markAllNotificationsRead(user.id) });
  if (b.action === "read" && typeof b.id === "string") return NextResponse.json({ ok: markNotificationRead(b.id, user.id) });
  return NextResponse.json({ error: "Expected action read|readAll." }, { status: 400 });
}
