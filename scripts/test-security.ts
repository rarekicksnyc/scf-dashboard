// Regressions for the pre-production hardening: session expiry, rate limiting,
// and the email/CSV output-safety helpers.
import { signSession, verifySession, SESSION_TTL_SECONDS } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { winAnsiSafe } from "@/lib/pdf";
import { csvSafe } from "@/lib/csvexport";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };

async function main() {
  console.log("Security hardening regressions\n");
  const secret = "test-secret";

  // Session: a valid token verifies; a tampered/forged one does not.
  const tok = await signSession("u_product", secret);
  ok("valid session verifies to the user id", (await verifySession(tok, secret)) === "u_product");
  ok("session has the 3-part expiring format", tok.split(".").length === 3);
  ok("wrong secret rejects", (await verifySession(tok, "other-secret")) === null);
  ok("tampered user id rejects", (await verifySession("admin." + tok.split(".").slice(1).join("."), secret)) === null);
  ok("legacy 2-part token rejected (forces re-login with expiry)", (await verifySession("u_product.deadbeef", secret)) === null);

  // Session: an expired token is rejected. Forge a validly-signed token with a
  // past expiry to prove the expiry check (not just the signature) is enforced.
  const past = await signSession("u_product", secret, -10); // expired 10s ago
  ok("expired but validly-signed token is rejected", (await verifySession(past, secret)) === null);
  ok("TTL is a sane positive window", SESSION_TTL_SECONDS > 0 && SESSION_TTL_SECONDS <= 24 * 3600);

  // Rate limiter: allows up to the limit, then blocks within the window.
  const key = "test:1.2.3.4";
  let allowed = 0;
  for (let i = 0; i < 5; i++) if (rateLimit(key, 3, 60_000).ok) allowed++;
  ok("rate limiter allows exactly the limit then blocks", allowed === 3, `allowed=${allowed}`);
  ok("blocked response carries a retry-after", rateLimit(key, 3, 60_000).retryAfter > 0);
  ok("a different key is independent", rateLimit("test:9.9.9.9", 3, 60_000).ok === true);

  // Output safety helpers (defense in depth beyond their call sites).
  ok("csvSafe neutralizes =/+/-/@", csvSafe("=A1").startsWith("'") && csvSafe("-1").startsWith("'") && csvSafe("+x").startsWith("'") && csvSafe("@y").startsWith("'"));
  ok("winAnsiSafe never yields a non-WinAnsi code point", [...winAnsiSafe("🚀三 café Łódź")].every((c) => c.codePointAt(0)! <= 0xff || c === "?" || c === "€"));

  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  if (fail) process.exit(1);
}

main();
