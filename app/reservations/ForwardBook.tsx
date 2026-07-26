"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mm, dateShort } from "@/lib/format";
import CancelButton from "./CancelButton";
import EditReservationForm from "./EditReservationForm";
import type { ReservationStatus, ReservationKind, SwinglineDirection, ReservationScope } from "@/lib/types";

export interface BookRow {
  id: string;
  kind?: ReservationKind;
  swinglineDirection?: SwinglineDirection;
  sellerId: string;
  sellerName: string;
  obligorId: string;
  obligorName: string;
  amount: number;
  valueDate: string;
  maturityDate: string;
  tenorDays: number;
  pricingBps: number;
  status: ReservationStatus;
  scope?: ReservationScope;
  exception?: boolean;
  exceptionComment?: string;
  exceptionReasons?: string[];
  resolveByDate?: string;
  fulfilledByInvoice?: string;
}

// Funded transactions a reservation can be linked to (fulfilled by).
export interface TxnCandidate {
  invoiceNumber: string;
  sellerId: string;
  obligorId: string;
  amount: number;
  valueDate: string;
}

const STATUS_BADGE: Record<ReservationStatus, string> = {
  RESERVED: "orange",
  FUNDED: "green",
  MATURED: "grey",
  CANCELLED: "grey",
};

type SortKey = "seller" | "obligor";

interface CheckItem { category?: string; name?: string; checkName?: string; checkedAgainst?: string; txnValue?: string; status: string; severity: string; message: string }
interface CheckData { error?: string; kind?: string; decision?: string; checks?: CheckItem[]; report?: { decision: string; checks: CheckItem[]; advanceAmount?: number; tenorDays?: number } }

const SEV_BADGE: Record<string, string> = { GREEN: "green", YELLOW: "yellow", ORANGE: "orange", RED: "red", GREY: "grey" };
const CAT_ORDER = ["SELLER", "OBLIGOR", "ASR", "TRANSACTION", "DISTRIBUTION", "INSURANCE"];

export default function ForwardBook({ rows, candidates, canBook }: { rows: BookRow[]; candidates: TxnCandidate[]; canBook: boolean }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [pickInvoice, setPickInvoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkData, setCheckData] = useState<CheckData | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);

  async function viewChecks(id: string) {
    if (checkingId === id) { setCheckingId(null); setCheckData(null); return; }
    setCheckingId(id); setCheckData(null); setCheckBusy(true);
    const res = await fetch(`/api/reservations/${id}/check`);
    setCheckBusy(false);
    setCheckData(res.ok ? await res.json() : { error: (await res.json().catch(() => ({}))).error ?? "Failed to run checks." });
  }

  const matchesFor = (r: BookRow) => candidates.filter((c) => c.sellerId === r.sellerId && c.obligorId === r.obligorId);

  async function fulfill(id: string) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/reservations/${id}/fulfill`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoiceNumber: pickInvoice }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const breach = Array.isArray(data.breachReasons) && data.breachReasons.length ? ` Still breaching: ${data.breachReasons.join("; ")}.` : "";
      setErr((data.error ?? "Failed.") + breach);
      return;
    }
    setFulfillingId(null);
    setPickInvoice("");
    router.refresh();
  }

  function toggle(key: SortKey) {
    if (sortKey === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir("asc");
    }
  }

  const [fSeller, setFSeller] = useState("");
  const [fObligor, setFObligor] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  // Unique sellers / obligors that actually appear in the book (for the filters).
  const sellerOpts = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => r.sellerId && m.set(r.sellerId, r.sellerName));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const obligorOpts = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => r.obligorId && m.set(r.obligorId, r.obligorName));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (fSeller && r.sellerId !== fSeller) return false;
      if (fObligor && r.obligorId !== fObligor) return false;
      // Date period: keep reservations whose window overlaps [from, to].
      if (fFrom && r.maturityDate.slice(0, 10) < fFrom) return false;
      if (fTo && r.valueDate.slice(0, 10) > fTo) return false;
      return true;
    });
    if (!sortKey) return filtered;
    const name = (r: BookRow) => (sortKey === "seller" ? r.sellerName : r.obligorName);
    const factor = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => name(a).localeCompare(name(b)) * factor);
  }, [rows, sortKey, dir, fSeller, fObligor, fFrom, fTo]);

  const inp = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
  const anyFilter = fSeller || fObligor || fFrom || fTo;

  const arrow = (key: SortKey) => (sortKey === key ? (dir === "asc" ? " ▲" : " ▼") : "");
  const sortableTh = (key: SortKey, label: string) => (
    <th
      onClick={() => toggle(key)}
      style={{ cursor: "pointer", userSelect: "none" }}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      {arrow(key)}
    </th>
  );

  return (
    <>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "#fafbfd" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }} className="muted">Seller
        <select style={inp} value={fSeller} onChange={(e) => setFSeller(e.target.value)}>
          <option value="">All sellers</option>
          {sellerOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }} className="muted">Obligor
        <select style={inp} value={fObligor} onChange={(e) => setFObligor(e.target.value)}>
          <option value="">All obligors</option>
          {obligorOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }} className="muted">From
        <input style={inp} type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }} className="muted">To
        <input style={inp} type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
      </label>
      {anyFilter && (
        <button className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }} type="button"
          onClick={() => { setFSeller(""); setFObligor(""); setFFrom(""); setFTo(""); }}>Clear filters</button>
      )}
      <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{sorted.length} of {rows.length}</span>
    </div>
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            {sortableTh("seller", "Seller")}
            {sortableTh("obligor", "Obligor")}
            <th className="num">Amount</th>
            <th>Value date</th>
            <th>Maturity</th>
            <th className="num">Tenor</th>
            <th className="num">Pricing</th>
            <th>Status</th>
            <th>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isSwl = r.kind === "SWINGLINE";
            const signed = isSwl
              ? `${r.swinglineDirection === "INCREASE" ? "+" : "−"}${mm(r.amount)}`
              : mm(r.amount);
            return (
              <Fragment key={r.id}>
              <tr>
                <td>{r.id}</td>
                <td>
                  {isSwl ? (
                    <span className="badge orange">
                      Swingline {r.swinglineDirection === "INCREASE" ? "↑ increase" : "↓ reduction"}
                    </span>
                  ) : (
                    <span className="badge grey">Discount</span>
                  )}
                  {r.scope === "SELLER_ONLY" && <span className="badge yellow" style={{ marginLeft: 4 }} title="Blocks the seller line only">seller only</span>}
                  {r.scope === "OBLIGOR_ONLY" && <span className="badge yellow" style={{ marginLeft: 4 }} title="Blocks the obligor line only">obligor only</span>}
                </td>
                <td>{r.sellerId ? r.sellerName : <span className="muted">—</span>}</td>
                <td>{r.obligorId ? r.obligorName : <span className="muted">—</span>}</td>
                <td className="num">{signed}</td>
                <td>{dateShort(r.valueDate)}</td>
                <td>{dateShort(r.maturityDate)}</td>
                <td className="num">{r.tenorDays}d</td>
                <td className="num">{isSwl ? <span className="muted">—</span> : `${r.pricingBps}bps`}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  {r.fulfilledByInvoice && (
                    <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>→ {r.fulfilledByInvoice}</span>
                  )}
                  {r.exception && (
                    <span
                      className="badge red"
                      style={{ marginLeft: 6, cursor: "help" }}
                      title={r.exceptionComment ?? ""}
                    >
                      ⚠ exception
                    </span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="btn secondary"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      type="button"
                      onClick={() => viewChecks(r.id)}
                      title="View the full eligibility check for this reservation"
                    >
                      {checkingId === r.id ? "Close" : "Checks"}
                    </button>
                    {r.status === "RESERVED" && canBook && (
                      <>
                        <button
                          className="btn secondary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          type="button"
                          onClick={() => setEditingId((cur) => (cur === r.id ? null : r.id))}
                        >
                          {editingId === r.id ? "Close" : "Adjust"}
                        </button>
                        {r.kind !== "SWINGLINE" && (
                          <button
                            className="btn secondary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            type="button"
                            onClick={() => { setFulfillingId((cur) => (cur === r.id ? null : r.id)); setPickInvoice(""); setErr(null); }}
                          >
                            {fulfillingId === r.id ? "Close" : "Fulfill"}
                          </button>
                        )}
                        <CancelButton id={r.id} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
              {checkingId === r.id && (
                <tr>
                  <td colSpan={11} style={{ background: "#fafbfd", padding: 14 }}>
                    {checkBusy ? <span className="muted">Running full eligibility check…</span> : <CheckBreakdown data={checkData} />}
                  </td>
                </tr>
              )}
              {editingId === r.id && (
                <tr>
                  <td colSpan={11} style={{ padding: 12 }}>
                    <EditReservationForm reservation={r} onDone={() => setEditingId(null)} />
                  </td>
                </tr>
              )}
              {fulfillingId === r.id && (
                <tr>
                  <td colSpan={11} style={{ background: "#fafbfd", padding: 14 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Link {r.id} to the transaction that fulfilled it</div>
                    {err && <div className="notice err" style={{ marginBottom: 8 }}>{err}</div>}
                    {matchesFor(r).length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        No funded transaction found for {r.sellerName} / {r.obligorName} yet. Book/fund the transaction first, then link it here.
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          Funded transaction
                          <select
                            value={pickInvoice}
                            onChange={(e) => setPickInvoice(e.target.value)}
                            style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 14, minWidth: 320 }}
                          >
                            <option value="">Select a transaction…</option>
                            {matchesFor(r).map((c) => (
                              <option key={c.invoiceNumber} value={c.invoiceNumber}>
                                {c.invoiceNumber} · {mm(c.amount)} · {dateShort(c.valueDate)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="btn" type="button" disabled={busy || !pickInvoice} onClick={() => fulfill(r.id)}>
                          {busy ? "Linking…" : "Confirm & release reservation"}
                        </button>
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                      Confirming marks the reservation FUNDED and releases its reserved capacity — the transaction now carries the exposure.
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

const DEC_BADGE: Record<string, string> = { ELIGIBLE: "green", ELIGIBLE_WITH_WARNING: "yellow", EXCEPTION_REQUIRED: "orange", REJECTED: "red", OK: "green", WARN: "yellow", BLOCK: "red" };

// The full live eligibility breakdown for a reservation — every item, grouped by
// category, with what it was checked against and the transaction value.
function CheckBreakdown({ data }: { data: CheckData | null }) {
  if (!data) return <span className="muted">No data.</span>;
  if (data.error) return <div className="notice err">{data.error}</div>;

  // Standalone swingline reservation → a flat list of checks.
  if (data.kind === "SWINGLINE") {
    const checks = data.checks ?? [];
    return (
      <div>
        <div style={{ marginBottom: 8 }}><span className={`badge ${DEC_BADGE[data.decision ?? ""] ?? "grey"}`}>{data.decision}</span></div>
        <CheckTable rows={checks} />
      </div>
    );
  }

  const report = data.report;
  if (!report) return <span className="muted">No check available.</span>;
  const counts = { pass: report.checks.filter((c) => c.status === "PASS").length, warn: report.checks.filter((c) => c.status === "WARN").length, fail: report.checks.filter((c) => c.status === "FAIL").length, na: report.checks.filter((c) => c.status === "NA").length };
  const cats = [...new Set(report.checks.map((c) => c.category))].sort((a, b) => CAT_ORDER.indexOf(a ?? "") - CAT_ORDER.indexOf(b ?? ""));
  const CAT_LABEL: Record<string, string> = { SELLER: "Seller facility", OBLIGOR: "Obligor", ASR: "ASR approved obligor", TRANSACTION: "Transaction terms", DISTRIBUTION: "Distribution", INSURANCE: "Insurance" };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <span className={`badge ${DEC_BADGE[report.decision] ?? "grey"}`} style={{ fontSize: 13, padding: "4px 12px" }}>{report.decision.replace(/_/g, " ")}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {report.advanceAmount != null ? `Funded ${(report.advanceAmount / 1e6).toFixed(2)}MM · ` : ""}{report.tenorDays != null ? `tenor ${report.tenorDays}d · ` : ""}
          {counts.pass} pass · {counts.warn} warn · {counts.fail} fail · {counts.na} n/a
        </span>
        <span className="muted" style={{ fontSize: 11 }}>(live — reflects the reservation&rsquo;s current details)</span>
      </div>
      {cats.map((cat) => (
        <div key={cat} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, margin: "6px 0 3px" }}>{CAT_LABEL[cat ?? ""] ?? cat}</div>
          <CheckTable rows={report.checks.filter((c) => c.category === cat)} />
        </div>
      ))}
    </div>
  );
}

function CheckTable({ rows }: { rows: CheckItem[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Check</th><th>Checked against</th><th>Transaction</th><th>Result</th><th>Detail</th></tr></thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{c.name ?? c.checkName}</td>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>{c.checkedAgainst ?? "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{c.txnValue ?? "—"}</td>
              <td><span className={`badge ${SEV_BADGE[c.severity] ?? "grey"}`}>{c.status}</span></td>
              <td className="muted" style={{ whiteSpace: "normal", minWidth: 220 }}>{c.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
