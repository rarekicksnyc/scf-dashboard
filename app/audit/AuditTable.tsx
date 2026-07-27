"use client";

import { useMemo, useState } from "react";

export interface AuditRow {
  id: string;
  time: string; // pre-formatted (with year)
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
}

// The audit trail with client-side filters — search text (actor/action/entity/
// detail) plus actor and action dropdowns — so "who changed limit X" is one
// filter, not a scroll. Filtering only narrows what is shown; it removes nothing.
export default function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  const actors = useMemo(() => [...new Set(rows.map((r) => r.actorName))].sort(), [rows]);
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (actor && r.actorName !== actor) return false;
      if (action && r.action !== action) return false;
      if (needle && !`${r.actorName} ${r.action} ${r.entityType} ${r.entityId} ${r.detail}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, actor, action]);

  const sel: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };

  return (
    <div className="panel">
      <h2>Activity ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""})</h2>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor, action, entity, or detail…" style={{ ...sel, minWidth: 260 }} />
        <select value={actor} onChange={(e) => setActor(e.target.value)} style={sel}><option value="">All actors</option>{actors.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={sel}><option value="">All actions</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        {(q || actor || action) && <button className="btn secondary" style={{ fontSize: 12 }} type="button" onClick={() => { setQ(""); setActor(""); setAction(""); }}>Clear</button>}
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>No matching activity.</td></tr>
            ) : filtered.map((a) => (
              <tr key={a.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{a.time}</td>
                <td>{a.actorName}</td>
                <td><span className="badge grey">{a.action}</span></td>
                <td className="muted">{a.entityType} {a.entityId}</td>
                <td style={{ whiteSpace: "normal", minWidth: 260 }}>{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
