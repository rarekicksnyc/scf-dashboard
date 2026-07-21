import Link from "next/link";
import { getExceptions, getObligor } from "@/lib/data/store";
import { getCurrentUser, getUserById, roleHas } from "@/lib/auth";
import { mm } from "@/lib/format";
import ExceptionDecision from "./ExceptionDecision";
import type { ExceptionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ExceptionStatus, string> = {
  OPEN: "orange",
  APPROVED: "green",
  REJECTED: "red",
};

export default async function ExceptionsPage() {
  const exceptions = getExceptions();
  const user = await getCurrentUser();
  const canApprove = roleHas(user.role, "APPROVE_EXCEPTION");

  const open = exceptions.filter((e) => e.status === "OPEN");

  return (
    <>
      <h1 className="page-title">Exception Queue</h1>
      <p className="page-sub">
        Invoices that breached a limit and require a credit decision. Maker-checker
        is enforced: a checker with approval rights, who is not the batch&rsquo;s
        maker, decides. Approved exceptions fund on the next re-run of the batch.
      </p>

      {canApprove ? (
        <div className="notice ok">
          You are acting as {user.name} and can approve exceptions on batches you
          did not submit.
        </div>
      ) : (
        <div className="notice err">
          You are acting as {user.name}. This role cannot approve exceptions —
          switch to a Credit Officer, Risk Manager, or Product Manager.
        </div>
      )}

      <div className="panel">
        <h2>Open exceptions ({open.length})</h2>
        {exceptions.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No exceptions yet. Upload the sample batch to generate some.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Exception</th>
                  <th>Batch</th>
                  <th>Invoice</th>
                  <th>Obligor</th>
                  <th className="num">Amount</th>
                  <th>Control</th>
                  <th>Reason</th>
                  <th className="num">Breach</th>
                  <th>Status</th>
                  <th>Maker</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((e) => {
                  const isMaker = e.makerUserId === user.id;
                  const showActions = e.status === "OPEN" && canApprove && !isMaker;
                  return (
                    <tr key={e.id}>
                      <td>{e.id}</td>
                      <td>
                        <Link
                          href={`/batches/${e.batchId}`}
                          style={{ color: "var(--brand)", fontWeight: 600 }}
                        >
                          {e.batchId}
                        </Link>
                      </td>
                      <td>{e.invoiceNumber}</td>
                      <td>{getObligor(e.obligorId)?.name ?? e.obligorId}</td>
                      <td className="num">{mm(e.amount)}</td>
                      <td className="muted">{e.checkName.replace("_CHECK", "")}</td>
                      <td className="muted" style={{ whiteSpace: "normal", minWidth: 200 }}>
                        {e.reason}
                      </td>
                      <td className="num">
                        {e.breachAmount > 0 ? mm(e.breachAmount) : "—"}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[e.status]}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="muted">{getUserById(e.makerUserId).name}</td>
                      <td>
                        {showActions ? (
                          <ExceptionDecision id={e.id} />
                        ) : e.status !== "OPEN" ? (
                          <span className="muted">
                            {e.status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
                            {e.decidedByName}
                          </span>
                        ) : isMaker ? (
                          <span className="muted">Your batch (cannot self-approve)</span>
                        ) : (
                          <span className="muted">No approval rights</span>
                        )}
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
