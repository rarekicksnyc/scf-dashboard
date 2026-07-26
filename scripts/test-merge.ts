import { store, viewLimit, findLimit, materializeBatchBookings, removeBatchBookings, recordCollection, listBookedTransactions } from "@/lib/data/store";
import { allRevenueDeals, revenueSummary } from "@/lib/revenue";
import type { BatchResult, InvoiceResult } from "@/lib/types";

let fail = 0;
const ok = (n: string, c: boolean, extra = "") => { console.log((c ? "  ok  " : "FAIL  ") + n + (c ? "" : "  " + extra)); if (!c) fail++; };

// Pick a seller + obligor that both have active limits so exposure is visible.
const seller = store.sellers.find((s) => findLimit("SELLER", s.id))!;
const obligor = store.obligors.find((o) => findLimit("OBLIGOR", o.id))!;
const sLimit = findLimit("SELLER", seller.id)!;
const oLimit = findLimit("OBLIGOR", obligor.id)!;

const before = viewLimit(sLimit).consumed;
const oBefore = viewLimit(oLimit).consumed;

// Build a one-invoice funded batch.
const inv: InvoiceResult = {
  invoice: {
    invoiceNumber: "MERGE-1", sellerId: seller.id, obligorId: obligor.id, amount: 5_000_000,
    currency: seller.currency, issueDate: "2026-03-01", dueDate: "2026-06-30", requestedDiscountDate: "2026-04-01",
    coverageAmount: 5_000_000, advanceRate: 1, marginBps: 150, productType: "DTR",
  },
  tenorDays: 90, discountRate: 0.06, discountFee: 75000, netProceeds: 4_925_000,
  checks: [], status: "ELIGIBLE", breachAmount: 0,
  funding: { legs: [{ source: "BANK_HOLD", amount: 5_000_000 }], bankHeld: 5_000_000, insuredAmount: 0, uninsuredResidual: 5_000_000 },
  settlementStatus: "PENDING",
};
const batch: BatchResult = {
  batchId: "BATCH-MERGE-TEST", sellerId: seller.id, uploadedAt: "2026-04-01T00:00:00Z",
  fileName: "merge.csv", makerUserId: "test", summary: {} as never, results: [inv], postBatchLimits: [],
};

console.log("Single-ledger merge + exposure + revenue");

// 1. Materialise → one booked transaction, exposure rises by the coverage.
materializeBatchBookings(batch, "test");
const mat = listBookedTransactions().filter((t) => t.batchId === "BATCH-MERGE-TEST");
ok("one booked transaction materialised", mat.length === 1);
ok("seller exposure +5MM", Math.round(viewLimit(sLimit).consumed - before) === 5_000_000, `${viewLimit(sLimit).consumed - before}`);
ok("obligor exposure +5MM", Math.round(viewLimit(oLimit).consumed - oBefore) === 5_000_000);

// 2. Idempotent re-materialise (re-run) does not double count.
materializeBatchBookings(batch, "test");
ok("re-run does not double count", Math.round(viewLimit(sLimit).consumed - before) === 5_000_000, `${viewLimit(sLimit).consumed - before}`);
ok("still one booked transaction", listBookedTransactions().filter((t) => t.batchId === "BATCH-MERGE-TEST").length === 1);

// 3. Revenue reads the single ledger — margin only (150bps on 5MM over 90d ≈ 18,750).
// (Re-fetch: the re-run above replaced the booked-transaction id.)
const cur = listBookedTransactions().find((t) => t.batchId === "BATCH-MERGE-TEST")!;
const deals = allRevenueDeals();
const mine = deals.find((d) => d.id === cur.id)!;
ok("revenue deal present from ledger", !!mine);
ok("margin-only revenue ≈ 18,750", Math.abs(mine.revenue - 5_000_000 * 0.015 * 90 / 360) < 1, `${mine.revenue}`);
ok("batch source tagged", mine.source === "BATCH");

// 4. Partial collection reduces exposure proportionally.
recordCollection(cur.id, { amount: 2_000_000, date: "2026-06-30" }, "test");
ok("seller exposure drops to +3MM after 2MM collected", Math.round(viewLimit(sLimit).consumed - before) === 3_000_000, `${viewLimit(sLimit).consumed - before}`);

// 5. Full collection settles → exposure returns to baseline.
recordCollection(cur.id, { amount: 3_000_000, date: "2026-06-30" }, "test");
ok("seller exposure back to baseline after full collection", Math.round(viewLimit(sLimit).consumed - before) === 0, `${viewLimit(sLimit).consumed - before}`);
ok("receivable marked settled", !!listBookedTransactions().find((t) => t.id === cur.id)?.settledAt);

// Cleanup.
removeBatchBookings("BATCH-MERGE-TEST");
ok("cleanup removes the test bookings", listBookedTransactions().filter((t) => t.batchId === "BATCH-MERGE-TEST").length === 0);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail) process.exit(1);
