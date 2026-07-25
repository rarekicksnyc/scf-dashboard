import { getBatches, listBookedTransactions, getReservations } from "@/lib/data/store";
import { fundedDeals } from "@/lib/deals";
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
  revenue: number; // discount (DTR) or commitment fee (UTRC) earned
  valueDate: string;
  maturityDate: string;
  yieldPct: number; // effective annualized yield on the coverage
}

function effYield(revenue: number, coverage: number, tenorDays: number): number {
  const t = tenorDays / 360;
  return coverage > 0 && t > 0 ? (revenue / (coverage * t)) * 100 : 0;
}

// Every realized revenue deal: booked transactions + funded batch invoices.
export function allRevenueDeals(): RevDeal[] {
  const deals: RevDeal[] = [];

  for (const t of listBookedTransactions()) {
    const tenor = daysBetween(t.valueDate, t.maturityDate);
    const p = priceDeal({ productType: t.productType, marginBps: t.pricingBps, coverage: t.amount, tenorDays: tenor });
    const revenue = t.productType === "UTRC" ? p.commitmentFee : p.discount;
    deals.push({ source: "BOOKED", id: t.id, sellerId: t.sellerId, obligorId: t.obligorId, productType: t.productType, coverage: t.amount, revenue, valueDate: t.valueDate, maturityDate: t.maturityDate, yieldPct: p.allInRatePct });
  }

  for (const d of fundedDeals({})) {
    const tenor = daysBetween(d.valueDate, d.maturityDate);
    deals.push({ source: "BATCH", id: d.invoiceNumber, sellerId: d.sellerId, obligorId: d.obligorId, productType: "DTR", coverage: d.coverage, revenue: d.revenue, valueDate: d.valueDate, maturityDate: d.maturityDate, yieldPct: effYield(d.revenue, d.coverage, tenor) });
  }

  return deals;
}

export interface RevenueSummary {
  revenue: number;
  volume: number;
  deals: number;
  weightedMarginBps: number; // coverage-weighted effective yield, in bps
  dtrRevenue: number;
  utrcRevenue: number;
  bookedRevenue: number;
  batchRevenue: number;
}

export function revenueSummary(deals: RevDeal[]): RevenueSummary {
  let revenue = 0, volume = 0, dtr = 0, utrc = 0, booked = 0, batch = 0, wSum = 0;
  for (const d of deals) {
    revenue += d.revenue;
    volume += d.coverage;
    wSum += d.yieldPct * d.coverage;
    if (d.productType === "UTRC") utrc += d.revenue; else dtr += d.revenue;
    if (d.source === "BOOKED") booked += d.revenue; else batch += d.revenue;
  }
  return {
    revenue, volume, deals: deals.length,
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
    row.revenue += d.revenue;
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
    row.revenue += d.revenue;
    row.wSum += d.yieldPct * d.coverage;
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
    revenue += p.discount;
    volume += r.amount;
    deals += 1;
  }
  return { revenue, volume, deals };
}

export function batchCount(): number {
  return getBatches().length;
}
