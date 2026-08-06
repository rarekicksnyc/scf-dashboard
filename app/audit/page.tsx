import { getAuditLog, verifyAuditChain } from "@/lib/data/store";
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
  const chain = verifyAuditChain();

  return (
    <>
      <h1 className="page-title">Audit Log</h1>
      <p className="page-sub">
        Every state-changing action — sign-ins, uploads, exception decisions,
        re-runs, and payment-file generation — with actor and timestamp.
      </p>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", marginBottom: 12, borderRadius: 8, fontSize: 12, fontWeight: 600,
        background: chain.ok ? "rgba(22,120,60,0.10)" : "rgba(179,23,29,0.10)",
        border: `1px solid ${chain.ok ? "var(--green)" : "var(--red)"}`,
        color: chain.ok ? "var(--green)" : "var(--red)" }}>
        {chain.ok
          ? `✓ Tamper-evident chain intact · ${chain.total} entries verified`
          : `⚠ Audit chain broken at entry ${chain.brokenAtId ?? "?"} — the log may have been altered`}
      </div>

      {log.length === 0 ? (
        <div className="panel"><div style={{ padding: 18 }} className="muted">No activity recorded yet.</div></div>
      ) : (
        <AuditTable rows={log.map((a) => ({ id: a.id, time: ts(a.timestamp), actorName: a.actorName, action: a.action, entityType: a.entityType, entityId: a.entityId, detail: a.detail }))} />
      )}
    </>
  );
}
