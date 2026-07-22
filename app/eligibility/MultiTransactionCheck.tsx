"use client";

import { useState } from "react";
import { usd } from "@/lib/format";
import { cellInput, clampPct, coverageAmount } from "@/lib/ui";

interface Opt { id: string; name: string }
interface EntityOpt { groupId: string; id: string; name: string }
interface Check { name?: string; category?: string; message: string; severity: string; status?: string; checkedAgainst?: string; txnValue?: string }

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
  checks?: Check[];
}

const DECISION: Record<string, string> = {
  ELIGIBLE: "green",
  ELIGIBLE_WITH_WARNING: "yellow",
  EXCEPTION_REQUIRED: "orange",
  REJECTED: "red",
};
const SEV: Record<string, string> = { GREEN: "green", YELLOW: "yellow", ORANGE: "orange", RED: "red", GREY: "grey" };
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExp = (i: number) => setExpanded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
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
          if (!res.ok) return { ...r, decision: undefined, funded: undefined, allIn: undefined, reasons: [d.error ?? `Error ${res.status}`], checks: undefined };
          const reasons = (d.checks ?? []).filter((c: { severity: string }) => c.severity === "RED" || c.severity === "ORANGE").map((c: { message: string }) => c.message);
          return { ...r, decision: d.decision, funded: d.advanceAmount, allIn: d.pricing?.allInRatePct, reasons, checks: d.checks ?? [] };
        } catch {
          return { ...r, decision: undefined, funded: undefined, allIn: undefined, reasons: ["Request failed — check your connection and try again."], checks: undefined };
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r, i) => {
                const checks = r.checks ?? [];
                const pass = checks.filter((c) => c.status === "PASS").length;
                const warn = checks.filter((c) => c.status === "WARN").length;
                const fail = checks.filter((c) => c.status === "FAIL").length;
                return (
                  <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                      <span className="muted" style={{ minWidth: 24 }}>{i + 1}.</span>
                      <span style={{ minWidth: 240, fontWeight: 600 }}>{sName(r.sellerId)} <span className="muted">/</span> {oName(r.obligorId)}</span>
                      {r.decision ? (
                        <span className={`badge ${DECISION[r.decision] ?? "grey"}`}>{r.decision.replace(/_/g, " ")}</span>
                      ) : (
                        <span className="badge grey">no result</span>
                      )}
                      <span className="muted">
                        {r.funded ? `$${(r.funded / 1e6).toFixed(2)}M funded` : ""} {r.allIn != null ? `· ${r.allIn.toFixed(2)}% all-in` : ""}
                      </span>
                      {checks.length > 0 && (
                        <button type="button" onClick={() => toggleExp(i)}
                          style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12 }}>
                          {expanded.has(i) ? "▾ hide checks" : "▸ show all checks"} ({pass}✓ {warn}! {fail}✗)
                        </button>
                      )}
                    </div>
                    {r.reasons && r.reasons.length > 0 && !expanded.has(i) && (
                      <div style={{ color: "var(--orange)", fontSize: 12, marginTop: 4, paddingLeft: 34 }}>{r.reasons.join("; ")}</div>
                    )}
                    {expanded.has(i) && checks.length > 0 && (
                      <div className="table-scroll" style={{ marginTop: 8 }}>
                        <table>
                          <thead><tr><th>Category</th><th>Check</th><th>Checked against</th><th>Transaction</th><th>Result</th><th>Detail</th></tr></thead>
                          <tbody>
                            {checks.map((c, k) => (
                              <tr key={k}>
                                <td className="muted" style={{ fontSize: 11 }}>{c.category}</td>
                                <td style={{ fontWeight: 600 }}>{c.name}</td>
                                <td className="muted" style={{ whiteSpace: "nowrap" }}>{c.checkedAgainst}</td>
                                <td style={{ whiteSpace: "nowrap" }}>{c.txnValue}</td>
                                <td><span className={`badge ${SEV[c.severity] ?? "grey"}`}>{c.status}</span></td>
                                <td className="muted" style={{ whiteSpace: "normal", minWidth: 200 }}>{c.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
