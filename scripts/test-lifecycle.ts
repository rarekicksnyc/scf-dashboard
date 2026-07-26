import type { BookedTransaction } from "@/lib/types";
import {
  collectedPrincipal,
  outstandingPrincipal,
  outstandingFraction,
  receivableStatus,
  overdueDays,
  ageBucket,
  additionalInterest,
  bookedInWindow,
} from "@/lib/receivables";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${extra}`); }
}
function near(a: number, b: number, eps = 0.5) { return Math.abs(a - b) <= eps; }

// A $10MM funded receivable, 90-day tenor, 125bps margin over 4.5% base.
function deal(over: Partial<BookedTransaction> = {}): BookedTransaction {
  return {
    id: "BKD-1", source: "BOOKED", sellerId: "S1", obligorId: "O1", productType: "DTR",
    reference: "INV-1", currency: "USD", amount: 10_000_000,
    valueDate: "2026-04-01", maturityDate: "2026-06-30",
    pricingBps: 125, baseRatePct: 4.5, bookedAt: "2026-04-01T00:00:00Z", bookedBy: "pm",
    ...over,
  };
}

console.log("Lifecycle + single-ledger math");

// 1. Fresh deal: fully outstanding, not overdue mid-tenor.
const d = deal();
ok("outstanding = full when no collections", outstandingPrincipal(d) === 10_000_000);
ok("fraction = 1 when untouched", outstandingFraction(d) === 1);
ok("status OUTSTANDING before due", receivableStatus(d, "2026-05-01") === "OUTSTANDING");

// 2. Partial collection reduces outstanding + fraction proportionally.
const dp = deal({ collections: [{ id: "C1", date: "2026-06-30", amount: 4_000_000, by: "pm" }] });
ok("collected = 4MM", collectedPrincipal(dp) === 4_000_000);
ok("outstanding = 6MM after partial", outstandingPrincipal(dp) === 6_000_000);
ok("fraction = 0.6 after partial", near(outstandingFraction(dp), 0.6, 1e-9));
ok("status PARTIALLY_COLLECTED before due", receivableStatus(dp, "2026-05-01") === "PARTIALLY_COLLECTED");

// 3. Full collection settles + drops exposure to zero.
const ds = deal({ collections: [{ id: "C1", date: "2026-06-30", amount: 10_000_000, by: "pm" }], settledAt: "2026-06-30" });
ok("outstanding = 0 when fully collected", outstandingPrincipal(ds) === 0);
ok("status SETTLED", receivableStatus(ds, "2026-07-15") === "SETTLED");
ok("settled deal not in a window after settle date", bookedInWindow(ds, { from: "2026-08-01", to: "2026-08-01" }) === false);
ok("settled deal still in a window before settle date", bookedInWindow(ds, { from: "2026-05-01", to: "2026-05-01" }) === true);

// 4. Overdue open deal stays live past maturity + accrues additional interest.
const od = deal(); // matures 2026-06-30, unsettled
ok("status OVERDUE after maturity", receivableStatus(od, "2026-07-26") === "OVERDUE");
ok("overdue open deal still consumes after maturity", bookedInWindow(od, { from: "2026-07-26", to: "2026-07-26" }) === true);
ok("overdue days = 26 on 2026-07-26", overdueDays(od, "2026-07-26") === 26);
ok("age bucket = 1 to 30 at 26 days", ageBucket(od, "2026-07-26") === "D1_30");
// additional interest = 10MM × (5.75%) × 26/360 ≈ 41,528
const ai = additionalInterest(od, "2026-07-26");
ok("additional interest all-in = 5.75%", near(ai.allInRatePct, 5.75, 1e-9));
ok("additional interest ≈ $41,528", near(ai.amount, 10_000_000 * 0.0575 * 26 / 360, 1));

// 5. Default takes precedence over overdue.
const dd = deal({ defaultedAt: "2026-07-10", defaultReason: "Obligor insolvency", workout: "INSURANCE_CLAIM" });
ok("status DEFAULTED wins", receivableStatus(dd, "2026-07-26") === "DEFAULTED");
ok("defaulted deal still exposure (unrecovered)", outstandingPrincipal(dd) === 10_000_000);
ok("no additional interest once defaulted", additionalInterest(dd, "2026-07-26").amount === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
