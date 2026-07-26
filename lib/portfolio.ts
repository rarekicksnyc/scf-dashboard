import { listBookedTransactions, getObligor, getSeller } from "@/lib/data/store";
import {
  outstandingPrincipal,
  receivableStatus,
  overdueDays,
  ageBucket,
  additionalInterest,
  type AgeBucket,
} from "@/lib/receivables";
import { daysBetween } from "@/lib/format";
import type { BookedTransaction, ReceivableStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Portfolio monitoring over the single receivables ledger — the live book, its
// aging, weighted days outstanding (a DSO proxy), and obligor / seller
// concentration. Everything derives from the one bookedTransactions ledger, so
// these figures can never disagree with exposure or settlement.
// ---------------------------------------------------------------------------

export interface LiveReceivable {
  txn: BookedTransaction;
  sellerName: string;
  obligorName: string;
  outstanding: number;
  status: ReceivableStatus;
  daysToMaturity: number; // negative once past due
  overdueDays: number;
  bucket: AgeBucket;
  additionalInterest: number; // default interest owed if past due (else 0)
}

// Every receivable on the book with its derived lifecycle fields. Fully settled
// receivables are excluded by default (they carry no outstanding exposure); pass
// includeSettled to see the closed history too.
export function liveReceivables(asOf: string, opts: { includeSettled?: boolean } = {}): LiveReceivable[] {
  const rows: LiveReceivable[] = [];
  for (const t of listBookedTransactions()) {
    const status = receivableStatus(t, asOf);
    if (status === "SETTLED" && !opts.includeSettled) continue;
    rows.push({
      txn: t,
      sellerName: getSeller(t.sellerId)?.name ?? t.sellerId,
      obligorName: getObligor(t.obligorId)?.name ?? t.obligorId,
      outstanding: outstandingPrincipal(t),
      status,
      daysToMaturity: daysBetween(asOf, t.maturityDate),
      overdueDays: overdueDays(t, asOf),
      bucket: ageBucket(t, asOf),
      additionalInterest: additionalInterest(t, asOf).amount,
    });
  }
  // Most urgent first: overdue (most days past due) before current (soonest due).
  return rows.sort((a, b) => b.overdueDays - a.overdueDays || a.daysToMaturity - b.daysToMaturity);
}

export interface AgingRow {
  bucket: AgeBucket;
  count: number;
  outstanding: number;
}

// Outstanding grouped into aging buckets (current / 1–30 / 31–60 / 61–90 / 90+).
export function agingSummary(asOf: string): AgingRow[] {
  const order: AgeBucket[] = ["CURRENT", "D1_30", "D31_60", "D61_90", "D90_PLUS"];
  const map = new Map<AgeBucket, AgingRow>(order.map((b) => [b, { bucket: b, count: 0, outstanding: 0 }]));
  for (const r of liveReceivables(asOf)) {
    const row = map.get(r.bucket)!;
    row.count += 1;
    row.outstanding += r.outstanding;
  }
  return order.map((b) => map.get(b)!);
}

export interface ConcentrationRow {
  id: string;
  name: string;
  outstanding: number;
  pct: number; // share of total outstanding
  count: number;
}

function concentration(asOf: string, dim: "obligor" | "seller"): ConcentrationRow[] {
  const rows = liveReceivables(asOf);
  const total = rows.reduce((a, r) => a + r.outstanding, 0);
  const map = new Map<string, ConcentrationRow>();
  for (const r of rows) {
    const id = dim === "obligor" ? r.txn.obligorId : r.txn.sellerId;
    const name = dim === "obligor" ? r.obligorName : r.sellerName;
    const row = map.get(id) ?? { id, name, outstanding: 0, pct: 0, count: 0 };
    row.outstanding += r.outstanding;
    row.count += 1;
    map.set(id, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, pct: total > 0 ? (r.outstanding / total) * 100 : 0 }))
    .sort((a, b) => b.outstanding - a.outstanding);
}

export interface PortfolioMetrics {
  totalOutstanding: number;
  overdueOutstanding: number;
  overduePct: number;
  defaultedOutstanding: number;
  liveCount: number;
  overdueCount: number;
  weightedAvgTenor: number; // outstanding-weighted average deal tenor, in days
  additionalInterestOwed: number; // total default interest accrued on past-due
  obligorConcentration: ConcentrationRow[];
  sellerConcentration: ConcentrationRow[];
  topObligorPct: number;
}

// Headline portfolio metrics as of a date.
export function portfolioMetrics(asOf: string): PortfolioMetrics {
  const rows = liveReceivables(asOf);
  let totalOutstanding = 0, overdueOutstanding = 0, overdueCount = 0, defaultedOutstanding = 0;
  let tenorWeighted = 0, addlInterest = 0;
  for (const r of rows) {
    totalOutstanding += r.outstanding;
    // Full deal tenor (value → maturity), weighted by outstanding principal.
    const tenor = Math.max(0, daysBetween(r.txn.valueDate, r.txn.maturityDate));
    tenorWeighted += r.outstanding * tenor;
    addlInterest += r.additionalInterest;
    if (r.status === "OVERDUE") { overdueOutstanding += r.outstanding; overdueCount += 1; }
    if (r.status === "DEFAULTED") defaultedOutstanding += r.outstanding;
  }
  const obligorConcentration = concentration(asOf, "obligor");
  return {
    totalOutstanding,
    overdueOutstanding,
    overduePct: totalOutstanding > 0 ? (overdueOutstanding / totalOutstanding) * 100 : 0,
    defaultedOutstanding,
    liveCount: rows.length,
    overdueCount,
    weightedAvgTenor: totalOutstanding > 0 ? Math.round(tenorWeighted / totalOutstanding) : 0,
    additionalInterestOwed: addlInterest,
    obligorConcentration,
    sellerConcentration: concentration(asOf, "seller"),
    topObligorPct: obligorConcentration[0]?.pct ?? 0,
  };
}
