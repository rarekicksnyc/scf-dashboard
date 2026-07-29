import { getBatches, listBookedTransactions, getReservations, activePolicies } from "@/lib/data/store";
import { priceDeal } from "@/lib/pricing";
import { daysBetween } from "@/lib/format";
import type { ProductType } from "@/lib/types";

// A single revenue-bearing deal, unified across booked transactions (the
// Transaction Flow) and funded batch invoices.
export interface RevDeal {
  source: "BOOKED" | "BATCH";
  id: string;
  sellerId: string;
  obligorId: string;
  productType: ProductType;
  coverage: number; // funded amount
  revenue: number; // MUFG margin income (on the bank-retained portion for investor deals)
  skimRevenue: number; // total extra income on the investor portion = fundingBasis + marginSkim
  fundingBasisRevenue: number; // COF − interpolated SOFR on the investor portion (funding-spread income)
  marginSkimRevenue: number; // the negotiated margin skim (skimBps) on the investor portion
  insurerSkimRevenue: number; // insured portion × (client insurance rate − insurer rate), over tenor
  customerDiscount: number; // full price reduction to the client (margin + base)
  valueDate: string;
  maturityDate: string;
  tenorDays: number;
  marginPct: number; // margin only, as a percent (the revenue yield)
}

// Every realized revenue deal, read from the SINGLE bookedTransactions ledger
// (Transaction-Flow bookings and materialised batch invoices both live there).
// Revenue is MARGIN-ONLY (the base rate is MUFG's funding cost, not income);
// commitmentFee from priceDeal is exactly coverage × margin × tenor/360.
export function allRevenueDeals(): RevDeal[] {
  const deals: RevDeal[] = [];

  for (const t of listBookedTransactions()) {
    const tenor = daysBetween(t.valueDate, t.maturityDate);
    const tt = tenor / 360;
    const inv = t.investorAmount ?? 0;
    // On the bank-retained portion the bank keeps margin; on the investor portion
    // the margin cancels (client pays margin, investor gets margin − skim) and the
    // bank keeps the skim plus the COF−SOFR rate differential.
    const marginRev = Math.max(t.amount - inv, 0) * (t.pricingBps / 10000) * tt;
    // Investor income has two distinct sources: the funding basis (bank funds the
    // client at COF but pays the investor only the interpolated SOFR) and the
    // negotiated margin skim (skimBps of margin the bank retains). Gate both on the
    // rates being present so the total matches the prior single-figure skim exactly.
    const hasInv = inv > 0 && t.baseRatePct != null && t.investorSofrPct != null;
    const fundingBasisRev = hasInv ? inv * ((t.baseRatePct! - t.investorSofrPct!) / 100) * tt : 0;
    const marginSkimRev = hasInv ? inv * ((t.skimBps ?? 0) / 10000) * tt : 0;
    const skimRev = fundingBasisRev + marginSkimRev;
    // Insurer skim: on each insured allocation MUFG charges the client the insurance
    // rate but pays the insurer a lower rate, keeping the spread over the tenor.
    const insurerSkimRev = (t.insurerAllocations ?? []).reduce(
      (a, x) => a + x.amount * ((((x.clientRateBps ?? 0) - (x.insurerRateBps ?? 0)) / 10000)) * tt, 0);
    const p = priceDeal({ productType: t.productType, marginBps: t.pricingBps, coverage: t.amount, tenorDays: tenor });
    deals.push({ source: t.source === "BATCH" ? "BATCH" : "BOOKED", id: t.id, sellerId: t.sellerId, obligorId: t.obligorId, productType: t.productType, coverage: t.amount, revenue: marginRev, skimRevenue: skimRev, fundingBasisRevenue: fundingBasisRev, marginSkimRevenue: marginSkimRev, insurerSkimRevenue: insurerSkimRev, customerDiscount: t.productType === "UTRC" ? p.commitmentFee : p.discount, valueDate: t.valueDate, maturityDate: t.maturityDate, tenorDays: tenor, marginPct: t.pricingBps / 100 });
  }

  return deals;
}

// Total MUFG income on a deal: retained margin + investor skim (funding basis +
// margin skim) + insurer skim. The single definition of "income" used by every
// rollup, so accrual, monthly, by-entity, and FYTD can never disagree.
export function dealIncome(d: RevDeal): number {
  return d.revenue + d.skimRevenue + d.insurerSkimRevenue;
}

// Daily accrual: revenue is earned pro-rata over the tenor, not at maturity. As
// of a date, accrued = revenue × elapsed/tenor (clamped 0..1). Before the value
// date nothing is earned; after maturity it is fully earned.
export function accruedRevenue(deals: RevDeal[], asOf: string): { contracted: number; accrued: number; unearned: number } {
  let contracted = 0, accrued = 0;
  for (const d of deals) {
    const income = dealIncome(d);
    contracted += income;
    const elapsed = daysBetween(d.valueDate, asOf);
    const frac = d.tenorDays > 0 ? Math.max(0, Math.min(1, elapsed / d.tenorDays)) : (elapsed >= 0 ? 1 : 0);
    accrued += income * frac;
  }
  return { contracted, accrued, unearned: contracted - accrued };
}

export interface RevenueSummary {
  revenue: number; // margin income
  skimRevenue: number; // extra income from investor participations (funding basis + margin skim)
  fundingBasisRevenue: number; // COF − SOFR funding-spread component of skim
  marginSkimRevenue: number; // negotiated margin-skim component of skim
  insurerSkimRevenue: number; // spread kept on insured portions (client rate − insurer rate)
  total: number; // revenue + investor skim + insurer skim
  volume: number;
  deals: number;
  weightedMarginBps: number; // coverage-weighted effective yield, in bps
  dtrRevenue: number;
  utrcRevenue: number;
  bookedRevenue: number;
  batchRevenue: number;
}

export function revenueSummary(deals: RevDeal[]): RevenueSummary {
  let revenue = 0, skim = 0, basis = 0, mSkim = 0, iSkim = 0, volume = 0, dtr = 0, utrc = 0, booked = 0, batch = 0, wSum = 0;
  for (const d of deals) {
    const income = dealIncome(d);
    revenue += d.revenue;
    skim += d.skimRevenue;
    basis += d.fundingBasisRevenue;
    mSkim += d.marginSkimRevenue;
    iSkim += d.insurerSkimRevenue;
    volume += d.coverage;
    wSum += d.marginPct * d.coverage;
    if (d.productType === "UTRC") utrc += income; else dtr += income;
    if (d.source === "BOOKED") booked += income; else batch += income;
  }
  return {
    revenue, skimRevenue: skim, fundingBasisRevenue: basis, marginSkimRevenue: mSkim, insurerSkimRevenue: iSkim,
    total: revenue + skim + iSkim, volume, deals: deals.length,
    weightedMarginBps: volume > 0 ? Math.round((wSum / volume) * 100) : 0,
    dtrRevenue: dtr, utrcRevenue: utrc, bookedRevenue: booked, batchRevenue: batch,
  };
}

// Revenue grouped by calendar month of the value date (YYYY-MM), chronological.
export function revenueByMonth(deals: RevDeal[]): { month: string; revenue: number; volume: number; deals: number }[] {
  const map = new Map<string, { month: string; revenue: number; volume: number; deals: number }>();
  for (const d of deals) {
    const month = (d.valueDate || "").slice(0, 7);
    if (!month) continue;
    const row = map.get(month) ?? { month, revenue: 0, volume: 0, deals: 0 };
    row.revenue += dealIncome(d);
    row.volume += d.coverage;
    row.deals += 1;
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface RevenueEntityRow { id: string; deals: number; volume: number; revenue: number; yieldBps: number }

export function revenueByEntity(deals: RevDeal[], dim: "seller" | "obligor"): RevenueEntityRow[] {
  const map = new Map<string, { id: string; deals: number; volume: number; revenue: number; wSum: number }>();
  for (const d of deals) {
    const id = dim === "seller" ? d.sellerId : d.obligorId;
    const row = map.get(id) ?? { id, deals: 0, volume: 0, revenue: 0, wSum: 0 };
    row.deals += 1;
    row.volume += d.coverage;
    row.revenue += dealIncome(d);
    row.wSum += d.marginPct * d.coverage;
    map.set(id, row);
  }
  return [...map.values()]
    .map((r) => ({ id: r.id, deals: r.deals, volume: r.volume, revenue: r.revenue, yieldBps: r.volume > 0 ? Math.round((r.wSum / r.volume) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

// Projected revenue from the open forward book (reservations not yet booked),
// priced as DTR discounts over each reservation's tenor.
export function pipelineRevenue(): { revenue: number; volume: number; deals: number } {
  let revenue = 0, volume = 0, deals = 0;
  for (const r of getReservations()) {
    if (r.status !== "RESERVED" || r.kind === "SWINGLINE") continue;
    const tenor = daysBetween(r.valueDate, r.maturityDate);
    const p = priceDeal({ productType: "DTR", marginBps: r.pricingBps, coverage: r.amount, tenorDays: tenor });
    revenue += p.commitmentFee; // margin-only projected revenue
    volume += r.amount;
    deals += 1;
  }
  return { revenue, volume, deals };
}

export function batchCount(): number {
  return getBatches().length;
}

// The bank's fiscal year runs 1 April → 31 March. Returns the 1-April start of
// the fiscal year that contains asOf.
export function fiscalYearStart(asOf: string): string {
  const d = new Date(asOf);
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1; // April is month index 3
  return `${startYear}-04-01`;
}

export interface PolicyPremiumStatus {
  policyId: string;
  insurerName: string;
  policyNumber: string;
  minimumPremium: number;
  generatedFYTD: number; // insurer-rate premium generated by deals funded this fiscal year
  shortfall: number; // max(0, minimum − generated) — the seller's year-end top-up
  fyStart: string;
}

// Per-policy minimum-premium tracking over the bank's fiscal year (4/1–3/31).
// Each insured deal generates premium on the INSURER-rate side; a policy whose
// cumulative premium falls short of its annual minimum bills the seller a
// year-end top-up equal to the shortfall (pass-through to the insurer — MUFG
// takes no skim on the top-up). Premium is measured over each deal's tenor and
// attributed to the fiscal year the deal is funded in.
export function policyPremiumStatus(asOf: string): PolicyPremiumStatus[] {
  const fyStart = fiscalYearStart(asOf);
  const gen = new Map<string, number>();
  for (const t of listBookedTransactions()) {
    if (!t.insurerAllocations?.length) continue;
    if (t.valueDate < fyStart || t.valueDate > asOf) continue;
    const tt = daysBetween(t.valueDate, t.maturityDate) / 360;
    for (const a of t.insurerAllocations) {
      gen.set(a.policyId, (gen.get(a.policyId) ?? 0) + a.amount * ((a.insurerRateBps ?? 0) / 10000) * tt);
    }
  }
  return activePolicies()
    .filter((p) => (p.minimumPremium ?? 0) > 0)
    .map((p) => {
      const generatedFYTD = gen.get(p.id) ?? 0;
      return { policyId: p.id, insurerName: p.insurerName, policyNumber: p.policyNumber, minimumPremium: p.minimumPremium!, generatedFYTD, shortfall: Math.max(0, p.minimumPremium! - generatedFYTD), fyStart };
    });
}

// Income (margin + skim) EARNED between two dates. Revenue accrues daily over
// each deal's tenor, so the amount earned in [from, to] is the change in the
// accrued fraction across that window, summed over every deal. Used for FYTD and
// any period figure.
export function earnedBetween(deals: RevDeal[], from: string, to: string): number {
  const frac = (d: RevDeal, at: string) =>
    d.tenorDays > 0
      ? Math.max(0, Math.min(1, daysBetween(d.valueDate, at) / d.tenorDays))
      : (daysBetween(d.valueDate, at) >= 0 ? 1 : 0);
  let sum = 0;
  for (const d of deals) sum += dealIncome(d) * Math.max(0, frac(d, to) - frac(d, from));
  return sum;
}
