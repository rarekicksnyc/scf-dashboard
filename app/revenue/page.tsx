import { Fragment } from "react";
import { getSeller, getObligor } from "@/lib/data/store";
import { usd, dateShort } from "@/lib/format";
import {
  allRevenueDeals,
  revenueSummary,
  revenueByMonth,
  pipelineRevenue,
  accruedRevenue,
  fiscalYearStart,
  earnedBetween,
  dealIncome,
  policyPremiumStatus,
} from "@/lib/revenue";
import RevenueExplorer, { type ExplorerDeal } from "./RevenueExplorer";
import MonthlyRevenueChart from "./MonthlyRevenueChart";

export const dynamic = "force-dynamic";

export default function RevenuePage() {
  const today = new Date().toISOString().slice(0, 10);
  const deals = allRevenueDeals();
  const sum = revenueSummary(deals);
  const monthly = revenueByMonth(deals);
  const pipeline = pipelineRevenue();
  const accrual = accruedRevenue(deals, today);
  const accruedPct = accrual.contracted > 0 ? Math.max(0, Math.min(100, (accrual.accrued / accrual.contracted) * 100)) : 0;
  const fyStart = fiscalYearStart(today);
  const fytdEarned = earnedBetween(deals, fyStart, today);
  const explorerDeals: ExplorerDeal[] = deals.map((d) => ({
    sellerId: d.sellerId,
    sellerName: getSeller(d.sellerId)?.name ?? d.sellerId,
    obligorId: d.obligorId,
    obligorName: getObligor(d.obligorId)?.name ?? d.obligorId,
    income: dealIncome(d),
    valueDate: d.valueDate,
    tenorDays: d.tenorDays,
  }));
  const premiumStatus = policyPremiumStatus(today);

  const share = (v: number) => (sum.total > 0 ? (v / sum.total) * 100 : 0);
  const dtrPct = share(sum.dtrRevenue);
  const utrcPct = share(sum.utrcRevenue);

  const cards = [
    { label: "Earned revenue (FYTD)", value: usd(fytdEarned), sub: `fiscal year since ${dateShort(fyStart)}` },
    { label: "Realized revenue", value: usd(sum.total), sub: `${usd(sum.revenue)} margin + ${usd(sum.skimRevenue)} investor skim + ${usd(sum.insurerSkimRevenue)} insurer skim` },
    { label: "Investor skim", value: usd(sum.skimRevenue), sub: `${usd(sum.fundingBasisRevenue)} funding basis + ${usd(sum.marginSkimRevenue)} margin skim` },
    { label: "Insurer skim", value: usd(sum.insurerSkimRevenue), sub: "client rate − insurer rate on insured deals" },
    { label: "Pipeline revenue", value: usd(pipeline.revenue), sub: `${pipeline.deals} open reservation${pipeline.deals === 1 ? "" : "s"} · ${usd(pipeline.volume)}` },
    { label: "Weighted yield", value: `${sum.weightedMarginBps} bps`, sub: "coverage-weighted, annualized" },
    { label: "Volume funded", value: usd(sum.volume), sub: `${sum.deals} deals · realized coverage` },
  ];

  return (
    <>
      <h1 className="page-title">Revenue</h1>
      <p className="page-sub">
        MUFG revenue is margin income (base rate is funding cost, not income) plus
        investor skim (funding basis + margin skim) and insurer skim, earned daily
        over each deal&rsquo;s tenor. Total contracted: {usd(sum.total)} ({usd(sum.revenue)} margin +{" "}
        {usd(sum.skimRevenue)} investor skim + {usd(sum.insurerSkimRevenue)} insurer skim);
        earned to date: {usd(accrual.accrued)}; pipeline: {usd(pipeline.revenue)}.
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
        <h2>Revenue accrual</h2>
        <div style={{ padding: 16 }}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: "90ch" }}>
            Revenue accrues daily over the tenor — the margin income is not realized until each deal matures
            and the coverage is repaid. As of {today}.
          </p>
          <div className="bar" style={{ height: 12, minWidth: 0 }}>
            <span className="ok" style={{ width: `${accruedPct}%` }} />
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 10, flexWrap: "wrap", fontSize: 13 }}>
            <span>Contracted <strong>{usd(accrual.contracted)}</strong></span>
            <span style={{ color: "var(--green)" }}>Earned to date <strong>{usd(accrual.accrued)}</strong> ({accruedPct.toFixed(0)}%)</span>
            <span className="muted">Unearned (remaining) <strong>{usd(accrual.unearned)}</strong></span>
          </div>
        </div>
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
            <MixTile label="Margin income" value={usd(sum.revenue)} sub="retained margin" />
            <MixTile label="Funding basis" value={usd(sum.fundingBasisRevenue)} sub="COF − SOFR on investor portion" />
            <MixTile label="Margin skim" value={usd(sum.marginSkimRevenue)} sub="negotiated investor skim (bps)" />
            <MixTile label="Insurer skim" value={usd(sum.insurerSkimRevenue)} sub="client rate − insurer rate" />
            <MixTile label="From bookings" value={usd(sum.bookedRevenue)} sub="Transaction Flow" />
            <MixTile label="From batches" value={usd(sum.batchRevenue)} sub="bulk uploads" />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Revenue by month</h2>
        <div style={{ padding: 16 }}>
          <MonthlyRevenueChart data={monthly} />
        </div>
      </div>

      {premiumStatus.length > 0 && (
        <div className="panel">
          <h2>Insurance minimum premium (fiscal year)</h2>
          <div style={{ padding: "0 16px 4px" }} className="muted">
            <p style={{ fontSize: 13, maxWidth: "95ch" }}>
              Each insured deal generates premium on the insurer-rate side. If a policy&rsquo;s cumulative
              premium falls short of its annual minimum by fiscal year end, the shortfall is topped up
              (remitted to the insurer — MUFG takes no skim on it). When a policy covers more than one seller,
              the top-up is split across them pro-rata to the premium each generated (shown as sub-rows).
              FY since {dateShort(fyStart)}.
            </p>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Insurer / seller</th><th>Policy</th><th className="num">Minimum premium</th><th className="num">Generated FYTD</th><th className="num">Shortfall (top-up)</th><th>Status</th></tr></thead>
              <tbody>
                {premiumStatus.map((p) => {
                  const pctToMin = p.minimumPremium > 0 ? Math.min(100, (p.generatedFYTD / p.minimumPremium) * 100) : 100;
                  const met = p.shortfall <= 0;
                  return (
                    <Fragment key={p.policyId}>
                      <tr>
                        <td style={{ fontWeight: 600 }}>{p.insurerName}</td>
                        <td><code style={{ fontSize: 12 }}>{p.policyNumber}</code></td>
                        <td className="num">{usd(p.minimumPremium)}</td>
                        <td className="num">
                          {usd(p.generatedFYTD)}
                          <div className="bar" style={{ height: 6, marginTop: 4, minWidth: 80 }}><span className={met ? "ok" : "warn"} style={{ width: `${pctToMin}%` }} /></div>
                        </td>
                        <td className="num" style={{ fontWeight: 700, color: met ? "var(--green)" : "var(--orange)" }}>{met ? "—" : usd(p.shortfall)}</td>
                        <td>{met ? <span className="badge green">Minimum met</span> : <span className="badge orange">Top-up due</span>}</td>
                      </tr>
                      {/* Per-seller attribution — each seller's share of the shortfall, pro-rata to the premium it generated. */}
                      {p.sellers.map((s) => (
                        <tr key={`${p.policyId}:${s.sellerId}`} style={{ background: "var(--bg)" }}>
                          <td style={{ paddingLeft: 22 }} className="muted">↳ {getSeller(s.sellerId)?.name ?? s.sellerId}</td>
                          <td></td>
                          <td></td>
                          <td className="num muted">{usd(s.generated)}</td>
                          <td className="num" style={met ? undefined : { color: "var(--orange)" }}>{met ? "—" : usd(s.topUp)}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{p.generatedFYTD > 0 ? `${((s.generated / p.generatedFYTD) * 100).toFixed(0)}% of usage` : ""}</td>
                        </tr>
                      ))}
                      {!met && p.sellers.length === 0 && (
                        <tr style={{ background: "var(--bg)" }}>
                          <td colSpan={6} className="muted" style={{ paddingLeft: 22, fontSize: 12 }}>No insured usage yet — the full minimum is outstanding and not yet attributed to a seller.</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RevenueExplorer deals={explorerDeals} fyStart={fyStart} today={today} />
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
