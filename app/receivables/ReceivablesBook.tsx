"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usd, mm, dateShort } from "@/lib/format";

export interface RecRow {
  id: string;
  reference: string;
  source: "BOOKED" | "BATCH";
  sellerId: string;
  sellerName: string;
  obligorName: string;
  productType: string;
  amount: number; // funded principal (coverage)
  outstanding: number;
  collected: number;
  status: "OUTSTANDING" | "PARTIALLY_COLLECTED" | "OVERDUE" | "SETTLED" | "DEFAULTED";
  overdueDays: number;
  daysToMaturity: number;
  valueDate: string;
  maturityDate: string;
  additionalInterest: number;
  hasInvestor: boolean;
  investorSettled: boolean;
  hasInsurer: boolean;
  defaulted: boolean;
  workout?: "RECOURSE_TO_SELLER" | "INSURANCE_CLAIM" | "WRITE_OFF";
  claimStatus?: "FILED" | "PAID" | "DENIED";
}

export interface Metrics {
  totalOutstanding: number;
  overdueOutstanding: number;
  overduePct: number;
  defaultedOutstanding: number;
  liveCount: number;
  overdueCount: number;
  weightedAvgTenor: number;
  additionalInterestOwed: number;
  topObligorPct: number;
  obligorConcentration: { id: string; name: string; outstanding: number; pct: number; count: number }[];
}

export interface AgingRow { bucket: string; count: number; outstanding: number }

const STATUS: Record<RecRow["status"], { label: string; cls: string }> = {
  OUTSTANDING: { label: "Outstanding", cls: "grey" },
  PARTIALLY_COLLECTED: { label: "Part-collected", cls: "yellow" },
  OVERDUE: { label: "Overdue", cls: "red" },
  SETTLED: { label: "Settled", cls: "green" },
  DEFAULTED: { label: "Defaulted", cls: "red" },
};
const AGE_LABEL: Record<string, string> = {
  CURRENT: "Current", D1_30: "1–30 days", D31_60: "31–60 days", D61_90: "61–90 days", D90_PLUS: "90+ days",
};
const WORKOUTS = [
  { v: "RECOURSE_TO_SELLER", label: "Recourse to seller" },
  { v: "INSURANCE_CLAIM", label: "Insurance claim" },
  { v: "WRITE_OFF", label: "Write off" },
];

async function downloadPdf(payload: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); return e.error || "Could not generate the invoice."; }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || "invoice.pdf";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  return null;
}

export default function ReceivablesBook({
  asOf, metrics, aging, rows, sellers, canManage,
}: { asOf: string; metrics: Metrics; aging: AgingRow[]; rows: RecRow[]; sellers: { id: string; name: string }[]; canManage: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const live = rows.filter((r) => r.status !== "SETTLED");
  const agingMax = Math.max(1, ...aging.map((a) => a.outstanding));

  const cards = [
    { label: "Outstanding", value: usd(metrics.totalOutstanding), sub: `${metrics.liveCount} live receivable${metrics.liveCount === 1 ? "" : "s"}` },
    { label: "Overdue", value: usd(metrics.overdueOutstanding), sub: `${metrics.overduePct.toFixed(0)}% of book · ${metrics.overdueCount} past due` },
    { label: "Additional interest owed", value: usd(metrics.additionalInterestOwed), sub: "default interest on past-due" },
    { label: "Avg. weighted tenor", value: `${metrics.weightedAvgTenor} days`, sub: "outstanding-weighted" },
    { label: "Top obligor concentration", value: `${metrics.topObligorPct.toFixed(0)}%`, sub: metrics.obligorConcentration[0]?.name ?? "—" },
  ];

  return (
    <>
      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value small">{c.value}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Aging</h2>
        <div style={{ padding: 16 }}>
          {aging.every((a) => a.outstanding === 0) ? (
            <div className="muted" style={{ fontSize: 13 }}>No outstanding receivables.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {aging.map((a) => (
                <div key={a.bucket} style={{ display: "grid", gridTemplateColumns: "110px 1fr 130px", alignItems: "center", gap: 12, fontSize: 13 }}>
                  <span className={a.bucket === "CURRENT" ? "muted" : ""} style={{ color: a.bucket !== "CURRENT" && a.outstanding > 0 ? "var(--red)" : undefined }}>{AGE_LABEL[a.bucket]}</span>
                  <div className="bar" style={{ height: 14, minWidth: 0 }}>
                    <span className={a.bucket === "CURRENT" ? "ok" : "hot"} style={{ width: `${(a.outstanding / agingMax) * 100}%` }} />
                  </div>
                  <span className="num" style={{ textAlign: "right" }}>{usd(a.outstanding)} <span className="muted">· {a.count}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <div className="panel">
          <h2 style={{ cursor: "pointer" }} onClick={() => setShowInvoice((s) => !s)}>Issue a client invoice {showInvoice ? "▾" : "▸"}</h2>
          {showInvoice && <AdHocInvoice sellers={sellers} />}
        </div>
      )}

      <div className="panel">
        <h2>Live receivables ({live.length})</h2>
        {rows.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">No receivables on the book yet — book one from the Transaction Flow or fund a batch.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th><th>Seller</th><th>Obligor</th><th>Product</th>
                  <th className="num">Outstanding</th><th>Maturity</th><th>Status</th><th className="num">Aging</th>
                  {canManage && <th>&nbsp;</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RowView key={r.id} r={r} canManage={canManage} asOf={asOf} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function RowView({ r, canManage, asOf, expanded, onToggle }: { r: RecRow; canManage: boolean; asOf: string; expanded: boolean; onToggle: () => void }) {
  const status = STATUS[r.status];
  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>{r.reference}{r.source === "BATCH" && <span className="badge grey" style={{ marginLeft: 6 }}>batch</span>}</td>
        <td>{r.sellerName}</td>
        <td>{r.obligorName}</td>
        <td><span className="badge grey">{r.productType}</span></td>
        <td className="num">{r.outstanding > 0 ? mm(r.outstanding) : "—"}{r.collected > 0 && r.outstanding > 0 && <span className="muted" style={{ fontSize: 11, display: "block" }}>of {mm(r.amount)}</span>}</td>
        <td>{dateShort(r.maturityDate)}</td>
        <td><span className={`badge ${status.cls}`}>{status.label}</span>{r.defaulted && r.workout && <span className="badge grey" style={{ marginLeft: 4 }}>{WORKOUTS.find((w) => w.v === r.workout)?.label}</span>}</td>
        <td className="num">{r.overdueDays > 0 ? <span style={{ color: "var(--red)" }}>{r.overdueDays}d</span> : r.status === "SETTLED" ? "—" : `${Math.max(0, r.daysToMaturity)}d`}</td>
        {canManage && <td><button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} type="button" onClick={onToggle}>{expanded ? "Close" : "Manage"}</button></td>}
      </tr>
      {expanded && canManage && (
        <tr>
          <td colSpan={9} style={{ background: "var(--bg)", padding: 0 }}>
            <RowActions r={r} asOf={asOf} />
          </td>
        </tr>
      )}
    </>
  );
}

function RowActions({ r, asOf }: { r: RecRow; asOf: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(Math.round(r.outstanding)));
  const [date, setDate] = useState(asOf);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [workout, setWorkout] = useState("RECOURSE_TO_SELLER");

  async function act(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/booked-transactions/${r.id}/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { router.refresh(); } else { const e = await res.json().catch(() => ({})); setMsg(e.error || "Action failed."); }
  }
  async function invoice(payload: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const err = await downloadPdf(payload);
    setBusy(false);
    if (err) setMsg(err);
  }

  const cell: React.CSSProperties = { padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end" };
  const grp: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };
  const inp: React.CSSProperties = { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 };

  return (
    <div style={cell}>
      {r.status !== "SETTLED" && !r.defaulted && (
        <div style={grp}>
          <span className="muted">Record collection</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...inp, width: 120 }} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" aria-label="Amount" />
            <input style={{ ...inp, width: 140 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input style={{ ...inp, width: 150 }} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" style={{ fontSize: 12 }} disabled={busy} onClick={() => act({ action: "collect", amount: Number(amount), date, note })}>Record</button>
          </div>
        </div>
      )}

      {r.overdueDays > 0 && (
        <div style={grp}>
          <span className="muted">Past due · {usd(r.additionalInterest)} additional interest</span>
          <button className="btn secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => invoice({ kind: "additional-interest", txnId: r.id, asOf })}>Additional-interest invoice (PDF)</button>
        </div>
      )}

      {r.status !== "SETTLED" && !r.defaulted && (
        <div style={grp}>
          <span className="muted">Declare default</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...inp, width: 180 }} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <select style={inp} value={workout} onChange={(e) => setWorkout(e.target.value)}>
              {WORKOUTS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
            </select>
            <button className="btn secondary" style={{ fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} disabled={busy || !reason.trim()} onClick={() => act({ action: "default", reason, workout })}>Declare</button>
          </div>
        </div>
      )}

      {r.defaulted && (
        <div style={grp}>
          <span className="muted">In workout ({WORKOUTS.find((w) => w.v === r.workout)?.label})</span>
          <div style={{ display: "flex", gap: 6 }}>
            {r.workout === "INSURANCE_CLAIM" && r.hasInsurer && !r.claimStatus && (
              <button className="btn secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => act({ action: "file-claim" })}>File insurance claim</button>
            )}
            {r.claimStatus === "FILED" && (
              <>
                <button className="btn" style={{ fontSize: 12 }} disabled={busy} onClick={() => act({ action: "decide-claim", status: "PAID" })}>Claim paid</button>
                <button className="btn secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => act({ action: "decide-claim", status: "DENIED" })}>Claim denied</button>
              </>
            )}
            {r.claimStatus && r.claimStatus !== "FILED" && <span className="badge grey">Claim {r.claimStatus.toLowerCase()}</span>}
            <button className="btn secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => act({ action: "clear-default" })}>Clear default (cured)</button>
          </div>
        </div>
      )}

      {r.hasInvestor && !r.investorSettled && (
        <div style={grp}>
          <span className="muted">Investor participation</span>
          <button className="btn secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => act({ action: "investor-settle" })}>Settle investor</button>
        </div>
      )}
      {r.hasInvestor && r.investorSettled && <span className="badge green" style={{ alignSelf: "center" }}>Investor settled</span>}

      {msg && <div style={{ color: "var(--red)", fontSize: 12, flexBasis: "100%" }}>{msg}</div>}
    </div>
  );
}

function AdHocInvoice({ sellers }: { sellers: { id: string; name: string }[] }) {
  const [billTo, setBillTo] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [items, setItems] = useState<{ description: string; amount: string }[]>([{ description: "", amount: "" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const total = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);

  function setItem(i: number, patch: Partial<{ description: string; amount: string }>) {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  async function generate() {
    setBusy(true); setMsg(null);
    const err = await downloadPdf({
      kind: "ad-hoc",
      billToName: billTo,
      sellerId: sellerId || undefined,
      lineItems: items.map((i) => ({ description: i.description, amount: Number(i.amount) || 0 })),
      notes: notes || undefined,
    });
    setBusy(false);
    if (err) setMsg(err);
  }

  const inp: React.CSSProperties = { padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, width: "100%" };
  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 720 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Sometimes a client requests an invoice to make a payment. Fill the bill-to and line items, then download a MUFG PDF to send.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <label className="muted" style={{ fontSize: 12 }}>Bill to</label>
          <input style={inp} value={billTo} onChange={(e) => setBillTo(e.target.value)} placeholder="Client / seller name" />
        </div>
        <div style={{ flex: "0 1 220px" }}>
          <label className="muted" style={{ fontSize: 12 }}>Note template (seller)</label>
          <select style={inp} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">Default</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <label className="muted" style={{ fontSize: 12 }}>Line items</label>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <input style={{ ...inp, flex: 3 }} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Description" />
            <input style={{ ...inp, flex: 1 }} value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} placeholder="Amount" inputMode="decimal" />
            {items.length > 1 && <button className="btn secondary" style={{ fontSize: 12 }} type="button" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        <button className="btn secondary" style={{ fontSize: 12, justifySelf: "start" }} type="button" onClick={() => setItems((a) => [...a, { description: "", amount: "" }])}>+ Add line</button>
      </div>
      <div>
        <label className="muted" style={{ fontSize: 12 }}>Notes (optional — overrides the template)</label>
        <input style={inp} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment instructions" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Total {usd(total)}</strong>
        <button className="btn" disabled={busy || !billTo.trim() || total <= 0} onClick={generate}>{busy ? "Generating…" : "Download invoice (PDF)"}</button>
      </div>
      {msg && <div style={{ color: "var(--red)", fontSize: 12 }}>{msg}</div>}
    </div>
  );
}
