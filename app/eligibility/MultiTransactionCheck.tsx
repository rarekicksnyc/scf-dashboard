"use client";

import { useState } from "react";
import { usd } from "@/lib/format";
import { cellInput, clampPct, coverageAmount } from "@/lib/ui";

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
const mw = cellInput;

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
  const sName = (id: string) => sellers.find((s) => s.id === id)?.name ?? id;
  const oName = (id: string) => obligors.find((o) => o.id === id)?.name ?? id;

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, decision: undefined } : r)));
  }
  function addRow() { setRows((rs) => [...rs, blank()]); }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, j) => j !== i)); }

  async function runAll() {
    setBusy(true);
    try {
      const results = await Promise.all(rows.map(async (r) => {
        try {
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
          const d = await res.json().catch(() => ({}));
          if (!res.ok) return { ...r, decision: undefined, funded: undefined, allIn: undefined, reasons: [d.error ?? `Error ${res.status}`] };
          const reasons = (d.checks ?? []).filter((c: { severity: string }) => c.severity === "RED" || c.severity === "ORANGE").map((c: { message: string }) => c.message);
          return { ...r, decision: d.decision, funded: d.advanceAmount, allIn: d.pricing?.allInRatePct, reasons };
        } catch {
          return { ...r, decision: undefined, funded: undefined, allIn: undefined, reasons: ["Request failed — check your connection and try again."] };
        }
      }));
      setRows(results);
    } finally {
      setBusy(false);
    }
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
                <th className="num">Adv %</th><th className="num">Coverage</th><th>Value</th><th>Maturity</th><th className="num">Margin</th>
                <th>Product</th><th>Base</th><th className="num">Base %</th><th>Result</th><th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><select style={mw(230)} value={r.sellerId} onChange={(e) => update(i, { sellerId: e.target.value })}>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                  <td><select style={mw(230)} value={r.obligorId} onChange={(e) => update(i, { obligorId: e.target.value, obligorEntityId: "" })}>{obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
                  <td>
                    {obligorEntities.some((e) => e.groupId === r.obligorId) ? (
                      <select style={mw(190)} value={r.obligorEntityId} onChange={(e) => update(i, { obligorEntityId: e.target.value })}>
                        <option value="">Group aggregate</option>
                        {obligorEntities.filter((e) => e.groupId === r.obligorId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td><input style={mw(150, true)} type="number" value={r.invoiceAmount} onChange={(e) => update(i, { invoiceAmount: e.target.value })} /></td>
                  <td><select style={mw(140)} value={r.invoiceType} onChange={(e) => update(i, { invoiceType: e.target.value })}><option value="FINAL">Final</option><option value="PROVISIONAL">Provisional</option><option value="PIPELINE">Pipeline</option></select></td>
                  <td><input style={mw(90, true)} type="number" min="0" max="100" step="0.5" value={r.advanceRate} onChange={(e) => update(i, { advanceRate: clampPct(e.target.value) })} /></td>
                  <td className="num" style={{ minWidth: 130, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{usd(coverageAmount(Number(r.invoiceAmount) || 0, (Number(r.advanceRate) || 0) / 100))}</td>
                  <td><input style={mw(160)} type="date" value={r.valueDate} onChange={(e) => update(i, { valueDate: e.target.value })} /></td>
                  <td><input style={mw(160)} type="date" value={r.maturityDate} onChange={(e) => update(i, { maturityDate: e.target.value })} /></td>
                  <td><input style={mw(100, true)} type="number" value={r.pricingBps} onChange={(e) => update(i, { pricingBps: e.target.value })} /></td>
                  <td><select style={mw(110)} value={r.productType} onChange={(e) => update(i, { productType: e.target.value })}><option value="DTR">DTR</option><option value="UTRC">UTRC</option></select></td>
                  <td><select style={mw(110)} value={r.baseRateType} onChange={(e) => update(i, { baseRateType: e.target.value })}><option value="SOFR">SOFR</option><option value="COF">COF</option><option value="OTHER">Other</option></select></td>
                  <td><input style={mw(110, true)} type="number" step="0.01" value={r.baseRate} onChange={(e) => update(i, { baseRate: e.target.value })} /></td>
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

        {rows.some((r) => r.decision || (r.reasons && r.reasons.length > 0)) && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Results</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                  <span className="muted" style={{ minWidth: 24 }}>{i + 1}.</span>
                  <span style={{ minWidth: 260 }}>{sName(r.sellerId)} <span className="muted">/</span> {oName(r.obligorId)}</span>
                  {r.decision ? (
                    <span className={`badge ${DECISION[r.decision] ?? "grey"}`}>{r.decision.replace(/_/g, " ")}</span>
                  ) : (
                    <span className="badge grey">no result</span>
                  )}
                  <span className="muted">
                    {r.funded ? `$${(r.funded / 1e6).toFixed(2)}M funded` : ""} {r.allIn != null ? `· ${r.allIn.toFixed(2)}% all-in` : ""}
                  </span>
                  {r.reasons && r.reasons.length > 0 && (
                    <span style={{ color: "var(--orange)", flexBasis: "100%", paddingLeft: 34 }}>{r.reasons.join("; ")}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
