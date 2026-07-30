import { store, findLimit, limitViews } from "@/lib/data/store";
import { limitActiveOn, limitLapsed } from "@/lib/format";
import type { Limit } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };

const base = (over: Partial<Limit>): Limit => ({
  id: "X", type: "SWINGLINE", cdl: "CDL1", entityType: "SELLER", entityId: "SELLER_OVL",
  currency: "USD", approvedLimit: 5_000_000, maxTenorDays: 180,
  effectiveDate: "2026-01-01", expiryDate: "2026-12-31", status: "ACTIVE",
  warnThreshold: 0.85, exceptionThreshold: 1.0, ...over,
});

const X = "2026-09-01";
const oldSwl = base({ id: "SWL-OLD", effectiveDate: "2026-01-01", expiryDate: X });   // expires ON X (exclusive)
const newSwl = base({ id: "SWL-NEW", effectiveDate: X, expiryDate: "2027-03-01" });    // effective ON X
store.limits.push(oldSwl, newSwl);

console.log("Swingline same-date handoff (exclusive expiry)");

// Active windows
ok("old active the day before X", limitActiveOn(oldSwl, "2026-08-31"));
ok("old NOT active on X (exclusive expiry)", !limitActiveOn(oldSwl, X));
ok("new active on X", limitActiveOn(newSwl, X));
ok("new NOT active before X", !limitActiveOn(newSwl, "2026-08-31"));
ok("old lapsed on X", limitLapsed(oldSwl.expiryDate, X));
ok("old not lapsed the day before", !limitLapsed(oldSwl.expiryDate, "2026-08-31"));

// findLimit picks the governing limit
ok("findLimit day before X → old", findLimit("SWINGLINE", "SELLER_OVL", "2026-08-31")?.id === "SWL-OLD");
ok("findLimit on X → new (handoff)", findLimit("SWINGLINE", "SELLER_OVL", X)?.id === "SWL-NEW");
ok("findLimit after X → new", findLimit("SWINGLINE", "SELLER_OVL", "2026-10-01")?.id === "SWL-NEW");

// limitViews never double-counts: exactly one of the two shows on any date
const idsOn = (d: string) => limitViews(d).filter((v) => v.limit.entityId === "SELLER_OVL").map((v) => v.limit.id);
ok("only ONE swingline shows the day before X", idsOn("2026-08-31").length === 1 && idsOn("2026-08-31")[0] === "SWL-OLD");
ok("only ONE swingline shows on X (new)", idsOn(X).length === 1 && idsOn(X)[0] === "SWL-NEW");
ok("no gap: a governing limit exists on X", idsOn(X).length === 1);

// Solo lapsed limit is NOT hidden (only duplicates are suppressed)
store.limits.push(base({ id: "SWL-SOLO", entityId: "SELLER_SOLO", effectiveDate: "2026-01-01", expiryDate: "2026-06-01" }));
const solo = limitViews("2026-10-01").filter((v) => v.limit.entityId === "SELLER_SOLO");
ok("solo lapsed limit still shows (not suppressed)", solo.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
