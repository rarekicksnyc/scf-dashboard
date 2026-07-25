"use client";

import { useState } from "react";
import { usd } from "@/lib/format";

interface MonthRow { month: string; revenue: number; volume: number; deals: number }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function label(m: string) {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm) - 1] ?? mm} '${(y ?? "").slice(2)}`;
}
function compact(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

// Single-series magnitude-over-time: revenue by month. One hue (revenue green),
// thin bars with rounded tops on the baseline, recessive axes, per-bar hover.
export default function MonthlyRevenueChart({ data }: { data: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) {
    return <div className="muted" style={{ padding: 24, fontSize: 13 }}>No realized revenue yet — book a transaction or run a batch.</div>;
  }

  const H = 240, padTop = 24, padBottom = 34, plotH = H - padTop - padBottom;
  const slot = 64, barW = 30;
  const W = Math.max(data.length * slot + 40, 320);
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const y = (v: number) => padTop + plotH - (v / max) * plotH;

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: "100%", fontFamily: "inherit" }} role="img" aria-label="Revenue by month">
        {/* recessive gridlines + y labels */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={38} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={34} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--ink-soft)">{compact(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const bx = 40 + i * slot + (slot - barW) / 2;
          const top = y(d.revenue);
          const h = padTop + plotH - top;
          const on = hover === i;
          return (
            <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              {/* wide invisible hit target */}
              <rect x={40 + i * slot} y={padTop} width={slot} height={plotH} fill="transparent" />
              <rect x={bx} y={top} width={barW} height={Math.max(h, 1)} rx={4} fill="var(--green)" opacity={on ? 1 : 0.9} />
              <text x={bx + barW / 2} y={top - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">{compact(d.revenue)}</text>
              <text x={bx + barW / 2} y={H - 16} textAnchor="middle" fontSize={10} fill="var(--ink-soft)">{label(d.month)}</text>
            </g>
          );
        })}
        <line x1={38} x2={W} y1={padTop + plotH} y2={padTop + plotH} stroke="var(--ink-soft)" strokeWidth={1.5} />
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", top: 6, right: 10, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow)", padding: "8px 12px", fontSize: 12, pointerEvents: "none" }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{label(data[hover].month)}</div>
          <div>Revenue: <strong>{usd(data[hover].revenue)}</strong></div>
          <div className="muted">Volume {usd(data[hover].volume)} · {data[hover].deals} deal{data[hover].deals === 1 ? "" : "s"}</div>
        </div>
      )}
    </div>
  );
}
