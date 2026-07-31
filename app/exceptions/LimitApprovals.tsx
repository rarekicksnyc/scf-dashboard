"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mm } from "@/lib/format";

interface Pending {
  id: string; type: string; entityType: string; entityId: string; entityName?: string;
  approvedLimit: number; maxTenorDays: number; expiryDate: string;
  reference?: string; requestedByName?: string; requestedAt?: string;
}

// Four-eyes queue for new limits. A limit created via Data management is PENDING
// and grants no capacity until a DIFFERENT authorized user approves it here.
export default function LimitApprovals({ canApprove }: { canApprove: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/limit-approvals", { cache: "no-store" });
    if (res.ok) setPending((await res.json()).pending ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    setErr(null);
    const res = await fetch("/api/limit-approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Action failed."); return; }
    await load();
    router.refresh();
  }

  return (
    <div className="panel">
      <h2>Limit approvals ({pending.length}) <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· four-eyes</span></h2>
      <div className="page-sub" style={{ padding: "0 16px" }}>
        New limits added in Data management require a GCARS/approval reference and a second approver before they grant any capacity. You cannot approve a limit you requested.
      </div>
      {err && <div className="notice err" style={{ margin: "0 16px" }}>{err}</div>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Limit</th><th>Entity</th><th className="num">Amount</th><th className="num">Tenor</th><th>Expiry</th><th>Reference</th><th>Requested by</th>{canApprove && <th></th>}</tr></thead>
          <tbody>
            {pending.length === 0 ? (
              <tr><td colSpan={canApprove ? 8 : 7} className="muted" style={{ padding: 14 }}>No limits awaiting approval.</td></tr>
            ) : pending.map((p) => (
              <tr key={p.id}>
                <td>{p.type}</td>
                <td>{p.entityName ?? p.entityId}</td>
                <td className="num">{mm(p.approvedLimit)}</td>
                <td className="num">{p.maxTenorDays}d</td>
                <td>{p.expiryDate}</td>
                <td><code style={{ fontSize: 12 }}>{p.reference}</code></td>
                <td className="muted">{p.requestedByName}</td>
                {canApprove && (
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} type="button" onClick={() => act(p.id, "approve")}>Approve</button>
                    <button className="btn secondary" style={{ padding: "4px 9px", fontSize: 12, marginLeft: 6, borderColor: "var(--red)", color: "var(--red)" }} type="button" onClick={() => act(p.id, "reject")}>Reject</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
