"use client";

import { useMemo, useState } from "react";
import { mm } from "@/lib/format";
import type { ScheduleEvent, ScheduleEventType } from "@/lib/types";

interface Opt {
  id: string;
  name: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_CLASS: Record<ScheduleEventType, string> = {
  FUNDING: "ev-funding",
  REPAYMENT: "ev-repayment",
  SWINGLINE_DRAW: "ev-swingline",
};
const TYPE_LABEL: Record<ScheduleEventType, string> = {
  FUNDING: "Funding",
  REPAYMENT: "Repayment",
  SWINGLINE_DRAW: "Swingline",
};

function shift(year: number, month: number, delta: number): string {
  let m = month + delta;
  let y = year;
  if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function ScheduleCalendar({
  events,
  sellers,
  obligors,
  defaultMonth,
}: {
  events: ScheduleEvent[];
  sellers: Opt[];
  obligors: Opt[];
  defaultMonth: string;
}) {
  const [ym, setYm] = useState(defaultMonth);
  const [selSellers, setSelSellers] = useState<Set<string>>(new Set());
  const [selObligors, setSelObligors] = useState<Set<string>>(new Set());

  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sellers) m[s.id] = s.name;
    for (const o of obligors) m[o.id] = o.name;
    return m;
  }, [sellers, obligors]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const monthEvents = useMemo(() => {
    const prefix = `${ym}-`;
    return events.filter(
      (e) =>
        e.date.startsWith(prefix) &&
        (selSellers.size === 0 || selSellers.has(e.sellerId)) &&
        (selObligors.size === 0 || selObligors.has(e.obligorId)),
    );
  }, [events, ym, selSellers, selObligors]);

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of monthEvents) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [monthEvents]);

  const totals: Record<ScheduleEventType, number> = { FUNDING: 0, REPAYMENT: 0, SWINGLINE_DRAW: 0 };
  for (const e of monthEvents) totals[e.type] += e.amount;

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const chip = (o: Opt, on: boolean, onClick: () => void) => (
    <button
      key={o.id}
      type="button"
      onClick={onClick}
      className={`badge ${on ? "green" : "grey"}`}
      style={{ cursor: "pointer", border: "none" }}
    >
      {o.name}
    </button>
  );

  return (
    <>
      <div className="panel">
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12, minWidth: 60 }}>Sellers:</span>
            {sellers.map((s) => chip(s, selSellers.has(s.id), () => toggle(selSellers, setSelSellers, s.id)))}
            {selSellers.size > 0 && (
              <button className="btn secondary" style={{ padding: "2px 8px", fontSize: 11 }} type="button" onClick={() => setSelSellers(new Set())}>clear</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12, minWidth: 60 }}>Obligors:</span>
            {obligors.map((o) => chip(o, selObligors.has(o.id), () => toggle(selObligors, setSelObligors, o.id)))}
            {selObligors.size > 0 && (
              <button className="btn secondary" style={{ padding: "2px 8px", fontSize: 11 }} type="button" onClick={() => setSelObligors(new Set())}>clear</button>
            )}
          </div>
        </div>
      </div>

      <div className="cards">
        <div className="card"><div className="label">Fundings this month</div><div className="value small">{mm(totals.FUNDING)}</div></div>
        <div className="card"><div className="label">Expected repayments</div><div className="value small">{mm(totals.REPAYMENT)}</div></div>
        <div className="card"><div className="label">Swingline movements</div><div className="value small">{mm(totals.SWINGLINE_DRAW)}</div></div>
      </div>

      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <button className="btn secondary" type="button" onClick={() => setYm(shift(year, month, -1))}>← Previous</button>
        <strong style={{ fontSize: 16 }}>{MONTHS[month - 1]} {year}</strong>
        <button className="btn secondary" type="button" onClick={() => setYm(shift(year, month, 1))}>Next →</button>
      </div>

      <div className="calendar">
        {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
        {cells.map((d, i) => {
          const key = d ? `${ym}-${String(d).padStart(2, "0")}` : `blank-${i}`;
          const evs = d ? (byDay.get(key) ?? []) : [];
          return (
            <div key={key} className={`cal-cell ${d ? "" : "cal-empty"}`}>
              {d && <div className="cal-day">{d}</div>}
              {evs.map((e, j) => (
                <div
                  key={j}
                  className={`cal-ev ${TYPE_CLASS[e.type]}`}
                  title={`${TYPE_LABEL[e.type]}: ${(names[e.sellerId] ?? e.sellerId) || "—"} → ${(names[e.obligorId] ?? e.obligorId) || "—"} ${mm(e.amount)}`}
                >
                  {TYPE_LABEL[e.type]} {mm(e.amount)}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="row-actions" style={{ marginTop: 14 }}>
        <span className="cal-ev ev-funding" style={{ position: "static" }}>Funding</span>
        <span className="cal-ev ev-repayment" style={{ position: "static" }}>Repayment</span>
        <span className="cal-ev ev-swingline" style={{ position: "static" }}>Swingline</span>
      </div>
    </>
  );
}
