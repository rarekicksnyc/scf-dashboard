import { store, resetExposure, findLimit, getObligor } from "@/lib/data/store";
import { runBatch } from "@/lib/engine";
import type { Invoice } from "@/lib/types";

let fail = 0;
const ok = (n: string, c: boolean, extra = "") => { console.log((c ? "  ok  " : "FAIL  ") + n + (c ? "" : "  " + extra)); if (!c) fail++; };

// Clean slate so the working snapshot starts from full approved limits.
resetExposure();

// Pick a seller/obligor pair on the seller's ASR approved list (so the batch ASR
// sublimit + approved-list gate is satisfied) with an ACTIVE obligor, and cap by
// EVERY binding limit — seller line, obligor line, ASR limit, and the ASR sublimit.
const pair = store.sellerObligorLimits.find((x) => !x.approval && findLimit("SELLER", x.sellerId) && findLimit("OBLIGOR", x.obligorId) && getObligor(x.obligorId)?.status === "ACTIVE")!;
const seller = store.sellers.find((s) => s.id === pair.sellerId)!;
const obligor = getObligor(pair.obligorId)!;
const sLimit = findLimit("SELLER", seller.id)!;
const oLimit = findLimit("OBLIGOR", obligor.id)!;
const asrLimit = findLimit("ASR", seller.id);
const cap = Math.min(sLimit.approvedLimit, oLimit.approvedLimit, pair.approvedLimit, asrLimit?.approvedLimit ?? Infinity);

function inv(n: string, face: number, advance: number): Invoice {
  return {
    invoiceNumber: n, sellerId: seller.id, obligorId: obligor.id, amount: face,
    currency: seller.currency, issueDate: "2026-03-01", dueDate: "2026-06-01", requestedDiscountDate: "2026-03-15",
    advanceRate: advance, productType: "DTR",
  };
}

console.log(`Batch face-vs-coverage — seller ${seller.id} cap ${cap}, obligor ${obligor.id}`);

// One invoice at 85% advance, face = the full smaller limit. Coverage = 0.85*cap.
// The bug consumed the FACE (=cap) and left 0; the fix consumes COVERAGE and
// leaves ~15% headroom, so a second small invoice within that headroom funds.
const face = cap;
const coverage = Math.round(face * 0.85);
const r1 = runBatch([inv("COV-1", face, 0.85)], { batchId: "B-COV", fileName: "c.csv", uploadedAt: "2026-03-15T00:00:00Z", makerUserId: "t" });
const sellerView = r1.postBatchLimits.find((v) => v.limit.id === sLimit.id)!;
ok("seller consumed == coverage (0.85*face), not face", Math.abs(sellerView.consumed - coverage) < 2, `consumed=${sellerView.consumed} coverage=${coverage} face=${face}`);
ok("invoice 1 eligible", r1.results[0].status === "ELIGIBLE" || r1.results[0].status === "ELIGIBLE_WITH_WARNING", r1.results[0].status);

// Second invoice: face ~10% of cap @ 85% → coverage ~8.5%, fits in the ~15% left.
const face2 = Math.round(cap * 0.10);
const r2 = runBatch([inv("COV-1", face, 0.85), inv("COV-2", face2, 0.85)], { batchId: "B-COV", fileName: "c.csv", uploadedAt: "2026-03-15T00:00:00Z", makerUserId: "t" });
ok("second small invoice funds within remaining coverage headroom", r2.results[1].status === "ELIGIBLE" || r2.results[1].status === "ELIGIBLE_WITH_WARNING", r2.results[1].status);

resetExposure();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail) process.exit(1);
