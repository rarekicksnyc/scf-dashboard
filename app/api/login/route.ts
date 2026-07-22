import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { storeGetUserById } from "@/lib/data/store";
import { verifyPassword } from "@/lib/password";
import { signSession, SESSION_COOKIE, sessionSecret } from "@/lib/session";

// Log in as a user: verify the password, then set the signed session cookie.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const user = body?.userId ? storeGetUserById(body.userId) : undefined;

  if (!user || !user.passwordHash || typeof body.password !== "string" || !verifyPassword(body.password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(user.id, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
