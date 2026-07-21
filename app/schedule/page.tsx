import Link from "next/link";
import { eventsByDay } from "@/lib/schedule";
import { getSeller, getObligor } from "@/lib/data/store";
import { mm } from "@/lib/format";
import type { ScheduleEvent, ScheduleEventType } from "@/lib/types";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
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
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const m = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : "2026-07";
  const year = Number(m.slice(0, 4));
  const month = Number(m.slice(5, 7));

  const byDay = eventsByDay(year, month);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Month totals by type.
  const totals: Record<ScheduleEventType, number> = {
    FUNDING: 0,
    REPAYMENT: 0,
    SWINGLINE_DRAW: 0,
  };
  for (const evs of byDay.values())
    for (const e of evs) totals[e.type] += e.amount;

  function pair(e: ScheduleEvent): string {
    const s = getSeller(e.sellerId)?.name ?? e.sellerId;
    const o = getObligor(e.obligorId)?.name ?? e.obligorId;
    return `${s} → ${o}`;
  }

  return (
    <>
      <h1 className="page-title">Reservation Schedule</h1>
      <p className="page-sub">
        Forward calendar of exposure events — expected fundings, swingline draws,
        and repayments from the reservation book and funded batches.
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">Fundings this month</div>
          <div className="value small">{mm(totals.FUNDING)}</div>
        </div>
        <div className="card">
          <div className="label">Expected repayments</div>
          <div className="value small">{mm(totals.REPAYMENT)}</div>
        </div>
        <div className="card">
          <div className="label">Swingline draws</div>
          <div className="value small">{mm(totals.SWINGLINE_DRAW)}</div>
        </div>
      </div>

      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <Link className="btn secondary" href={`/schedule?month=${shift(year, month, -1)}`}>
          ← Previous
        </Link>
        <strong style={{ fontSize: 16 }}>
          {MONTHS[month - 1]} {year}
        </strong>
        <Link className="btn secondary" href={`/schedule?month=${shift(year, month, 1)}`}>
          Next →
        </Link>
      </div>

      <div className="calendar">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-head">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const key = d
            ? `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
            : `blank-${i}`;
          const evs = d ? (byDay.get(key) ?? []) : [];
          return (
            <div key={key} className={`cal-cell ${d ? "" : "cal-empty"}`}>
              {d && <div className="cal-day">{d}</div>}
              {evs.map((e, j) => (
                <div key={j} className={`cal-ev ${TYPE_CLASS[e.type]}`} title={`${TYPE_LABEL[e.type]}: ${pair(e)} ${mm(e.amount)}`}>
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
        <span className="cal-ev ev-swingline" style={{ position: "static" }}>Swingline draw</span>
      </div>
    </>
  );
}
