"use client";

import { Fragment, useMemo, useState } from "react";
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
}

const STATUS_BADGE: Record<ReservationStatus, string> = {
  RESERVED: "orange",
  FUNDED: "green",
  MATURED: "grey",
  CANCELLED: "grey",
};

type SortKey = "seller" | "obligor";

export default function ForwardBook({ rows, canBook }: { rows: BookRow[]; canBook: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<string | null>(null);

  function toggle(key: SortKey) {
    if (sortKey === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const name = (r: BookRow) => (sortKey === "seller" ? r.sellerName : r.obligorName);
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => name(a).localeCompare(name(b)) * factor);
  }, [rows, sortKey, dir]);

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
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
