import { getAuditLog } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";

export const dynamic = "force-dynamic";

function ts(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AuditPage() {
  if (!(await currentUserCan("VIEW_AUDIT"))) {
    return (
      <>
        <h1 className="page-title">Audit Log</h1>
        <div className="notice err">Your role cannot view the audit log.</div>
      </>
    );
  }

  const log = getAuditLog();

  return (
    <>
      <h1 className="page-title">Audit Log</h1>
      <p className="page-sub">
        Every state-changing action — uploads, exception decisions, re-runs, and
        payment-file generation — with actor and timestamp.
      </p>

      <div className="panel">
        <h2>Activity ({log.length})</h2>
        {log.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No activity recorded yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((a) => (
                  <tr key={a.id}>
                    <td className="muted">{ts(a.timestamp)}</td>
                    <td>{a.actorName}</td>
                    <td>
                      <span className="badge grey">{a.action}</span>
                    </td>
                    <td className="muted">
                      {a.entityType} {a.entityId}
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: 260 }}>
                      {a.detail}
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
