import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Password hashing (scrypt, from Node's built-in crypto — no dependencies).
// Stored form is "salt:hash" (both hex). Used only server-side (login + seed).
// ---------------------------------------------------------------------------

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(plain, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
