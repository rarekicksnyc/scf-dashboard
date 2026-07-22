"use client";

import { useState } from "react";

interface Opt { id: string; name: string }
interface EntityOpt { groupId: string; id: string; name: string }

interface Row {
  sellerId: string;
  obligorId: string;
  obligorEntityId: string;
  invoiceAmount: string;
  invoiceType: string;
  advanceRate: string; // percent
  valueDate: string;
  maturityDate: string;
  pricingBps: string;
  productType: string;
  baseRateType: string;
  baseRate: string;
  decision?: string;
  funded?: number;
  allIn?: number;
  reasons?: string[];
}

const DECISION: Record<string, string> = {
  ELIGIBLE: "green",
  ELIGIBLE_WITH_WARNING: "yellow",
  EXCEPTION_REQUIRED: "orange",
  REJECTED: "red",
};
const cell = { border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 14, width: "100%" };
const numCell = { ...cell, textAlign: "right" as const };

export default function MultiTransactionCheck({ sellers, obligors, obligorEntities }: { sellers: Opt[]; obligors: Opt[]; obligorEntities: EntityOpt[] }) {
  const blank = (): Row => ({
    sellerId: sellers[0]?.id ?? "",
    obligorId: obligors[0]?.id ?? "",
    obligorEntityId: "",
    invoiceAmount: "10000000",
    invoiceType: "FINAL",
    advanceRate: "95",
    valueDate: "2026-08-01",
    maturityDate: "2026-11-01",
    pricingBps: "125",
    productType: "DTR",
    baseRateType: "SOFR",
    baseRate: "0",
  });
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [busy, setBusy] = useState(false);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, decision: undefined } : r)));
  }
  function addRow() { setRows((rs) => [...rs, blank()]); }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, j) => j !== i)); }

  async function runAll() {
    setBusy(true);
    const results = await Promise.all(rows.map(async (r) => {
      const res = await fetch("/api/eligibility", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sellerId: r.sellerId, obligorId: r.obligorId, obligorEntityId: r.obligorEntityId || undefined, invoiceAmount: Number(r.invoiceAmount),
          invoiceType: r.invoiceType, advanceRate: Number(r.advanceRate) / 100,
          valueDate: r.valueDate, maturityDate: r.maturityDate, pricingBps: Number(r.pricingBps),
          productType: r.productType, baseRateType: r.baseRateType, baseRate: Number(r.baseRate),
        }),
      });
      const d = await res.json();
      const reasons = (d.checks ?? []).filter((c: { severity: string }) => c.severity === "RED" || c.severity === "ORANGE").map((c: { message: string }) => c.message);
      return { ...r, decision: d.decision, funded: d.advanceAmount, allIn: d.pricing?.allInRatePct, reasons };
    }));
    setRows(results);
    setBusy(false);
  }

  return (
    <div className="panel">
      <h2>Check transactions ({rows.length})</h2>
      <div style={{ padding: 14 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Seller</th><th>Obligor</th><th>Obligor entity</th><th className="num">Amount</th><th>Type</th>
                <th className="num">Adv %</th><th>Value</th><th>Maturity</th><th className="num">Margin</th>
                <th>Product</th><th>Base</th><th className="num">Base %</th><th>Result</th><th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 300 }}><select style={cell} value={r.sellerId} onChange={(e) => update(i, { sellerId: e.target.value })}>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                  <td style={{ minWidth: 300 }}><select style={cell} value={r.obligorId} onChange={(e) => update(i, { obligorId: e.target.value, obligorEntityId: "" })}>{obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
                  <td style={{ minWidth: 240 }}>
                    {obligorEntities.some((e) => e.groupId === r.obligorId) ? (
                      <select style={cell} value={r.obligorEntityId} onChange={(e) => update(i, { obligorEntityId: e.target.value })}>
                        <option value="">Group aggregate</option>
                        {obligorEntities.filter((e) => e.groupId === r.obligorId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td style={{ width: 240 }}><input style={numCell} type="number" value={r.invoiceAmount} onChange={(e) => update(i, { invoiceAmount: e.target.value })} /></td>
                  <td style={{ width: 160 }}><select style={cell} value={r.invoiceType} onChange={(e) => update(i, { invoiceType: e.target.value })}><option value="FINAL">Final</option><option value="PROVISIONAL">Provisional</option><option value="PIPELINE">Pipeline</option></select></td>
                  <td style={{ width: 150 }}><input style={numCell} type="number" value={r.advanceRate} onChange={(e) => update(i, { advanceRate: e.target.value })} /></td>
                  <td style={{ width: 180 }}><input style={cell} type="date" value={r.valueDate} onChange={(e) => update(i, { valueDate: e.target.value })} /></td>
                  <td style={{ width: 180 }}><input style={cell} type="date" value={r.maturityDate} onChange={(e) => update(i, { maturityDate: e.target.value })} /></td>
                  <td style={{ width: 150 }}><input style={numCell} type="number" value={r.pricingBps} onChange={(e) => update(i, { pricingBps: e.target.value })} /></td>
                  <td style={{ width: 160 }}><select style={cell} value={r.productType} onChange={(e) => update(i, { productType: e.target.value })}><option value="DTR">DTR</option><option value="UTRC">UTRC</option></select></td>
                  <td style={{ width: 150 }}><select style={cell} value={r.baseRateType} onChange={(e) => update(i, { baseRateType: e.target.value })}><option value="SOFR">SOFR</option><option value="COF">COF</option><option value="OTHER">Other</option></select></td>
                  <td style={{ width: 160 }}><input style={numCell} type="number" step="0.01" value={r.baseRate} onChange={(e) => update(i, { baseRate: e.target.value })} /></td>
                  <td style={{ minWidth: 180 }}>
                    {r.decision ? (
                      <div style={{ fontSize: 11 }}>
                        <span className={`badge ${DECISION[r.decision] ?? "grey"}`}>{r.decision.replace(/_/g, " ")}</span>
                        <span className="muted"> {r.funded ? `$${(r.funded / 1e6).toFixed(2)}M` : ""} {r.allIn != null ? `· ${r.allIn.toFixed(2)}%` : ""}</span>
                        {r.reasons && r.reasons.length > 0 && <div className="muted">{r.reasons.slice(0, 2).join("; ")}</div>}
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td>{rows.length > 1 && <button className="btn secondary" style={{ padding: "3px 8px", fontSize: 12 }} type="button" onClick={() => removeRow(i)}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button className="btn secondary" type="button" onClick={addRow}>+ Add another transaction</button>
          <button className="btn" type="button" onClick={runAll} disabled={busy}>{busy ? "Checking…" : "Run all checks"}</button>
        </div>
      </div>
    </div>
  );
}
