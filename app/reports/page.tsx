import { REPORTS } from "@/lib/reports";
import { getBatches, allSellers, allObligors, getSeller, getObligor, listTemplateFields } from "@/lib/data/store";
import { fundedDeals } from "@/lib/deals";
import { entityExposures } from "@/lib/exposure";
import { currentUserCan } from "@/lib/auth";
import TransactionReport, { type TxnRow } from "./TransactionReport";
import ExposureSummary from "./ExposureSummary";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  if (!(await currentUserCan("VIEW_REPORTS"))) {
    return (
      <>
        <h1 className="page-title">Reports</h1>
        <div style={{ padding: "12px 14px", background: "#f0f4fa", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--ink-soft)" }}>
          Reports are limited to the Portfolio Manager and Administrator roles. Ask an
          administrator to grant your role View reports on the Roles &amp; access screen.
        </div>
      </>
    );
  }

  const canPayment = await currentUserCan("GENERATE_PAYMENT_FILE");
  const batches = getBatches();

  const txnRows: TxnRow[] = fundedDeals({}).map((d) => ({
    ...d,
    sellerName: getSeller(d.sellerId)?.name ?? d.sellerId,
    obligorName: getObligor(d.obligorId)?.name ?? d.obligorId,
  }));

  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">
        Portfolio and control reports, exported as CSV from live data.
      </p>

      <TransactionReport
        deals={txnRows}
        sellers={allSellers().map((s) => ({ id: s.id, name: s.name }))}
        obligors={allObligors().map((o) => ({ id: o.id, name: o.name }))}
        templateFields={listTemplateFields("REPORT_TRANSACTIONS")}
      />

      <ExposureSummary rows={entityExposures()} />

      <div className="panel">
        <h2>Standard reports</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Description</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              {REPORTS.map((r) => (
                <tr key={r.key}>
                  <td style={{ fontWeight: 600 }}>{r.title}</td>
                  <td className="muted">{r.description}</td>
                  <td>
                    <a className="btn secondary" href={`/api/reports/${r.key}`}>
                      Download CSV
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Payment / settlement files</h2>
        {!canPayment ? (
          <div style={{ padding: 18 }} className="muted">
            Your role cannot generate payment files (requires Operations or
            Administrator).
          </div>
        ) : batches.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No batches yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th className="num">Funded invoices</th>
                  <th className="num">Eligible amount</th>
                  <th>Payment file</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batchId}>
                    <td>{b.batchId}</td>
                    <td className="num">
                      {b.results.filter((r) => r.funding).length}
                    </td>
                    <td className="num">
                      {(b.summary.eligibleAmount / 1_000_000).toFixed(1)}MM
                    </td>
                    <td>
                      <a
                        className="btn secondary"
                        href={`/api/batches/${b.batchId}/payment-file`}
                      >
                        Generate payment file
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
