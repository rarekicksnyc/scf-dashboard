import { listBookedTransactions, getReservations } from "@/lib/data/store";
import { daysBetween } from "@/lib/format";
import { DAY_COUNT_BASIS } from "@/lib/config";
import type { Reservation } from "@/lib/types";

// A booked ("current") deal — a live receivable from the single ledger, whether
// it originated in the Transaction Flow or a funded batch invoice.
export interface Deal {
  invoiceNumber: string;
  sellerId: string;
  obligorId: string;
  amount: number; // invoice face amount
  advanceRate: number; // 0..1
  coverage: number; // funded amount = invoice amount x advance rate
  revenue: number; // customer discount fee on the deal (margin + base)
  marginBps?: number; // margin (for margin-only revenue), when on the invoice
  bookedDate: string; // when the transaction was booked
  valueDate: string; // requested discount / value date
  maturityDate: string; // due date
  batchId: string; // provenance: originating batch id, or the booking id
}

// Funded deals for a seller and/or obligor, drawn from the single ledger.
export function fundedDeals(filter: { sellerId?: string; obligorId?: string }): Deal[] {
  const deals: Deal[] = [];
  for (const t of listBookedTransactions()) {
    if (filter.sellerId && t.sellerId !== filter.sellerId) continue;
    if (filter.obligorId && t.obligorId !== filter.obligorId) continue;
    const advanceRate = t.advanceRate ?? 1;
    const tenor = daysBetween(t.valueDate, t.maturityDate);
    const tt = Math.max(tenor, 0) / DAY_COUNT_BASIS;
    // Customer discount fee = coverage × (margin + base) × tenor/360.
    const discount = t.amount * ((t.pricingBps / 10000) + (t.baseRatePct ?? 0) / 100) * tt;
    deals.push({
      invoiceNumber: t.invoiceNumber ?? t.reference ?? t.id,
      sellerId: t.sellerId,
      obligorId: t.obligorId,
      amount: t.faceAmount ?? t.amount,
      advanceRate,
      coverage: t.amount,
      revenue: discount,
      marginBps: t.pricingBps,
      bookedDate: t.bookedAt,
      valueDate: t.valueDate,
      maturityDate: t.maturityDate,
      batchId: t.batchId ?? t.id,
    });
  }
  return deals;
}

export interface RevenueRow {
  id: string;
  deals: number;
  volume: number; // total funded amount
  revenue: number; // total discount fee earned
}

// Revenue aggregated by seller or by obligor across every funded deal.
export function revenueBy(dimension: "seller" | "obligor"): RevenueRow[] {
  const map = new Map<string, RevenueRow>();
  for (const d of fundedDeals({})) {
    const id = dimension === "seller" ? d.sellerId : d.obligorId;
    const row = map.get(id) ?? { id, deals: 0, volume: 0, revenue: 0 };
    row.deals += 1;
    row.volume += d.amount;
    row.revenue += d.revenue;
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export function dealsByBooked(filter: { sellerId?: string; obligorId?: string }): Deal[] {
  return fundedDeals(filter).sort((a, b) => Date.parse(a.bookedDate) - Date.parse(b.bookedDate));
}

export function dealsByMaturity(filter: { sellerId?: string; obligorId?: string }): Deal[] {
  return fundedDeals(filter).sort((a, b) => Date.parse(a.maturityDate) - Date.parse(b.maturityDate));
}

// Upcoming (active) reservations for a seller and/or obligor, soonest value date first.
export function upcomingReservations(filter: { sellerId?: string; obligorId?: string }): Reservation[] {
  return getReservations()
    .filter(
      (r) =>
        r.status === "RESERVED" &&
        (!filter.sellerId || r.sellerId === filter.sellerId) &&
        (!filter.obligorId || r.obligorId === filter.obligorId),
    )
    .sort((a, b) => Date.parse(a.valueDate) - Date.parse(b.valueDate));
}
