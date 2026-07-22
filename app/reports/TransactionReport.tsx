"use client";

import { useMemo, useState } from "react";
import { mm, dateShort } from "@/lib/format";

interface Opt { id: string; name: string }
export interface TxnRow {
  invoiceNumber: string;
  sellerId: string;
  sellerName: string;
  obligorId: string;
  obligorName: string;
  amount: number;
  bookedDate: string;
  valueDate: string;
  maturityDate: string;
  batchId: string;
}

const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 13, width: "100%" };
const field = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12 };

type Basis = "booked" | "value" | "maturity";

export default function TransactionReport({
  deals,
  sellers,
  obligors,
}: {
  deals: TxnRow[];
  sellers: Opt[];
  obligors: Opt[];
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

  function downloadCsv() {
    const header = ["invoice_number", "seller_id", "seller", "obligor_id", "obligor", "amount", "booked_date", "value_date", "maturity_date", "batch"];
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const d of filtered) {
      lines.push([d.invoiceNumber, d.sellerId, d.sellerName, d.obligorId, d.obligorName, d.amount, d.bookedDate.slice(0, 10), d.valueDate, d.maturityDate, d.batchId].map(esc).join(","));
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
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"} · {mm(total)}
          </span>
          <button className="btn secondary" type="button" onClick={downloadCsv} disabled={filtered.length === 0}>
            Download CSV
          </button>
        </div>

        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Seller</th>
                <th>Obligor</th>
                <th className="num">Amount</th>
                <th>Booked</th>
                <th>Value date</th>
                <th>Maturity</th>
                <th>Batch</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="muted" style={{ padding: 16 }}>No transactions match the filters.</td></tr>
              ) : (
                filtered.map((d, i) => (
                  <tr key={`${d.batchId}-${d.invoiceNumber}-${i}`}>
                    <td>{d.invoiceNumber}</td>
                    <td>{d.sellerName}</td>
                    <td>{d.obligorName}</td>
                    <td className="num">{mm(d.amount)}</td>
                    <td>{dateShort(d.bookedDate)}</td>
                    <td>{dateShort(d.valueDate)}</td>
                    <td>{dateShort(d.maturityDate)}</td>
                    <td>{d.batchId}</td>
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
