import {
  store, addLimit, addSeller, addObligor, findLimit,
  addSellerObligorLimit, approveSublimit, rejectSublimit, sublimitApproved,
  materializeBatchBookings, listBookedTransactions, removeBatchBookings, recordCollection,
  markReceivableDefault, fileInsuranceClaim, decideInsuranceClaim,
} from "@/lib/data/store";
import { evaluateExpression, validateExpression } from "@/lib/creator/expr";
import { receivableStatus } from "@/lib/receivables";
import type { BatchResult, InvoiceResult, Limit } from "@/lib/types";

let fail = 0;
const ok = (n: string, c: boolean, extra = "") => { console.log((c ? "  ok  " : "FAIL  ") + n + (c ? "" : "  " + extra)); if (!c) fail++; };

console.log("Audit remediation regressions\n");

// --- audit#4: entity creation mints a PENDING limit (no capacity till approved)
const s = addSeller({ name: "T Seller", cdl: "90000001", creditLimit: 25_000_000, maxTenorDays: 90, expiryDate: "2026-12-31", approval: { reference: "GCARS-T4", requestedBy: "u_a", requestedByName: "A" } });
ok("#4 new seller's master limit is PENDING (findLimit skips it)", findLimit("SELLER", s.id) === undefined);
const sPendLimit = store.limits.find((l) => l.entityId === s.id && l.type === "SELLER")!;
ok("#4 limit exists but unapproved", sPendLimit.approval?.status === "PENDING");
const o = addObligor({ name: "T Obligor", cdl: "90000002", country: "US", masterLimit: 25_000_000, maxTenorDays: 90, expiryDate: "2026-12-31", approval: { reference: "GCARS-T4b", requestedBy: "u_a", requestedByName: "A" } });
ok("#4 new obligor's master limit is PENDING", findLimit("OBLIGOR", o.id) === undefined);

// --- audit#5: limit ids are monotonic and never reused after a delete
const a = addLimit({ type: "SELLER", cdl: "90000003", entityType: "SELLER", entityId: "SE_X1", approvedLimit: 1, maxTenorDays: 90, expiryDate: "2026-12-31" });
const bId = a.id;
// delete it, then mint another — the freed id must not be handed out again
store.limits = store.limits.filter((l) => l.id !== a.id);
const c = addLimit({ type: "SELLER", cdl: "90000004", entityType: "SELLER", entityId: "SE_X2", approvedLimit: 1, maxTenorDays: 90, expiryDate: "2026-12-31" });
ok("#5 deleted limit id is not reused", c.id !== bId);
const seqOf = (id: string) => Number(id.split("-").pop());
ok("#5 new id strictly greater (monotonic counter)", seqOf(c.id) > seqOf(bId), `${bId} -> ${c.id}`);
store.limits = store.limits.filter((l) => l.id !== c.id);

// --- audit#6: re-requesting a LIVE sublimit stages the change; live value stays
const S = "SELLER_T6", O = "OBL_T6";
addSellerObligorLimit(S, O, 10_000_000, 90, { reference: "R1", requestedBy: "u_a", requestedByName: "A" });
approveSublimit(S, O, "u_b", "B"); // first approval -> live at 10MM
let sol = store.sellerObligorLimits.find((x) => x.sellerId === S && x.obligorId === O)!;
ok("#6 sublimit live at 10MM after first approval", sublimitApproved(sol) && sol.approvedLimit === 10_000_000);
addSellerObligorLimit(S, O, 20_000_000, 120, { reference: "R2", requestedBy: "u_a", requestedByName: "A" }); // re-request higher
sol = store.sellerObligorLimits.find((x) => x.sellerId === S && x.obligorId === O)!;
ok("#6 live value UNCHANGED while edit pending (not overwritten)", sol.approvedLimit === 10_000_000);
ok("#6 change is staged in pendingEdit", sol.pendingEdit?.approvedLimit === 20_000_000);
approveSublimit(S, O, "u_b", "B"); // commit the staged edit
sol = store.sellerObligorLimits.find((x) => x.sellerId === S && x.obligorId === O)!;
ok("#6 approving staged edit commits new value", sol.approvedLimit === 20_000_000 && sol.maxTenorDays === 120 && !sol.pendingEdit);
addSellerObligorLimit(S, O, 30_000_000, 90, { reference: "R3", requestedBy: "u_a", requestedByName: "A" });
rejectSublimit(S, O, "u_b"); // reject the edit — live value must survive
sol = store.sellerObligorLimits.find((x) => x.sellerId === S && x.obligorId === O)!;
ok("#6 rejecting staged edit KEEPS the live sublimit at 20MM", !!sol && sol.approvedLimit === 20_000_000 && !sol.pendingEdit);
store.sellerObligorLimits = store.sellerObligorLimits.filter((x) => x.sellerId !== S);

// --- audit#8: findLimit prefers an already-effective limit over a future one
const ENT = "SE_T8";
const lapsed: Limit = { id: "LMT-SELLER-T8L", type: "SELLER", cdl: "90000008", entityType: "SELLER", entityId: ENT, programId: "PRG001", currency: "USD", approvedLimit: 5_000_000, maxTenorDays: 90, effectiveDate: "2026-01-01", expiryDate: "2026-06-01", status: "ACTIVE", warnThreshold: 0.85, exceptionThreshold: 1 };
const future: Limit = { id: "LMT-SELLER-T8F", type: "SELLER", cdl: "90000008", entityType: "SELLER", entityId: ENT, programId: "PRG001", currency: "USD", approvedLimit: 9_000_000, maxTenorDays: 90, effectiveDate: "2026-12-01", expiryDate: "2027-12-01", status: "ACTIVE", warnThreshold: 0.85, exceptionThreshold: 1 };
store.limits.push(lapsed, future);
const gov = findLimit("SELLER", ENT, "2026-07-15");
ok("#8 not-yet-effective limit does not govern (already-effective preferred)", gov?.id === lapsed.id, `${gov?.id}`);
store.limits = store.limits.filter((l) => l.id !== lapsed.id && l.id !== future.id);

// --- Booked-transaction fixtures (#13, #14) via a materialised batch ------------
const seller = store.sellers.find((x) => findLimit("SELLER", x.id))!;
const obligor = store.obligors.find((x) => findLimit("OBLIGOR", x.id))!;
function booking(id: string, amount: number): BatchResult {
  const inv: InvoiceResult = {
    invoice: { invoiceNumber: id, sellerId: seller.id, obligorId: obligor.id, amount, currency: seller.currency, issueDate: "2026-03-01", dueDate: "2026-06-30", requestedDiscountDate: "2026-04-01", coverageAmount: amount, advanceRate: 1, marginBps: 150, productType: "DTR" },
    tenorDays: 90, discountRate: 0.06, discountFee: 0, netProceeds: amount,
    checks: [], status: "ELIGIBLE", breachAmount: 0,
    funding: { legs: [{ source: "BANK_HOLD", amount }], bankHeld: amount, insuredAmount: 0, uninsuredResidual: amount },
    settlementStatus: "PENDING",
  };
  return { batchId: id, sellerId: seller.id, uploadedAt: "2026-04-01T00:00:00Z", fileName: "t.csv", makerUserId: "test", summary: {} as never, results: [inv], postBatchLimits: [] };
}

// --- audit#13: an insurance claim can be paid only once (no double-recovery)
materializeBatchBookings(booking("BATCH-T13", 1_000_000), "test");
const t13 = listBookedTransactions().find((t) => t.batchId === "BATCH-T13")!;
t13.insurerAllocations = [{ policyId: "POL-T", insurerName: "T Insurer", amount: 500_000 } as never];
markReceivableDefault(t13.id, { reason: "test", workout: "INSURANCE_CLAIM" }, "test");
fileInsuranceClaim(t13.id);
decideInsuranceClaim(t13.id, "PAID", "test");
const afterFirst = (t13.collections ?? []).reduce((sum, x) => sum + x.amount, 0);
decideInsuranceClaim(t13.id, "PAID", "test"); // second PAID must be a no-op
const afterSecond = (t13.collections ?? []).reduce((sum, x) => sum + x.amount, 0);
ok("#13 first PAID recovers the insured 500k", Math.round(afterFirst) === 500_000, `${afterFirst}`);
ok("#13 second PAID is a no-op (no double-recovery)", Math.round(afterSecond) === Math.round(afterFirst), `${afterSecond}`);
fileInsuranceClaim(t13.id); // re-file over a PAID claim must not reset it
ok("#13 re-file does not reset a paid claim", t13.insuranceClaim?.status === "PAID");
removeBatchBookings("BATCH-T13");

// --- audit#14: a fully-collected (settled) receivable cannot be declared default
materializeBatchBookings(booking("BATCH-T14", 1_000_000), "test");
const t14 = listBookedTransactions().find((t) => t.batchId === "BATCH-T14")!;
recordCollection(t14.id, { amount: 1_000_000, date: "2026-06-30" }, "test"); // settle it
const r = markReceivableDefault(t14.id, { reason: "test", workout: "RECOURSE_TO_SELLER" }, "test");
ok("#14 default refused on a settled receivable", r === undefined && !t14.defaultedAt);
ok("#14 status stays non-DEFAULTED", receivableStatus(t14, "2026-07-15") !== "DEFAULTED", receivableStatus(t14, "2026-07-15"));
removeBatchBookings("BATCH-T14");

// --- audit#16: prototype-chain identifiers cannot leak host members
ok("#16 'constructor' is not a reachable field", !!evaluateExpression("constructor", {}).error);
ok("#16 '__proto__' is not a reachable field", !!evaluateExpression("__proto__", {}).error);
ok("#16 hasOwnProperty is not callable/readable", !!evaluateExpression("hasOwnProperty", {}).error);

// --- audit#17: unknown function names are rejected at validation time
ok("#17 unknown fn rejected by validateExpression", !validateExpression("bogus(x)", ["x"]).ok);
ok("#17 known fn still validates", validateExpression("min(x, 1)", ["x"]).ok);

// Cleanup any test entities from the shared book.
store.sellers = store.sellers.filter((x) => x.id !== s.id);
store.obligors = store.obligors.filter((x) => x.id !== o.id);
store.limits = store.limits.filter((l) => l.entityId !== s.id && l.entityId !== o.id);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail) process.exit(1);
