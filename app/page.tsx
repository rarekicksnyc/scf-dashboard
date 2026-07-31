import Link from "next/link";
import { limitViews, listKpiTiles, listBookedTransactions } from "@/lib/data/store";
import { sellerExposure, obligorExposure } from "@/lib/exposure";
import { buildExpirations, expiryCounts } from "@/lib/expirations";
import { bookedInWindow, outstandingFraction } from "@/lib/receivables";
import { computeKpis } from "@/lib/creator/run";
import { expectedOutstandingByDate } from "@/lib/projection";
import ExposureTabs, { type PortfolioDeal } from "./ExposureTabs";
import type { LimitType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { asOf: asOfParam } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  // The portfolio defaults to a TODAY (current) time-phased view: a reservation
  // only consumes a limit while today falls inside its [valueDate, maturityDate]
  // window, so future reservations do NOT reduce current capacity. `asOf=all`
  // switches to the aggregate of every commitment regardless of date; any
  // explicit date shows that single instant.
  const aggregate = asOfParam === "all";
  const asOf = aggregate ? undefined : asOfParam || today;
  const views = limitViews(asOf);
  const sellers = sellerExposure(asOf);
  const obligors = obligorExposure(asOf);
  const exp = expiryCounts(buildExpirations(today));
  const expAlert = exp.expired + exp.within30 + exp.within60;
  const kpiTiles = computeKpis(listKpiTiles());
  // Peak concurrent funded principal over the next year — the time-phased peak,
  // unlike the aggregate view which sums all commitments regardless of date.
  const proj = expectedOutstandingByDate(today, 365);
  const peakOutstanding = Math.max(0, ...Object.values(proj));

  const byType = (t: LimitType) => views.filter((v) => v.limit.type === t);
  const sumAvailable = (t: LimitType) => byType(t).reduce((a, v) => a + v.available, 0);
  // Investor / insurance headroom is program-wide (per investor / policy), so it is
  // passed as the shared headroom; the outstanding side is filtered per selection.
  const investorAvail = sumAvailable("INVESTOR");
  const insuranceAvail = sumAvailable("INSURANCE");
  // Per-deal investor / insured exposure live on the as-of date, for the boxes to
  // filter by the selected sellers/obligors (scaled by outstanding fraction).
  const win = asOf ? { from: asOf, to: asOf } : undefined;
  const deals: PortfolioDeal[] = listBookedTransactions()
    .filter((t) => aggregate || bookedInWindow(t, win))
    .map((t) => {
      const frac = outstandingFraction(t);
      const insured = (t.insurerAllocations ?? []).reduce((a, x) => a + x.amount, 0);
      return { sellerId: t.sellerId, obligorId: t.obligorId, investor: Math.round((t.investorAmount ?? 0) * frac), insured: Math.round(insured * frac) };
    });

  return (
    <>
      <h1 className="page-title">Portfolio Exposure</h1>
      <p className="page-sub">
        Outstanding and reserved capacity against every seller and obligor limit,
        time-phased: a reservation only consumes a limit while the as-of date
        falls inside its value-to-maturity window. The view defaults to today, so
        future reservations do not reduce current capacity — use the date picker
        to see any point in time, or Aggregate for every commitment at once.
      </p>

      {expAlert > 0 && (
        <div className="notice" style={{ background: "var(--orange-bg)", color: "var(--orange)" }}>
          <strong>{exp.expired} expired</strong> · {exp.within30} expiring within 30 days ·{" "}
          {exp.within60} within 60 days.{" "}
          <Link href="/expirations" style={{ fontWeight: 700, textDecoration: "underline" }}>
            Review expirations →
          </Link>
        </div>
      )}

      {kpiTiles.length > 0 && (
        <div className="panel">
          <h2>Custom KPIs</h2>
          <div className="cards" style={{ padding: 16 }}>
            {kpiTiles.map((k) => (
              <div className="card" key={k.id}>
                <div className="label">{k.label}</div>
                <div className="value small" style={k.error ? { color: "var(--red)", fontSize: 14 } : undefined}>{k.error ? "—" : k.formatted}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ExposureTabs sellers={sellers} obligors={obligors} deals={deals} investorAvail={investorAvail} insuranceAvail={insuranceAvail} peak={peakOutstanding} asOf={asOf ?? ""} aggregate={aggregate} today={today} />
    </>
  );
}
