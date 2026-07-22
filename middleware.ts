import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Site password gate (HTTP Basic Auth).
//
// When the APP_PASSWORD environment variable is set (i.e. in a deployed
// environment), every request must supply the shared password before the app
// is served. When APP_PASSWORD is NOT set (local development), the gate is off.
//
// This is a single shared password in front of the whole site — it is NOT the
// per-user login. Inside the app, the "Acting as" role switcher still governs
// what each role can do. Replace this with real SSO for production per-user auth.
// ---------------------------------------------------------------------------

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;

  // No password configured (local dev) → let everything through.
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    // "user:pass" is base64-encoded by the browser. We accept any username and
    // check only the password.
    const decoded = atob(encoded);
    const suppliedPassword = decoded.slice(decoded.indexOf(":") + 1);
    if (suppliedPassword === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SCF Dashboard"' },
  });
}

// Run on every page and API route, but skip Next.js internals and the favicon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
