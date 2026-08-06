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

// Absolute session lifetime. A cookie older than this is rejected (the user must
// log in again), and the cookie's max-age matches, so a stolen cookie is not valid
// forever.
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64url(new Uint8Array(signature));
}

// Token format: `${userId}.${expEpochSeconds}.${sig}` where sig = HMAC(userId.exp).
// The expiry is inside the signed payload so it cannot be tampered with.
export async function signSession(userId: string, secret: string, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${exp}`;
  return `${payload}.${await sign(payload, secret)}`;
}

// Returns the userId if the signature is valid AND the token has not expired, else
// null. Legacy 2-part (unexpiring) tokens are rejected so everyone re-authenticates
// once with an expiring session.
export async function verifySession(value: string | undefined, secret: string): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null; // reject legacy/malformed tokens
  const [userId, expStr, signature] = parts;
  const payload = `${userId}.${expStr}`;
  const expected = await sign(payload, secret);
  if (signature.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return null; // expired
  return userId;
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
