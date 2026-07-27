import { getBatches, listBookedTransactions, getReservations } from "@/lib/data/store";
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
  skimRevenue: number; // extra income on the investor portion = (COF − interp SOFR + skim)
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
    const skimRev = inv > 0 && t.baseRatePct != null && t.investorSofrPct != null
      ? inv * (((t.baseRatePct - t.investorSofrPct) / 100) + (t.skimBps ?? 0) / 10000) * tt
      : 0;
    const p = priceDeal({ productType: t.productType, marginBps: t.pricingBps, coverage: t.amount, tenorDays: tenor });
    deals.push({ source: t.source === "BATCH" ? "BATCH" : "BOOKED", id: t.id, sellerId: t.sellerId, obligorId: t.obligorId, productType: t.productType, coverage: t.amount, revenue: marginRev, skimRevenue: skimRev, customerDiscount: t.productType === "UTRC" ? p.commitmentFee : p.discount, valueDate: t.valueDate, maturityDate: t.maturityDate, tenorDays: tenor, marginPct: t.pricingBps / 100 });
  }

  return deals;
}

// Daily accrual: revenue is earned pro-rata over the tenor, not at maturity. As
// of a date, accrued = revenue × elapsed/tenor (clamped 0..1). Before the value
// date nothing is earned; after maturity it is fully earned.
export function accruedRevenue(deals: RevDeal[], asOf: string): { contracted: number; accrued: number; unearned: number } {
  let contracted = 0, accrued = 0;
  for (const d of deals) {
    const income = d.revenue + d.skimRevenue;
    contracted += income;
    const elapsed = daysBetween(d.valueDate, asOf);
    const frac = d.tenorDays > 0 ? Math.max(0, Math.min(1, elapsed / d.tenorDays)) : (elapsed >= 0 ? 1 : 0);
    accrued += income * frac;
  }
  return { contracted, accrued, unearned: contracted - accrued };
}

export interface RevenueSummary {
  revenue: number; // margin income
  skimRevenue: number; // extra income from investor participations
  total: number; // revenue + skim
  volume: number;
  deals: number;
  weightedMarginBps: number; // coverage-weighted effective yield, in bps
  dtrRevenue: number;
  utrcRevenue: number;
  bookedRevenue: number;
  batchRevenue: number;
}

export function revenueSummary(deals: RevDeal[]): RevenueSummary {
  let revenue = 0, skim = 0, volume = 0, dtr = 0, utrc = 0, booked = 0, batch = 0, wSum = 0;
  for (const d of deals) {
    const income = d.revenue + d.skimRevenue;
    revenue += d.revenue;
    skim += d.skimRevenue;
    volume += d.coverage;
    wSum += d.marginPct * d.coverage;
    if (d.productType === "UTRC") utrc += income; else dtr += income;
    if (d.source === "BOOKED") booked += income; else batch += income;
  }
  return {
    revenue, skimRevenue: skim, total: revenue + skim, volume, deals: deals.length,
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
    row.revenue += d.revenue + d.skimRevenue;
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
    row.revenue += d.revenue + d.skimRevenue;
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
  for (const d of deals) sum += (d.revenue + d.skimRevenue) * Math.max(0, frac(d, to) - frac(d, from));
  return sum;
}
