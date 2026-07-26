import { portfolioMetrics, agingSummary, liveReceivables } from "@/lib/portfolio";
import { allSellers } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { usd } from "@/lib/format";
import ReceivablesBook, { type RecRow, type Metrics, type AgingRow } from "./ReceivablesBook";

export const dynamic = "force-dynamic";

// The live receivables book — every outstanding funded receivable (Transaction
// Flow bookings and materialised batch invoices, one ledger), with settlement,
// aging, concentration, and client invoicing. This is where a deal's life after
// booking is managed: collections, overdue, default, claims, investor settlement.
export default async function ReceivablesPage() {
  const asOf = new Date().toISOString().slice(0, 10);
  const m = portfolioMetrics(asOf);
  const canManage = await currentUserCan("CHANGE_LIMIT");

  const metrics: Metrics = {
    totalOutstanding: m.totalOutstanding,
    overdueOutstanding: m.overdueOutstanding,
    overduePct: m.overduePct,
    defaultedOutstanding: m.defaultedOutstanding,
    liveCount: m.liveCount,
    overdueCount: m.overdueCount,
    weightedAvgTenor: m.weightedAvgTenor,
    additionalInterestAccrued: m.additionalInterestAccrued,
    additionalInterestIndicative: m.additionalInterestIndicative,
    topObligorPct: m.topObligorPct,
    obligorConcentration: m.obligorConcentration.slice(0, 5),
  };
  const aging: AgingRow[] = agingSummary(asOf);
  const rows: RecRow[] = liveReceivables(asOf, { includeSettled: true }).map((r) => ({
    id: r.txn.id,
    reference: r.txn.reference,
    source: r.txn.source === "BATCH" ? "BATCH" : "BOOKED",
    sellerId: r.txn.sellerId,
    sellerName: r.sellerName,
    obligorName: r.obligorName,
    productType: r.txn.productType,
    amount: r.txn.amount,
    outstanding: r.outstanding,
    collected: r.txn.amount - r.outstanding,
    status: r.status,
    overdueDays: r.overdueDays,
    daysToMaturity: r.daysToMaturity,
    valueDate: r.txn.valueDate,
    maturityDate: r.txn.maturityDate,
    additionalInterest: r.additionalInterest,
    additionalInterestConfirmed: r.additionalInterestConfirmed,
    additionalInterestConfirmedAt: r.txn.additionalInterestConfirmedAt,
    hasInvestor: !!(r.txn.investorAmount && r.txn.investorAmount > 0),
    investorSettled: !!r.txn.investorSettledAt,
    hasInsurer: !!(r.txn.insurerAllocations && r.txn.insurerAllocations.length),
    defaulted: !!r.txn.defaultedAt,
    workout: r.txn.workout,
    claimStatus: r.txn.insuranceClaim?.status,
  }));
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));

  return (
    <>
      <h1 className="page-title">Receivables</h1>
      <p className="page-sub">
        The live book after funding — one ledger of every outstanding receivable.
        Record collections, track overdue and default, file insurance claims,
        settle investor participations, and issue client invoices. Outstanding:{" "}
        {usd(m.totalOutstanding)}; overdue: {usd(m.overdueOutstanding)}.
      </p>
      <ReceivablesBook asOf={asOf} metrics={metrics} aging={aging} rows={rows} sellers={sellers} canManage={canManage} />
    </>
  );
}
