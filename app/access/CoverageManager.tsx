"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input } from "@/lib/ui";

interface Opt { id: string; name: string }
interface Cov { id: string; userId: string; entityType: "SELLER" | "OBLIGOR"; entityId: string }

// Assign seller/obligor coverage to each user. Coverage routes notifications
// (maturities, reservations, expiring limits, exceptions). Multiple users can
// cover the same entity for out-of-office backup.
export default function CoverageManager({
  users, sellers, obligors, coverage,
}: { users: { id: string; name: string; roleLabel: string }[]; sellers: Opt[]; obligors: Opt[]; coverage: Cov[] }) {
  const router = useRouter();
  const sellerName = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
  const obligorName = useMemo(() => new Map(obligors.map((o) => [o.id, o.name])), [obligors]);

  async function add(userId: string, entityType: "SELLER" | "OBLIGOR", entityId: string) {
    if (!entityId) return;
    await fetch("/api/coverage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, entityType, entityId }) });
    router.refresh();
  }
  async function remove(id: string) { await fetch("/api/coverage", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); router.refresh(); }

  return (
    <div className="panel">
      <h2>Coverage</h2>
      <p className="page-sub" style={{ padding: "0 16px" }}>
        Assign sellers and obligors to each user. Notifications for an entity go to everyone covering it — assign two or more for out-of-office backup.
      </p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>User</th><th>Covers</th><th>Add coverage</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const mine = coverage.filter((c) => c.userId === u.id);
              return (
                <tr key={u.id}>
                  <td style={{ whiteSpace: "nowrap" }}><strong>{u.name}</strong><div className="muted" style={{ fontSize: 11 }}>{u.roleLabel}</div></td>
                  <td>
                    {mine.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>—</span> : (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {mine.map((c) => (
                          <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 8px", borderRadius: 12, border: "1px solid var(--border)", background: c.entityType === "SELLER" ? "rgba(0,120,80,0.08)" : "rgba(180,110,0,0.08)" }}>
                            {c.entityType === "SELLER" ? "S" : "O"}: {(c.entityType === "SELLER" ? sellerName : obligorName).get(c.entityId) ?? c.entityId}
                            <button type="button" onClick={() => remove(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 12, padding: 0 }}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td><AddRow onAdd={(t, e) => add(u.id, t, e)} sellers={sellers} obligors={obligors} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddRow({ onAdd, sellers, obligors }: { onAdd: (t: "SELLER" | "OBLIGOR", e: string) => void; sellers: Opt[]; obligors: Opt[] }) {
  const [type, setType] = useState<"SELLER" | "OBLIGOR">("SELLER");
  const [entityId, setEntityId] = useState("");
  const opts = type === "SELLER" ? sellers : obligors;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select style={{ ...input, width: 90 }} value={type} onChange={(e) => { setType(e.target.value as "SELLER" | "OBLIGOR"); setEntityId(""); }}><option value="SELLER">Seller</option><option value="OBLIGOR">Obligor</option></select>
      <select style={{ ...input, minWidth: 150 }} value={entityId} onChange={(e) => setEntityId(e.target.value)}><option value="">Choose…</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <button className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }} type="button" disabled={!entityId} onClick={() => { onAdd(type, entityId); setEntityId(""); }}>Add</button>
    </div>
  );
}
