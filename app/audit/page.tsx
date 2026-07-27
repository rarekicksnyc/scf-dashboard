import { getAuditLog } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import AuditTable from "./AuditTable";

export const dynamic = "force-dynamic";

function ts(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("en-US", {
    year: "numeric",
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
        <div style={{ padding: "12px 14px", background: "#f0f4fa", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--ink-soft)" }}>
          Your role cannot view the audit log. Ask an administrator to grant your
          role View audit on the Roles &amp; access screen.
        </div>
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

      {log.length === 0 ? (
        <div className="panel"><div style={{ padding: 18 }} className="muted">No activity recorded yet.</div></div>
      ) : (
        <AuditTable rows={log.map((a) => ({ id: a.id, time: ts(a.timestamp), actorName: a.actorName, action: a.action, entityType: a.entityType, entityId: a.entityId, detail: a.detail }))} />
      )}
    </>
  );
}
