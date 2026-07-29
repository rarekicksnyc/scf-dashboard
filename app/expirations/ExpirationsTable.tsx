"use client";

import { useMemo, useState } from "react";

// Distinct {id, name} for a group dimension present in the rows, name-sorted.
function dedupe(rows: { sellerId?: string; sellerName?: string; obligorId?: string; obligorName?: string }[], idKey: "sellerId" | "obligorId", nameKey: "sellerName" | "obligorName") {
  const map = new Map<string, string>();
  for (const r of rows) { const id = r[idKey]; if (id) map.set(id, r[nameKey] ?? id); }
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

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
  sellerId?: string;
  sellerName?: string;
  obligorId?: string;
  obligorName?: string;
}

// The full "all tracked dates" list with client-side filters — search text, a
// type dropdown, and a "flagged only" toggle — so the desk can find one line
// without scrolling the whole book.
export default function ExpirationsTable({ rows }: { rows: ExpiryRow[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [seller, setSeller] = useState("");
  const [obligor, setObligor] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const kinds = useMemo(() => [...new Set(rows.map((r) => r.kind))].sort(), [rows]);
  const sellers = useMemo(() => dedupe(rows, "sellerId", "sellerName"), [rows]);
  const obligors = useMemo(() => dedupe(rows, "obligorId", "obligorName"), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (flaggedOnly && r.flag === "OK") return false;
      // Seller and/or obligor group: with both set, show anything tied to either
      // (all dates for that seller AND all for that obligor).
      if (seller && obligor) { if (r.sellerId !== seller && r.obligorId !== obligor) return false; }
      else if (seller) { if (r.sellerId !== seller) return false; }
      else if (obligor) { if (r.obligorId !== obligor) return false; }
      if (needle && !`${r.kind} ${r.ref} ${r.entity} ${r.detail}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, kind, seller, obligor, flaggedOnly]);

  const sel: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };

  return (
    <div className="panel">
      <h2>All tracked dates ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""})</h2>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, entity, or detail…" style={{ ...sel, minWidth: 220 }} />
        <select value={seller} onChange={(e) => setSeller(e.target.value)} style={sel} aria-label="Seller group"><option value="">All seller groups</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select value={obligor} onChange={(e) => setObligor(e.target.value)} style={sel} aria-label="Obligor group"><option value="">All obligor groups</option>{obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={sel}><option value="">All types</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} className="muted"><input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Flagged only</label>
        {(q || kind || seller || obligor || flaggedOnly) && <button className="btn secondary" style={{ fontSize: 12 }} type="button" onClick={() => { setQ(""); setKind(""); setSeller(""); setObligor(""); setFlaggedOnly(false); }}>Clear</button>}
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
