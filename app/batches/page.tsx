import Link from "next/link";
import { getBatches, getSeller } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm, dateShort } from "@/lib/format";
import UploadPanel from "./UploadPanel";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const batches = getBatches();
  const canUpload = await currentUserCan("UPLOAD_BATCH");

  return (
    <>
      <h1 className="page-title">Batches</h1>
      <p className="page-sub">
        Upload hundreds of invoices at once. Each invoice is checked against
        seller, ASR, obligor, swingline, and tenor limits before funding.
      </p>

      {canUpload ? (
        <UploadPanel />
      ) : (
        <div className="notice err">
          Your current role cannot upload batches. Switch to Operations,
          Relationship Manager, Product Manager, or Administrator.
        </div>
      )}

      <div className="panel">
        <h2>Batch history</h2>
        {batches.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No batches yet — load the sample batch above to see the engine run.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>File</th>
                  <th>Seller</th>
                  <th className="num">Invoices</th>
                  <th className="num">Eligible</th>
                  <th className="num">Exception</th>
                  <th className="num">Rejected</th>
                  <th className="num">Eligible amount</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batchId}>
                    <td>
                      <Link
                        href={`/batches/${b.batchId}`}
                        style={{ color: "var(--brand)", fontWeight: 600 }}
                      >
                        {b.batchId}
                      </Link>
                    </td>
                    <td className="muted">{b.fileName}</td>
                    <td>{getSeller(b.sellerId)?.name ?? b.sellerId}</td>
                    <td className="num">{b.summary.totalCount}</td>
                    <td className="num">
                      {b.summary.eligibleCount + b.summary.warningCount}
                    </td>
                    <td className="num">{b.summary.exceptionCount}</td>
                    <td className="num">{b.summary.rejectedCount}</td>
                    <td className="num">{mm(b.summary.eligibleAmount)}</td>
                    <td>{dateShort(b.uploadedAt)}</td>
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
