// ---------------------------------------------------------------------------
// Signed session cookie. The cookie value is "userId.signature", where the
// signature is an HMAC-SHA256 of the userId with SESSION_SECRET. This stops a
// user from forging the cookie to become another user (the old MVP cookie was
// unsigned). Uses Web Crypto + btoa/atob only, so the SAME code runs in both the
// Node runtime (login/read) and the edge runtime (the middleware gate).
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(userId));
  return base64url(new Uint8Array(signature));
}

export async function signSession(userId: string, secret: string): Promise<string> {
  return `${userId}.${await sign(userId, secret)}`;
}

// Returns the userId if the signature is valid, else null.
export async function verifySession(value: string | undefined, secret: string): Promise<string | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const userId = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = await sign(userId, secret);
  if (signature.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? userId : null;
}

export const SESSION_COOKIE = "scf_session";

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  // Fail CLOSED in production: never sign sessions with a known, in-repo value —
  // that would let anyone forge an Administrator cookie. Refuse instead. Locally
  // (dev) the fixed fallback is fine so the app runs without configuration.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production (refusing to run with an insecure default).");
  }
  return "dev-only-insecure-secret";
}
