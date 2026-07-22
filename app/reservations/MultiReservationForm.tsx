"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

interface Opt { id: string; name: string }
interface Check { name?: string; category?: string; message: string; severity: string; status?: string }

interface Row {
  sellerId: string;
  obligorId: string;
  amount: string;
  valueDate: string;
  maturityDate: string;
  pricingBps: string;
  rrlAmount: string;
  status: "idle" | "booked" | "blocked" | "error";
  message?: string;
  reasons?: string[];
  checks?: Check[];
  comment?: string;
}

const SEV: Record<string, string> = { GREEN: "green", YELLOW: "yellow", ORANGE: "orange", RED: "red", GREY: "grey" };

const cell = { border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const numCell = { ...cell, textAlign: "right" as const };
// Real pixel min-widths so boxes never collapse under the global width:100% /
// auto-layout table (a td `width` is only a hint the browser can shrink).
const mw = (min: number, num = false) => ({ ...(num ? numCell : cell), minWidth: min });

export default function MultiReservationForm({
  sellers,
  obligors,
  rrlSellers,
  canBook,
}: {
  sellers: Opt[];
  obligors: Opt[];
  rrlSellers: string[];
  canBook: boolean;
}) {
  const router = useRouter();
  const blank = (): Row => ({
    sellerId: sellers[0]?.id ?? "",
    obligorId: obligors[0]?.id ?? "",
    amount: "5000000",
    valueDate: "2026-08-15",
    maturityDate: "2026-11-13",
    pricingBps: "125",
    rrlAmount: "0",
    status: "idle",
  });
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExp = (i: number) => setExpanded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { ...blank(), valueDate: rs[rs.length - 1]?.valueDate ?? blank().valueDate, maturityDate: rs[rs.length - 1]?.maturityDate ?? blank().maturityDate }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i));
  }

  async function book(r: Row, override: boolean) {
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "DISCOUNT",
        sellerId: r.sellerId,
        obligorId: r.obligorId,
        amount: Number(r.amount),
        pricingBps: Number(r.pricingBps),
        rrlAmount: rrlSellers.includes(r.sellerId) ? Number(r.rrlAmount) : 0,
        valueDate: r.valueDate,
        maturityDate: r.maturityDate,
        override,
        comment: r.comment ?? "",
      }),
    });
    const data = await res.json();
    const checks: Check[] = data.checks ?? [];
    if (res.ok) return { ...r, status: "booked" as const, message: data.reservation.id, reasons: undefined, checks };
    if (data.canOverride)
      return {
        ...r,
        status: "blocked" as const,
        checks,
        reasons: checks.filter((c) => c.severity === "RED" || c.severity === "ORANGE").map((c) => c.message),
      };
    return { ...r, status: "error" as const, message: data.error, checks };
  }

  async function runAll() {
    setBusy(true);
    const results = await Promise.all(rows.map((r) => (r.status === "booked" ? Promise.resolve(r) : book(r, false))));
    setRows(results);
    setBusy(false);
    router.refresh();
  }

  async function overrideRow(i: number) {
    setBusy(true);
    const updated = await book({ ...rows[i], status: "blocked" }, true);
    setRows((rs) => rs.map((r, j) => (j === i ? updated : r)));
    setBusy(false);
    router.refresh();
  }

  if (!canBook) return null;

  const booked = rows.filter((r) => r.status === "booked").length;
  const blocked = rows.filter((r) => r.status === "blocked").length;

  return (
    <div className="panel">
      <h2>Reserve future discounts ({rows.length})</h2>
      <div style={{ padding: 14 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Seller</th>
                <th>Obligor</th>
                <th className="num">Amount</th>
                <th>Value</th>
                <th>Maturity</th>
                <th className="num">Pricing</th>
                <th className="num">RRL</th>
                <th>Result</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={i}>
                <tr>
                  <td>
                    <select style={mw(230)} value={r.sellerId} onChange={(e) => update(i, { sellerId: e.target.value, status: "idle" })}>
                      {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select style={mw(230)} value={r.obligorId} onChange={(e) => update(i, { obligorId: e.target.value, status: "idle" })}>
                      {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td><input style={mw(150, true)} type="number" value={r.amount} onChange={(e) => update(i, { amount: e.target.value, status: "idle" })} /></td>
                  <td><input style={mw(160)} type="date" value={r.valueDate} onChange={(e) => update(i, { valueDate: e.target.value, status: "idle" })} /></td>
                  <td><input style={mw(160)} type="date" value={r.maturityDate} onChange={(e) => update(i, { maturityDate: e.target.value, status: "idle" })} /></td>
                  <td><input style={mw(110, true)} type="number" value={r.pricingBps} onChange={(e) => update(i, { pricingBps: e.target.value, status: "idle" })} /></td>
                  <td>
                    {rrlSellers.includes(r.sellerId) ? (
                      <input style={mw(150, true)} type="number" value={r.rrlAmount} onChange={(e) => update(i, { rrlAmount: e.target.value, status: "idle" })} />
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>N/A</span>
                    )}
                  </td>
                  <td style={{ minWidth: 200 }}>
                    {r.status === "booked" && <span className="badge green">Booked {r.message}</span>}
                    {r.status === "error" && <span className="badge red">{r.message}</span>}
                    {r.status === "blocked" && (
                      <div style={{ fontSize: 11 }}>
                        <div className="check-pill orange">Did not clear</div>
                        <div className="muted">{r.reasons?.join("; ")}</div>
                        <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                          <input style={{ ...cell, fontSize: 11 }} placeholder="reason for exception" value={r.comment ?? ""} onChange={(e) => update(i, { comment: e.target.value })} />
                          <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} type="button" disabled={busy || !(r.comment ?? "").trim()} onClick={() => overrideRow(i)}>Book w/ exception</button>
                        </div>
                      </div>
                    )}
                    {r.status === "idle" && <span className="muted" style={{ fontSize: 11 }}>—</span>}
                    {r.checks && r.checks.length > 0 && (
                      <button type="button" onClick={() => toggleExp(i)} style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 11, padding: "2px 0" }}>
                        {expanded.has(i) ? "▾ hide" : "▸ eligibility results"} ({r.checks.filter((c) => c.status === "PASS").length}✓ {r.checks.filter((c) => c.status === "WARN").length}! {r.checks.filter((c) => c.status === "FAIL").length}✗)
                      </button>
                    )}
                  </td>
                  <td>{rows.length > 1 && <button className="btn secondary" style={{ padding: "3px 8px", fontSize: 12 }} type="button" onClick={() => removeRow(i)}>✕</button>}</td>
                </tr>
                {expanded.has(i) && r.checks && (
                  <tr>
                    <td colSpan={9} style={{ background: "#fafbfd", padding: "8px 14px" }}>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                        Eligibility results — {r.sellerId} / {r.obligorId}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px" }}>
                        {r.checks.filter((c) => c.severity !== "GREY").map((c, k) => (
                          <span key={k} style={{ fontSize: 11, minWidth: 260 }}>
                            <span className={`check-pill ${SEV[c.severity]}`}>{c.status}</span>{" "}
                            <strong>{c.name ?? ""}</strong> <span className="muted">{c.message}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button className="btn secondary" type="button" onClick={addRow}>+ Add another reservation</button>
          <button className="btn" type="button" onClick={runAll} disabled={busy}>{busy ? "Checking…" : "Run all"}</button>
          {(booked > 0 || blocked > 0) && (
            <span className="muted" style={{ fontSize: 12 }}>{booked} booked{blocked > 0 ? `, ${blocked} need attention` : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}
