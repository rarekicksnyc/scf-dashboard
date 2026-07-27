"use client";

import { useMemo, useState } from "react";

export interface ExpiryRow {
  flag: string;
  flagLabel: string;
  flagCls: string;
  kind: string;
  ref: string;
  entity: string;
  detail: string;
  expiryDate: string;
  days: string;
}

// The full "all tracked dates" list with client-side filters — search text, a
// type dropdown, and a "flagged only" toggle — so the desk can find one line
// without scrolling the whole book.
export default function ExpirationsTable({ rows }: { rows: ExpiryRow[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const kinds = useMemo(() => [...new Set(rows.map((r) => r.kind))].sort(), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (flaggedOnly && r.flag === "OK") return false;
      if (needle && !`${r.kind} ${r.ref} ${r.entity} ${r.detail}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, kind, flaggedOnly]);

  const sel: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };

  return (
    <div className="panel">
      <h2>All tracked dates ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""})</h2>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, entity, or detail…" style={{ ...sel, minWidth: 260 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={sel}><option value="">All types</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} className="muted"><input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Flagged only</label>
        {(q || kind || flaggedOnly) && <button className="btn secondary" style={{ fontSize: 12 }} type="button" onClick={() => { setQ(""); setKind(""); setFlaggedOnly(false); }}>Clear</button>}
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Flag</th><th>Type</th><th>Reference</th><th>Entity</th><th>Detail</th><th>Expiry date</th><th className="num">Days</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>No matching dates.</td></tr>
            ) : filtered.map((i, idx) => (
              <tr key={idx}>
                <td><span className={`badge ${i.flagCls}`}>{i.flagLabel}</span></td>
                <td>{i.kind}</td>
                <td><code style={{ fontSize: 12 }}>{i.ref}</code></td>
                <td>{i.entity}</td>
                <td className="muted">{i.detail}</td>
                <td>{i.expiryDate || "—"}</td>
                <td className="num">{i.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
