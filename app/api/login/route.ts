import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { storeGetUserById } from "@/lib/data/store";
import { verifyPassword } from "@/lib/password";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionSecret } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// Log in as a user: verify the password, then set the signed session cookie.
export async function POST(request: Request) {
  // Throttle credential attempts per client IP (brute-force protection).
  const rl = rateLimit(`login:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many login attempts — try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
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
    maxAge: SESSION_TTL_SECONDS, // cookie drops at the same absolute lifetime as the signed expiry
  });

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
