"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usd, mm, dateShort, daysBetween } from "@/lib/format";

export interface ExplorerDeal {
  sellerId: string;
  sellerName: string;
  obligorId: string;
  obligorName: string;
  income: number; // margin + skim, contracted over the tenor
  valueDate: string;
  tenorDays: number;
}

type Dim = "seller" | "obligor";
type SortKey = "earned" | "name" | "deals";

// Fraction of a deal's income earned by a date (accrued daily over tenor).
function frac(d: ExplorerDeal, at: string): number {
  if (d.tenorDays <= 0) return daysBetween(d.valueDate, at) >= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, daysBetween(d.valueDate, at) / d.tenorDays));
}
// Income earned by one deal in [from, to].
function earned(d: ExplorerDeal, from: string, to: string): number {
  return d.income * Math.max(0, frac(d, to) - frac(d, from));
}

// A month window [first-of-month, first-of-next-month) so months tile exactly
// (no double-count, no missing day) and a full past month captures its whole
// accrual; the caller caps the end at today for the current month.
function monthWindow(m: string): { from: string; toExcl: string; label: string } {
  const [y, mo] = m.split("-").map(Number);
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from: `${m}-01`, toExcl: `${nextY}-${String(nextMo).padStart(2, "0")}-01`, label };
}

// Revenue earned by seller or obligor, filtered to a period (FYTD, a month, or a
// custom range) and searchable by name, sortable by any column. "Earned" is
// accrual-to-date within the window — a deal contributes only the slice of its
// income that accrued between the window's start and min(end, today).
export default function RevenueExplorer({
  deals, fyStart, today,
}: { deals: ExplorerDeal[]; fyStart: string; today: string }) {
  const [dim, setDim] = useState<Dim>("seller");
  const [period, setPeriod] = useState<"FYTD" | "MONTH" | "CUSTOM" | "ALL">("FYTD");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("earned");
  const [asc, setAsc] = useState(false);

  // Resolve the active window; earnings are always capped at today (no projecting).
  const window = useMemo(() => {
    if (period === "ALL") return { from: "1900-01-01", to: today, label: "all time, to date" };
    if (period === "FYTD") return { from: fyStart, to: today, label: `FYTD (since ${dateShort(fyStart)})` };
    if (period === "MONTH") { const r = monthWindow(month); const end = r.toExcl < today ? r.toExcl : today; return { from: r.from, to: end, label: r.label }; }
    const end = to < today ? to : today;
    return { from, to: end, label: dateShort(from) + " – " + dateShort(end) };
  }, [period, month, from, to, fyStart, today]);

  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; earned: number; deals: number }>();
    for (const d of deals) {
      const e = earned(d, window.from, window.to);
      // Skip only deals with no earnings in the window (no overlap / zero income).
      // A negative-earned slice (rate-swap leg, COF below SOFR) MUST still count, or
      // the per-entity total overstates earnings and diverges from the FYTD headline.
      if (e === 0) continue;
      const id = dim === "seller" ? d.sellerId : d.obligorId;
      const name = dim === "seller" ? d.sellerName : d.obligorName;
      const row = map.get(id) ?? { id, name, earned: 0, deals: 0 };
      row.earned += e;
      row.deals += 1;
      map.set(id, row);
    }
    let list = [...map.values()];
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((r) => r.name.toLowerCase().includes(needle));
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.name.localeCompare(b.name) : sortKey === "deals" ? a.deals - b.deals : a.earned - b.earned;
      return asc ? cmp : -cmp;
    });
    return list;
  }, [deals, dim, window, q, sortKey, asc]);

  const total = rows.reduce((a, r) => a + r.earned, 0);
  const th = (key: SortKey, label: string, num = false) => (
    <th className={num ? "num" : ""} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => { if (sortKey === key) setAsc((v) => !v); else { setSortKey(key); setAsc(false); } }}>
      {label}{sortKey === key ? (asc ? " ▲" : " ▼") : ""}
    </th>
  );
  const btn = (p: typeof period, label: string) => (
    <button type="button" className={`tab ${period === p ? "on" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setPeriod(p)}>{label}</button>
  );
  const inp: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };

  return (
    <div className="panel">
      <h2>Revenue by {dim === "seller" ? "seller" : "obligor"} — earned</h2>
      <div style={{ padding: "10px 14px 0", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div className="tabs" style={{ margin: 0, border: "none" }}>
          <button type="button" className={`tab ${dim === "seller" ? "on" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setDim("seller")}>Sellers</button>
          <button type="button" className={`tab ${dim === "obligor" ? "on" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setDim("obligor")}>Obligors</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${dim}s…`} style={{ ...inp, minWidth: 200 }} />
      </div>
      <div style={{ padding: "8px 14px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <span className="muted">Period:</span>
        {btn("FYTD", "FYTD")}{btn("MONTH", "Month")}{btn("CUSTOM", "Custom")}{btn("ALL", "All time")}
        {period === "MONTH" && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inp} />}
        {period === "CUSTOM" && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} /><span className="muted">to</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} /></>}
      </div>
      <div style={{ padding: "10px 14px 4px", fontSize: 13 }}>
        Earned {window.label}: <strong style={{ fontSize: 16 }}>{usd(total)}</strong> <span className="muted">· {rows.length} {dim}{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr>{th("name", dim === "seller" ? "Seller" : "Obligor")}{th("deals", "Deals", true)}{th("earned", "Earned revenue", true)}<th className="num">Share</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No revenue earned in this period.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/${dim === "seller" ? "sellers" : "obligors"}/${r.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>{r.name}</Link></td>
                <td className="num">{r.deals}</td>
                <td className="num" style={{ fontWeight: 700 }}>{usd(r.earned)}</td>
                <td className="num">{total > 0 ? `${((r.earned / total) * 100).toFixed(0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && <tfoot><tr style={{ fontWeight: 700 }}><td>Total</td><td className="num">{rows.reduce((a, r) => a + r.deals, 0)}</td><td className="num">{usd(total)}</td><td className="num">100%</td></tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
