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
  revenue: number; // MUFG revenue = margin-only income (base rate excluded)
  customerDiscount: number; // full price reduction to the client (margin + base)
  valueDate: string;
  maturityDate: string;
  tenorDays: number;
  marginPct: number; // margin only, as a percent (the revenue yield)
}

// Every realized revenue deal: booked transactions + funded batch invoices.
// Revenue is MARGIN-ONLY (the base rate is MUFG's funding cost, not income);
// commitmentFee from priceDeal is exactly coverage × margin × tenor/360.
export function allRevenueDeals(): RevDeal[] {
  const deals: RevDeal[] = [];

  for (const t of listBookedTransactions()) {
    const tenor = daysBetween(t.valueDate, t.maturityDate);
    const p = priceDeal({ productType: t.productType, marginBps: t.pricingBps, coverage: t.amount, tenorDays: tenor });
    deals.push({ source: "BOOKED", id: t.id, sellerId: t.sellerId, obligorId: t.obligorId, productType: t.productType, coverage: t.amount, revenue: p.commitmentFee, customerDiscount: t.productType === "UTRC" ? p.commitmentFee : p.discount, valueDate: t.valueDate, maturityDate: t.maturityDate, tenorDays: tenor, marginPct: t.pricingBps / 100 });
  }

  for (const d of fundedDeals({})) {
    const tenor = daysBetween(d.valueDate, d.maturityDate);
    // Margin-only revenue when the invoice carried a margin; else fall back to the booked discount fee.
    const t = tenor / 360;
    const revenue = d.marginBps != null && t > 0 ? d.coverage * (d.marginBps / 10000) * t : d.revenue;
    deals.push({ source: "BATCH", id: d.invoiceNumber, sellerId: d.sellerId, obligorId: d.obligorId, productType: "DTR", coverage: d.coverage, revenue, customerDiscount: d.revenue, valueDate: d.valueDate, maturityDate: d.maturityDate, tenorDays: tenor, marginPct: d.marginBps != null ? d.marginBps / 100 : (d.coverage > 0 && t > 0 ? (d.revenue / (d.coverage * t)) * 100 : 0) });
  }

  return deals;
}

// Daily accrual: revenue is earned pro-rata over the tenor, not at maturity. As
// of a date, accrued = revenue × elapsed/tenor (clamped 0..1). Before the value
// date nothing is earned; after maturity it is fully earned.
export function accruedRevenue(deals: RevDeal[], asOf: string): { contracted: number; accrued: number; unearned: number } {
  let contracted = 0, accrued = 0;
  for (const d of deals) {
    contracted += d.revenue;
    const elapsed = daysBetween(d.valueDate, asOf);
    const frac = d.tenorDays > 0 ? Math.max(0, Math.min(1, elapsed / d.tenorDays)) : (elapsed >= 0 ? 1 : 0);
    accrued += d.revenue * frac;
  }
  return { contracted, accrued, unearned: contracted - accrued };
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
    wSum += d.marginPct * d.coverage;
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
