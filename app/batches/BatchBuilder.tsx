"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NumberInput from "../NumberInput";
import { inputBase as input } from "@/lib/ui";

interface Opt { id: string; name: string }

interface Row {
  obligorId: string;
  invoiceNumber: string;
  amount: string;
  advanceRate: string; // percent
  margin: string; // bps
  valueDate: string;
  dueDate: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const plus = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

// Build an invoice batch by hand in an editable table (an alternative to
// uploading a CSV/Excel), then run eligibility. The engine treats a batch as
// single-seller, so the seller is chosen once for the whole batch and each row
// is one invoice. On submit the rows are turned into the same CSV the parser
// reads, so this reuses the existing upload path.
export default function BatchBuilder({ sellers, obligors, sellerObligors }: { sellers: Opt[]; obligors: Opt[]; sellerObligors: Record<string, Opt[]> }) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? "");
  // Obligors on THIS seller's ASR approved list (only those can fund); fall back
  // to all obligors if the seller has none on file, so it's never a dead end.
  const obligorsForSeller = (sellerObligors[sellerId]?.length ? sellerObligors[sellerId] : obligors);
  const blank = (): Row => ({ obligorId: obligorsForSeller[0]?.id ?? "", invoiceNumber: "", amount: "", advanceRate: "95", margin: "125", valueDate: today(), dueDate: plus(90) });
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blank()]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  function changeSeller(id: string) {
    setSellerId(id);
    // Re-point every row's obligor to one on the new seller's ASR list.
    const list = sellerObligors[id]?.length ? sellerObligors[id] : obligors;
    setRows((rs) => rs.map((r) => (list.some((o) => o.id === r.obligorId) ? r : { ...r, obligorId: list[0]?.id ?? "" })));
  }

  const isIncomplete = (r: Row) => !r.obligorId || !(Number(r.amount) > 0);
  const valid = rows.filter((r) => !isIncomplete(r));

  async function run() {
    setBusy(true); setError(null);
    const header = "seller,obligor,invoice_number,invoice_amount,advance_rate,margin,value_date,due_date,currency";
    const lines = valid.map((r, i) =>
      [sellerId, r.obligorId, r.invoiceNumber || `INV-${1001 + i}`, r.amount, r.advanceRate || "100", r.margin || "0", r.valueDate, r.dueDate, "USD"].join(","),
    );
    const csv = [header, ...lines].join("\n");
    const res = await fetch("/api/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv, fileName: "manual_batch.csv" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Could not run the batch."); return; }
    router.push(`/batches/${data.batchId}`);
  }

  const cell: React.CSSProperties = { ...input, fontSize: 13, padding: "6px 8px" };
  const small: React.CSSProperties = { ...cell, width: 80 };

  return (
    <div className="panel">
      <h2>Build a batch by hand</h2>
      <div style={{ padding: 14 }}>
        {error && <div className="notice err" style={{ marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span className="muted">Seller (whole batch)</span>
            <select style={{ ...cell, minWidth: 240 }} value={sellerId} onChange={(e) => changeSeller(e.target.value)}>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <span className="muted" style={{ fontSize: 12, alignSelf: "flex-end" }}>Each row is one invoice under this seller.</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Obligor</th><th>Invoice #</th><th className="num">Amount</th><th className="num">Advance %</th>
                <th className="num">Margin (bps)</th><th>Value date</th><th>Due date</th><th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={isIncomplete(r) ? { boxShadow: "inset 3px 0 0 var(--orange)" } : undefined} title={isIncomplete(r) ? "Incomplete — needs an obligor and an amount to be included" : undefined}>
                  <td><select style={{ ...cell, minWidth: 160 }} value={r.obligorId} onChange={(e) => setRow(i, { obligorId: e.target.value })}>{obligorsForSeller.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
                  <td><input style={{ ...cell, width: 110 }} value={r.invoiceNumber} onChange={(e) => setRow(i, { invoiceNumber: e.target.value })} placeholder={`INV-${1001 + i}`} /></td>
                  <td><NumberInput style={{ ...cell, width: 140 }} value={r.amount} onValue={(v) => setRow(i, { amount: v })} placeholder="amount" ariaLabel="Amount" /></td>
                  <td><input style={small} type="number" value={r.advanceRate} onChange={(e) => setRow(i, { advanceRate: e.target.value })} /></td>
                  <td><input style={small} type="number" value={r.margin} onChange={(e) => setRow(i, { margin: e.target.value })} /></td>
                  <td><input style={{ ...cell, width: 140 }} type="date" value={r.valueDate} onChange={(e) => setRow(i, { valueDate: e.target.value })} /></td>
                  <td><input style={{ ...cell, width: 140 }} type="date" value={r.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} /></td>
                  <td>{rows.length > 1 && <button className="btn secondary" style={{ padding: "4px 9px", fontSize: 12 }} type="button" onClick={() => removeRow(i)}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button className="btn secondary" style={{ fontSize: 12 }} type="button" onClick={addRow}>+ Add invoice</button>
          <button className="btn" type="button" disabled={busy || valid.length === 0} onClick={run}>{busy ? "Running eligibility…" : `Run eligibility (${valid.length})`}</button>
          {rows.length - valid.length > 0 && <span className="muted" style={{ fontSize: 12 }}>{rows.length - valid.length} incomplete row{rows.length - valid.length === 1 ? "" : "s"} will be skipped.</span>}
        </div>
      </div>
    </div>
  );
}
