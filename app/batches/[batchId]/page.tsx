import Link from "next/link";
import { notFound } from "next/navigation";
import { getBatch, getSeller, getObligor } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm, pct, SETTLEMENT_LABEL } from "@/lib/format";
import { StatusBadge, CheckPill, UtilBar } from "../../components";
import BatchActions from "./BatchActions";
import type { CheckResult, InvoiceResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHECK_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "SELLER_LIMIT_CHECK", label: "Seller" },
  { key: "ASR_LIMIT_CHECK", label: "ASR" },
  { key: "OBLIGOR_LIMIT_CHECK", label: "Obligor" },
  { key: "SWINGLINE_LIMIT_CHECK", label: "Swingline" },
  { key: "MAX_TENOR_CHECK", label: "Tenor" },
];

function cellFor(r: InvoiceResult, key: string) {
  const c = r.checks.find((x) => x.checkName === key);
  if (!c) return <span className="muted">—</span>;
  const short =
    c.severity === "GREEN"
      ? "Pass"
      : c.severity === "YELLOW"
        ? "Warn"
        : c.severity === "ORANGE"
          ? "Exc"
          : "Fail";
  return <CheckPill severity={c.severity} text={short} />;
}

function primaryReason(r: InvoiceResult): string {
  const blocking = r.checks.find(
    (c: CheckResult) => c.severity === "RED" || c.severity === "ORANGE",
  );
  const warn = r.checks.find((c) => c.severity === "YELLOW");
  return blocking?.message ?? warn?.message ?? "All checks passed.";
}

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const batch = getBatch(batchId);
  if (!batch) notFound();

  const seller = getSeller(batch.sellerId);
  const s = batch.summary;
  const fundedInvoices = batch.results.filter((r) => r.funding);
  const canPayment = await currentUserCan("GENERATE_PAYMENT_FILE");

  const cards = [
    { label: "Invoices", value: String(s.totalCount) },
    { label: "Eligible", value: `${s.eligibleCount + s.warningCount}`, sub: mm(s.eligibleAmount) },
    { label: "Exception", value: `${s.exceptionCount}`, sub: mm(s.exceptionAmount) },
    { label: "Rejected", value: `${s.rejectedCount}`, sub: mm(s.rejectedAmount) },
    { label: "Requested", value: mm(s.totalRequested) },
  ];

  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <Link href="/batches" className="muted" style={{ fontSize: 13 }}>
          ← Batches
        </Link>
      </div>
      <h1 className="page-title">{batch.batchId}</h1>
      <p className="page-sub">
        {seller?.name ?? batch.sellerId}
        {seller ? ` · ASR ${seller.asrRating}` : ""} · {batch.fileName}
      </p>

      <BatchActions batchId={batch.batchId} canPayment={canPayment} />

      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value small">{c.value}</div>
            {c.sub && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Post-batch limit impact</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Limit</th>
                <th className="num">Approved</th>
                <th className="num">Consumed after batch</th>
                <th className="num">Available after batch</th>
                <th className="num">Utilization</th>
                <th style={{ width: 130 }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {batch.postBatchLimits.map((v) => {
                const name =
                  v.limit.entityType === "OBLIGOR"
                    ? (getObligor(v.limit.entityId)?.name ?? v.limit.entityId)
                    : v.limit.entityId;
                return (
                  <tr key={v.limit.id}>
                    <td>
                      <span className="badge grey">{v.limit.type}</span> {name}
                    </td>
                    <td className="num">{mm(v.approvedLimit)}</td>
                    <td className="num">{mm(v.consumed)}</td>
                    <td className="num">{mm(v.available)}</td>
                    <td className="num">{pct(v.utilizationPct)}</td>
                    <td>
                      <UtilBar view={v} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Invoice eligibility results</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Obligor</th>
                <th>PCG S/O</th>
                <th className="num">Amount</th>
                <th className="num">Tenor</th>
                {CHECK_COLUMNS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {batch.results.map((r, i) => {
                const obligor = getObligor(r.invoice.obligorId);
                return (
                  <tr key={`${r.invoice.invoiceNumber}-${i}`}>
                    <td>{r.invoice.invoiceNumber}</td>
                    <td>{obligor?.name ?? r.invoice.obligorId}</td>
                    <td className="muted">
                      {(r.invoice.sellerPcg ?? "—")} / {(r.invoice.obligorPcg ?? "—")}
                    </td>
                    <td className="num">{mm(r.invoice.amount)}</td>
                    <td className="num">{r.tenorDays}d</td>
                    {CHECK_COLUMNS.map((c) => (
                      <td key={c.key}>{cellFor(r, c.key)}</td>
                    ))}
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td
                      className="muted"
                      style={{ whiteSpace: "normal", minWidth: 220 }}
                    >
                      {primaryReason(r)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Funding allocation — eligible invoices</h2>
        {fundedInvoices.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No invoices were funded in this batch.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th className="num">Amount</th>
                  <th>Investor takeout</th>
                  <th className="num">Bank hold</th>
                  <th>Insurance</th>
                  <th className="num">Insured</th>
                  <th className="num">Uninsured residual</th>
                  <th>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {fundedInvoices.map((r, i) => {
                  const f = r.funding!;
                  const investorLegs = f.legs.filter(
                    (l) => l.source === "INVESTOR",
                  );
                  return (
                    <tr key={`${r.invoice.invoiceNumber}-fund-${i}`}>
                      <td>{r.invoice.invoiceNumber}</td>
                      <td className="num">{mm(r.invoice.amount)}</td>
                      <td>
                        {investorLegs.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          investorLegs
                            .map((l) => `${l.sourceName}: ${mm(l.amount)}`)
                            .join(" · ")
                        )}
                      </td>
                      <td className="num">{mm(f.bankHeld)}</td>
                      <td className="muted">{f.policyName ?? "—"}</td>
                      <td className="num">
                        {f.insuredAmount > 0 ? mm(f.insuredAmount) : "—"}
                      </td>
                      <td className="num">{mm(f.uninsuredResidual)}</td>
                      <td>
                        <span className="badge grey">
                          {SETTLEMENT_LABEL[r.settlementStatus]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
