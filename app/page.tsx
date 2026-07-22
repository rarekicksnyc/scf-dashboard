import Link from "next/link";
import { limitViews } from "@/lib/data/store";
import { sellerExposure, obligorExposure } from "@/lib/exposure";
import { buildExpirations, expiryCounts } from "@/lib/expirations";
import { mm } from "@/lib/format";
import ExposureTabs from "./ExposureTabs";
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

  const byType = (t: LimitType) => views.filter((v) => v.limit.type === t);
  const sumApproved = (t: LimitType) =>
    byType(t).reduce((a, v) => a + v.approvedLimit, 0);
  const sumAvailable = (t: LimitType) =>
    byType(t).reduce((a, v) => a + v.available, 0);
  const sumConsumed = (t: LimitType) =>
    byType(t).reduce((a, v) => a + v.consumed, 0);

  const cards = [
    { label: "Seller capacity", value: mm(sumAvailable("SELLER")), sub: `of ${mm(sumApproved("SELLER"))} approved` },
    { label: "Obligor exposure", value: mm(sumConsumed("OBLIGOR")), sub: `${mm(sumAvailable("OBLIGOR"))} headroom` },
    { label: "Swingline capacity", value: mm(sumAvailable("SWINGLINE")), sub: `of ${mm(sumApproved("SWINGLINE"))} approved` },
    { label: "Investor capacity", value: mm(sumAvailable("INVESTOR")), sub: `of ${mm(sumApproved("INVESTOR"))} approved` },
    { label: "Insurance capacity", value: mm(sumAvailable("INSURANCE")), sub: `of ${mm(sumApproved("INSURANCE"))} approved` },
  ];

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

      <div className="cards">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value small">{c.value}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>

      <ExposureTabs sellers={sellers} obligors={obligors} asOf={asOf ?? ""} aggregate={aggregate} today={today} />
    </>
  );
}
