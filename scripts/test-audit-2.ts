// Regressions for the SECOND adversarial audit's 9 confirmed findings.
import {
  store, resetExposure, findLimit, getObligor, sellerObligorLimit, entitySwingline,
  materializeBatchBookings, listBookedTransactions, removeBatchBookings, recordCollection,
  markReceivableDefault, fileInsuranceClaim, decideInsuranceClaim,
} from "@/lib/data/store";
import { runBatch } from "@/lib/engine";
import { accruedRevenue } from "@/lib/revenue";
import type { RevDeal } from "@/lib/revenue";
import { buildScheduleEvents } from "@/lib/schedule";
import { evaluateExpression } from "@/lib/creator/expr";
import type { Invoice, BatchResult, InvoiceResult, Limit } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };
resetExposure();

console.log("Second-audit regressions\n");

// Pick a live ASR-approved pair (SELLER001/OBL001 in seed).
const pair = store.sellerObligorLimits.find((x) => !x.approval && findLimit("SELLER", x.sellerId) && findLimit("OBLIGOR", x.obligorId) && getObligor(x.obligorId)?.status === "ACTIVE")!;
const seller = store.sellers.find((s) => s.id === pair.sellerId)!;
const inv = (n: string): Invoice => ({
  invoiceNumber: n, sellerId: pair.sellerId, obligorId: pair.obligorId, amount: 1_000_000, coverageAmount: 1_000_000,
  currency: seller.currency, issueDate: "2026-03-01", requestedDiscountDate: "2026-03-15", dueDate: "2026-05-01", advanceRate: 1, productType: "DTR",
});
const batchOf = (i: Invoice[]) => runBatch(i, { batchId: "B2", fileName: "b.csv", uploadedAt: "2026-03-15T00:00:00Z", makerUserId: "t" });
const asrSub = (r: ReturnType<typeof runBatch>) => r.results[0].checks.find((c) => c.checkName === "ASR_SUBLIMIT_CHECK");

// --- #1: batch enforces the per-pair ASR sublimit TENOR (was only interactive)
const origTenor = pair.maxTenorDays;
pair.maxTenorDays = 20; // deal tenor is ~47d > 20d
let r = batchOf([inv("T1")]);
ok("#1 batch flags ASR sublimit tenor breach RED", asrSub(r)?.severity === "RED" && r.results[0].status === "REJECTED", `${asrSub(r)?.severity}/${r.results[0].status}`);
pair.maxTenorDays = origTenor;

// --- #3: a PENDING (four-eyes-incomplete) sublimit is a hard reject in batch too,
//         NOT an overridable ORANGE exception.
pair.approval = { status: "PENDING", reference: "X", requestedBy: "u_a", requestedByName: "A", requestedAt: "2026-01-01T00:00:00Z" };
r = batchOf([inv("T3")]);
ok("#3 batch RED-rejects a pending sublimit (not ORANGE/overridable)", asrSub(r)?.severity === "RED" && r.results[0].status === "REJECTED", `${asrSub(r)?.severity}/${r.results[0].status}`);
pair.approval = undefined;

// --- #9: entitySwingline resolves the GOVERNING record for the date, not the first
const ENT = "SE_SWL9";
const lapsed: Limit = { id: "LMT-SWINGLINE-S9L", type: "SWINGLINE", cdl: "90000009", entityType: "SELLER", entityId: ENT, programId: "PRG001", currency: "USD", approvedLimit: 3_000_000, maxTenorDays: 90, effectiveDate: "2026-01-01", expiryDate: "2026-06-01", status: "ACTIVE", warnThreshold: 0.85, exceptionThreshold: 1 };
const future: Limit = { id: "LMT-SWINGLINE-S9F", type: "SWINGLINE", cdl: "90000009", entityType: "SELLER", entityId: ENT, programId: "PRG001", currency: "USD", approvedLimit: 8_000_000, maxTenorDays: 90, effectiveDate: "2026-12-01", expiryDate: "2027-12-01", status: "ACTIVE", warnThreshold: 0.85, exceptionThreshold: 1 };
store.limits.push(lapsed, future);
ok("#9 entitySwingline picks the already-effective governing record for the date", entitySwingline("SELLER", ENT, "2026-07-15")?.id === lapsed.id, entitySwingline("SELLER", ENT, "2026-07-15")?.id);
store.limits = store.limits.filter((l) => l.id !== lapsed.id && l.id !== future.id);

// --- #7: accrued revenue no longer collapses to 0 when +/- deals net contracted~0
const dealA: RevDeal = { source: "BOOKED", id: "A", sellerId: "S", obligorId: "O", productType: "DTR", coverage: 1, revenue: 100, skimRevenue: 0, fundingBasisRevenue: 0, marginSkimRevenue: 0, insurerSkimRevenue: 0, customerDiscount: 0, valueDate: "2026-06-01", maturityDate: "2026-06-11", tenorDays: 10, marginPct: 0 };
const dealB: RevDeal = { source: "BOOKED", id: "B", sellerId: "S", obligorId: "O", productType: "DTR", coverage: 1, revenue: -100, skimRevenue: 0, fundingBasisRevenue: 0, marginSkimRevenue: 0, insurerSkimRevenue: 0, customerDiscount: 0, valueDate: "2026-06-01", maturityDate: "2026-09-09", tenorDays: 100, marginPct: 0 };
const acc = accruedRevenue([dealA, dealB], "2026-06-11"); // A fully elapsed (+100), B 10/100 (-10)
ok("#7 accrued reflects earned income, not clamped to 0", Math.round(acc.accrued) === 90, `accrued=${acc.accrued} contracted=${acc.contracted}`);

// --- Booked-transaction fixtures for #6 -----------------------------------------
const bSeller = store.sellers.find((x) => findLimit("SELLER", x.id))!;
const bObligor = store.obligors.find((x) => findLimit("OBLIGOR", x.id))!;
function booking(id: string, amount: number): BatchResult {
  const iv: InvoiceResult = {
    invoice: { invoiceNumber: id, sellerId: bSeller.id, obligorId: bObligor.id, amount, currency: bSeller.currency, issueDate: "2026-03-01", dueDate: "2026-06-30", requestedDiscountDate: "2026-04-01", coverageAmount: amount, advanceRate: 1, marginBps: 150, productType: "DTR" },
    tenorDays: 90, discountRate: 0.06, discountFee: 0, netProceeds: amount, checks: [], status: "ELIGIBLE", breachAmount: 0,
    funding: { legs: [{ source: "BANK_HOLD", amount }], bankHeld: amount, insuredAmount: 0, uninsuredResidual: amount }, settlementStatus: "PENDING",
  };
  return { batchId: id, sellerId: bSeller.id, uploadedAt: "2026-04-01T00:00:00Z", fileName: "t.csv", makerUserId: "test", summary: {} as never, results: [iv], postBatchLimits: [] };
}

// #6: WRITE_OFF and INSURANCE_CLAIM are mutually exclusive — cannot write off while
// a claim is open, and a PAID claim on an already-settled deal recovers nothing.
materializeBatchBookings(booking("BATCH-6A", 1_000_000), "test");
const t6 = listBookedTransactions().find((t) => t.batchId === "BATCH-6A")!;
t6.insurerAllocations = [{ policyId: "POL-T", insurerName: "T", amount: 800_000 } as never];
markReceivableDefault(t6.id, { reason: "d", workout: "INSURANCE_CLAIM" }, "test");
fileInsuranceClaim(t6.id);
const wo = markReceivableDefault(t6.id, { reason: "d", workout: "WRITE_OFF" }, "test"); // must be refused
ok("#6 cannot write off while a claim is open", wo === undefined && !t6.settledAt);
const paid = decideInsuranceClaim(t6.id, "PAID", "test"); // legitimate recovery path still works
const recovered = (t6.collections ?? []).reduce((s, c) => s + c.amount, 0);
ok("#6 claim still pays out the insured principal on a live default", !!paid && Math.round(recovered) === 800_000, `${recovered}`);
removeBatchBookings("BATCH-6A");

materializeBatchBookings(booking("BATCH-6B", 1_000_000), "test");
const t6b = listBookedTransactions().find((t) => t.batchId === "BATCH-6B")!;
t6b.insurerAllocations = [{ policyId: "POL-T", insurerName: "T", amount: 500_000 } as never];
recordCollection(t6b.id, { amount: 1_000_000, date: "2026-06-30" }, "test"); // fully settle
markReceivableDefault(t6b.id, { reason: "d", workout: "INSURANCE_CLAIM" }, "test"); // refused (settled)
fileInsuranceClaim(t6b.id);
const decided = decideInsuranceClaim(t6b.id, "PAID", "test"); // nothing to recover -> refused
ok("#6 PAID refused when nothing is outstanding (no $0 phantom recovery)", decided === undefined);
removeBatchBookings("BATCH-6B");

// --- re-run HIGH: schedule calendar counts a funded batch invoice ONCE ---------
materializeBatchBookings(booking("BATCH-SCH", 1_000_000), "test");
const bkd = listBookedTransactions().find((t) => t.batchId === "BATCH-SCH")!;
const evs = buildScheduleEvents();
const fundingsForDeal = evs.filter((e) => e.type === "FUNDING" && e.date === bkd.valueDate && e.sellerId === bkd.sellerId && e.obligorId === bkd.obligorId && Math.round(e.amount) === Math.round(bkd.amount));
ok("re-run: funded batch invoice yields ONE funding event (no batch/ledger double-count)", fundingsForDeal.length === 1, `count=${fundingsForDeal.length}`);
ok("re-run: no schedule event keyed off the raw invoice number (batch loop removed)", !evs.some((e) => e.refId === "BATCH-SCH"));
removeBatchBookings("BATCH-SCH");

// --- re-run LOW: evaluator function dispatch cannot resolve inherited members ---
ok("re-run: constructor(1) is not a callable function (no prototype dispatch)", !!evaluateExpression("constructor(1)", {}).error);
ok("re-run: hasOwnProperty(1) is not callable", !!evaluateExpression("hasOwnProperty(1)", {}).error);
ok("re-run: real function min(2,5) still evaluates", evaluateExpression("min(2, 5)", {}).value === 2);

resetExposure();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail) process.exit(1);
