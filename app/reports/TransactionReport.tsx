"use client";

import { useMemo, useState } from "react";
import { mm, dateShort, daysBetween, usd } from "@/lib/format";
import { inputCompact as input, fieldLabel as field } from "@/lib/ui";
import { evaluateExpression, toNumber } from "@/lib/creator/expr";
import type { TemplateFieldDef } from "@/lib/types";

interface Opt { id: string; name: string }

// A custom report column's value for one row. Formula fields evaluate the same
// pure, safe evaluator used everywhere else — client-side, no round-trip.
function cellValue(f: TemplateFieldDef, d: TxnRow): string {
  if (f.kind === "text") return f.text ?? "";
  if (f.kind === "dropdown") return f.options?.[0] ?? "";
  const ctx = { amount: d.amount, coverage: d.coverage, advance_rate: d.advanceRate, revenue: d.revenue, tenor_days: daysBetween(d.valueDate, d.maturityDate) };
  const { value, error } = evaluateExpression(f.formula ?? "", ctx);
  if (error !== undefined || value === undefined) return "—";
  const n = toNumber(value);
  switch (f.format) {
    case "currency": return usd(n);
    case "percent": return `${(n * 100).toFixed(1)}%`;
    case "bps": return `${Math.round(n)} bps`;
    case "text": return String(value);
    default: return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}
export interface TxnRow {
  invoiceNumber: string;
  sellerId: string;
  sellerName: string;
  obligorId: string;
  obligorName: string;
  amount: number;
  advanceRate: number;
  coverage: number;
  revenue: number;
  bookedDate: string;
  valueDate: string;
  maturityDate: string;
  batchId: string;
}


type Basis = "booked" | "value" | "maturity";

export default function TransactionReport({
  deals,
  sellers,
  obligors,
  templateFields = [],
}: {
  deals: TxnRow[];
  sellers: Opt[];
  obligors: Opt[];
  templateFields?: TemplateFieldDef[];
}) {
  const [sellerId, setSellerId] = useState("");
  const [obligorId, setObligorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [basis, setBasis] = useState<Basis>("value");

  const basisDate = (d: TxnRow) =>
    basis === "booked" ? d.bookedDate : basis === "maturity" ? d.maturityDate : d.valueDate;

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (sellerId && d.sellerId !== sellerId) return false;
      if (obligorId && d.obligorId !== obligorId) return false;
      const dt = basisDate(d).slice(0, 10);
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, sellerId, obligorId, from, to, basis]);

  const total = filtered.reduce((a, d) => a + d.amount, 0);
  const totalCoverage = filtered.reduce((a, d) => a + d.coverage, 0);
  const totalRevenue = filtered.reduce((a, d) => a + d.revenue, 0);

  const exportQuery = () => {
    const p = new URLSearchParams();
    if (sellerId) p.set("sellerId", sellerId);
    if (obligorId) p.set("obligorId", obligorId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("basis", basis);
    return p.toString();
  };

  function downloadCsv() {
    const header = ["invoice_number", "seller_id", "seller", "obligor_id", "obligor", "amount", "advance_rate", "coverage_amount", "revenue", "booked_date", "value_date", "maturity_date", "batch", ...templateFields.map((f) => f.key)];
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const d of filtered) {
      lines.push([d.invoiceNumber, d.sellerId, d.sellerName, d.obligorId, d.obligorName, d.amount, d.advanceRate, Math.round(d.coverage), Math.round(d.revenue), d.bookedDate.slice(0, 10), d.valueDate, d.maturityDate, d.batchId, ...templateFields.map((f) => cellValue(f, d))].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <h2>Transaction report</h2>
      <div style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 14 }}>
          <label style={field}>Seller
            <select style={input} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
              <option value="">All sellers</option>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={field}>Obligor
            <select style={input} value={obligorId} onChange={(e) => setObligorId(e.target.value)}>
              <option value="">All obligors</option>
              {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label style={field}>Date basis
            <select style={input} value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
              <option value="booked">Booked date</option>
              <option value="value">Value / funded date</option>
              <option value="maturity">Maturity date</option>
            </select>
          </label>
          <label style={field}>From
            <input style={input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={field}>To
            <input style={input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div className="row-actions" style={{ justifyContent: "space-between" }}>
          <span className="muted">
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"} · {mm(total)} volume · {mm(totalCoverage)} coverage · {mm(totalRevenue)} revenue
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <a
              className="btn"
              href={`/api/reports/transactions-xlsx?${exportQuery()}`}
              aria-disabled={filtered.length === 0}
              style={filtered.length === 0 ? { pointerEvents: "none", opacity: 0.5 } : undefined}
            >
              Download Excel
            </a>
            <button className="btn secondary" type="button" onClick={downloadCsv} disabled={filtered.length === 0}>
              Download CSV
            </button>
          </span>
        </div>

        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Seller</th>
                <th>Obligor</th>
                <th className="num">Amount</th>
                <th className="num">Adv %</th>
                <th className="num">Coverage</th>
                <th className="num">Revenue</th>
                <th>Booked</th>
                <th>Value date</th>
                <th>Maturity</th>
                <th>Batch</th>
                {templateFields.map((f) => <th key={f.id} className={f.kind === "formula" && f.format !== "text" ? "num" : ""}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11 + templateFields.length} className="muted" style={{ padding: 16 }}>No transactions match the filters.</td></tr>
              ) : (
                filtered.map((d, i) => (
                  <tr key={`${d.batchId}-${d.invoiceNumber}-${i}`}>
                    <td>{d.invoiceNumber}</td>
                    <td>{d.sellerName}</td>
                    <td>{d.obligorName}</td>
                    <td className="num">{mm(d.amount)}</td>
                    <td className="num">{(d.advanceRate * 100).toFixed(0)}%</td>
                    <td className="num">{mm(d.coverage)}</td>
                    <td className="num">{mm(d.revenue)}</td>
                    <td>{dateShort(d.bookedDate)}</td>
                    <td>{dateShort(d.valueDate)}</td>
                    <td>{dateShort(d.maturityDate)}</td>
                    <td>{d.batchId}</td>
                    {templateFields.map((f) => <td key={f.id} className={f.kind === "formula" && f.format !== "text" ? "num" : ""}>{cellValue(f, d)}</td>)}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
