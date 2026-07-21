import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  listUsers,
  getCurrentUser,
  getUserById,
  permissionsFor,
  SESSION_COOKIE,
} from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    user,
    permissions: permissionsFor(user.role),
    users: listUsers(),
  });
}

// Switch the acting user (stands in for SSO login in the MVP).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const user = getUserById(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return NextResponse.json({ user, permissions: permissionsFor(user.role) });
}
