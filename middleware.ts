import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE, sessionSecret } from "@/lib/session";

// ---------------------------------------------------------------------------
// Auth gate. Two layers:
//
// 1. Optional site password (APP_PASSWORD) — a single shared HTTP Basic gate in
//    front of everything. Off when the env var is unset.
// 2. Per-user session — every request needs a valid signed session cookie
//    (set by logging in) except the login endpoints. Pages without a session
//    are redirected to /login; API calls get 401.
// ---------------------------------------------------------------------------

// Reachable without being logged in.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/logout"];

export async function middleware(req: NextRequest) {
  // Layer 1 — optional shared site password.
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword) {
    const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
    const decoded = scheme === "Basic" && encoded ? atob(encoded) : "";
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied !== appPassword) {
      return new NextResponse("Authentication required.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="SCF Dashboard"' },
      });
    }
  }

  // Layer 2 — per-user session.
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const userId = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  if (userId) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

// Run on every page and API route, but skip Next.js internals and the favicon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
