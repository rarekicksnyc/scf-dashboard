import { revenueBy } from "@/lib/deals";
import { getSeller, getObligor } from "@/lib/data/store";
import { mm } from "@/lib/format";
import RevenueTabs, { type RevRow } from "./RevenueTabs";

export const dynamic = "force-dynamic";

export default function RevenuePage() {
  const sellers: RevRow[] = revenueBy("seller").map((r) => ({
    ...r,
    name: getSeller(r.id)?.name ?? r.id,
  }));
  const obligors: RevRow[] = revenueBy("obligor").map((r) => ({
    ...r,
    name: getObligor(r.id)?.name ?? r.id,
  }));
  const totalRev = sellers.reduce((a, r) => a + r.revenue, 0);

  return (
    <>
      <h1 className="page-title">Revenue</h1>
      <p className="page-sub">
        Discount / fee revenue earned on funded deals, aggregated per seller line
        and per obligor line. Total earned: {mm(totalRev)}.
      </p>
      <RevenueTabs sellers={sellers} obligors={obligors} />
    </>
  );
}
