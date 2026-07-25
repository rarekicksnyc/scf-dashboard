import { getSeller, getObligor } from "@/lib/data/store";
import { usd } from "@/lib/format";
import {
  allRevenueDeals,
  revenueSummary,
  revenueByMonth,
  revenueByEntity,
  pipelineRevenue,
  batchCount,
} from "@/lib/revenue";
import RevenueTabs, { type RevRow } from "./RevenueTabs";
import MonthlyRevenueChart from "./MonthlyRevenueChart";

export const dynamic = "force-dynamic";

export default function RevenuePage() {
  const deals = allRevenueDeals();
  const sum = revenueSummary(deals);
  const monthly = revenueByMonth(deals);
  const pipeline = pipelineRevenue();
  const sellers: RevRow[] = revenueByEntity(deals, "seller").map((r) => ({ ...r, name: getSeller(r.id)?.name ?? r.id }));
  const obligors: RevRow[] = revenueByEntity(deals, "obligor").map((r) => ({ ...r, name: getObligor(r.id)?.name ?? r.id }));

  const share = (v: number) => (sum.revenue > 0 ? (v / sum.revenue) * 100 : 0);
  const dtrPct = share(sum.dtrRevenue);
  const utrcPct = share(sum.utrcRevenue);

  const cards = [
    { label: "Realized revenue", value: usd(sum.revenue), sub: `${sum.deals} deal${sum.deals === 1 ? "" : "s"} · ${usd(sum.volume)} funded` },
    { label: "Pipeline revenue", value: usd(pipeline.revenue), sub: `${pipeline.deals} open reservation${pipeline.deals === 1 ? "" : "s"} · ${usd(pipeline.volume)}` },
    { label: "Weighted yield", value: `${sum.weightedMarginBps} bps`, sub: "coverage-weighted, annualized" },
    { label: "Volume funded", value: usd(sum.volume), sub: "realized coverage" },
    { label: "Deals booked", value: String(sum.deals), sub: `${batchCount()} batch${batchCount() === 1 ? "" : "es"} + bookings` },
  ];

  return (
    <>
      <h1 className="page-title">Revenue</h1>
      <p className="page-sub">
        Discount and commitment-fee income across booked transactions and funded
        batches, plus the projected revenue sitting in the forward reservation book.
        Realized revenue: {usd(sum.revenue)}; pipeline: {usd(pipeline.revenue)}.
      </p>

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
        <h2>Revenue mix</h2>
        <div style={{ padding: 16 }}>
          {sum.revenue > 0 ? (
            <>
              {/* DTR vs UTRC share — a two-segment proportion bar with a surface
                  gap; identity carried by the labels below, not colour alone. */}
              <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", gap: 2, background: "var(--bg)" }}>
                {dtrPct > 0 && <div style={{ width: `${dtrPct}%`, background: "var(--green)" }} title={`DTR ${usd(sum.dtrRevenue)}`} />}
                {utrcPct > 0 && <div style={{ width: `${utrcPct}%`, background: "var(--orange)" }} title={`UTRC ${usd(sum.utrcRevenue)}`} />}
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 10, flexWrap: "wrap", fontSize: 13 }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--green)", marginRight: 6 }} />DTR discount income <strong>{usd(sum.dtrRevenue)}</strong> <span className="muted">({dtrPct.toFixed(0)}%)</span></span>
                <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--orange)", marginRight: 6 }} />UTRC commitment fees <strong>{usd(sum.utrcRevenue)}</strong> <span className="muted">({utrcPct.toFixed(0)}%)</span></span>
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>No realized revenue yet.</div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
            <MixTile label="From bookings" value={usd(sum.bookedRevenue)} sub="Transaction Flow" />
            <MixTile label="From batches" value={usd(sum.batchRevenue)} sub="bulk uploads" />
            <MixTile label="DTR income" value={usd(sum.dtrRevenue)} sub="discount on purchase" />
            <MixTile label="UTRC income" value={usd(sum.utrcRevenue)} sub="commitment fees" />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Revenue by month</h2>
        <div style={{ padding: 16 }}>
          <MonthlyRevenueChart data={monthly} />
        </div>
      </div>

      <RevenueTabs sellers={sellers} obligors={obligors} />
    </>
  );
}

function MixTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{value}</div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
