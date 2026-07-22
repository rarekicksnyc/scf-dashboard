"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mm, dateShort } from "@/lib/format";
import CancelButton from "./CancelButton";
import EditReservationForm from "./EditReservationForm";
import type { ReservationStatus, ReservationKind, SwinglineDirection } from "@/lib/types";

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

export default function ForwardBook({ rows, candidates, canBook }: { rows: BookRow[]; candidates: TxnCandidate[]; canBook: boolean }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [pickInvoice, setPickInvoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      setErr((await res.json()).error ?? "Failed.");
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
                      title={`Soft-warning exception: ${r.exceptionComment ?? ""}${
                        r.resolveByDate ? `\nResolve by: ${r.resolveByDate}` : ""
                      }${r.exceptionReasons?.length ? `\nDid not clear: ${r.exceptionReasons.join("; ")}` : ""}`}
                    >
                      ⚠ exception
                    </span>
                  )}
                </td>
                <td>
                  {r.status === "RESERVED" && canBook ? (
                    <div style={{ display: "flex", gap: 6 }}>
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
                    </div>
                  ) : null}
                </td>
              </tr>
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
