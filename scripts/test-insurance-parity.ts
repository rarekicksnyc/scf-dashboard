// Regression: the BATCH engine now enforces the insurance buyer sublimit and
// country limit (keyed off the booking entity's domicile), with cumulative
// consumption within a batch — parity with the interactive engine.
//
// OBL003 has NO eligible investor, so its deals stay fully bank-held and the
// insurance overlay (POL-1, 90%) applies to the whole amount — the clean way to
// exercise the insurance sublimits. POL-1 buyer sublimit for OBL003 = 10M, US
// country limit = 40M; the SELLER001/OBL003 ASR sublimit (12M) and OBL003 master
// (15M) are sized so ONLY the insurance buyer sublimit binds in these cases.
import { resetExposure } from "@/lib/data/store";
import { runBatch } from "@/lib/engine";
import type { Invoice } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };
console.log("Batch insurance buyer/country sublimit parity\n");

const inv = (n: string, amount: number): Invoice => ({
  invoiceNumber: n, sellerId: "SELLER001", obligorId: "OBL003", amount, coverageAmount: amount,
  currency: "USD", issueDate: "2026-03-01", requestedDiscountDate: "2026-03-15", dueDate: "2026-05-01", advanceRate: 1, productType: "DTR",
});
const batch = (invs: Invoice[]) => runBatch(invs, { batchId: "BINS", fileName: "i.csv", uploadedAt: "2026-03-15T00:00:00Z", makerUserId: "t" });
const chk = (r: ReturnType<typeof runBatch>, i: number, name: string) => r.results[i].checks.find((c) => c.checkName === name);

// 1. Single insured invoice: 11.5M coverage -> insured 10.35M > 10M buyer sublimit
//    -> RED, REJECTED. Country (US 40M) and all credit lines clear.
resetExposure();
const r1 = batch([inv("I-1", 11_500_000)]);
ok("single insured invoice over the buyer sublimit -> RED", chk(r1, 0, "INSURANCE_BUYER_SUBLIMIT_CHECK")?.severity === "RED" && r1.results[0].status === "REJECTED", `${chk(r1, 0, "INSURANCE_BUYER_SUBLIMIT_CHECK")?.severity}/${r1.results[0].status}`);
ok("country limit is NOT the binding constraint (US 40M)", chk(r1, 0, "INSURANCE_COUNTRY_LIMIT_CHECK")?.severity === "GREEN");

// 2. Cumulative within a batch: two 6M invoices -> insured 5.4M each. First fits
//    the 10M sublimit; the second exceeds the remaining 4.6M -> RED.
resetExposure();
const r2 = batch([inv("I-2a", 6_000_000), inv("I-2b", 6_000_000)]);
ok("first insured invoice within the buyer sublimit funds", r2.results[0].status === "ELIGIBLE" || r2.results[0].status === "ELIGIBLE_WITH_WARNING", r2.results[0].status);
ok("first invoice buyer-sublimit check PASSes", chk(r2, 0, "INSURANCE_BUYER_SUBLIMIT_CHECK")?.severity === "GREEN");
ok("second insured invoice breaches the buyer sublimit cumulatively -> RED", chk(r2, 1, "INSURANCE_BUYER_SUBLIMIT_CHECK")?.severity === "RED" && r2.results[1].status === "REJECTED", `${chk(r2, 1, "INSURANCE_BUYER_SUBLIMIT_CHECK")?.severity}/${r2.results[1].status}`);

// 3. A modest insured invoice within every sublimit clears with GREEN checks.
resetExposure();
const r3 = batch([inv("I-3", 8_000_000)]);
ok("within-sublimit insured invoice: buyer check GREEN", chk(r3, 0, "INSURANCE_BUYER_SUBLIMIT_CHECK")?.severity === "GREEN");
ok("within-sublimit insured invoice: country check GREEN", chk(r3, 0, "INSURANCE_COUNTRY_LIMIT_CHECK")?.severity === "GREEN");
ok("within-sublimit insured invoice funds", r3.results[0].status === "ELIGIBLE" || r3.results[0].status === "ELIGIBLE_WITH_WARNING", r3.results[0].status);

resetExposure();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail) process.exit(1);
