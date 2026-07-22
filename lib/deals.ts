import { getBatches, getReservations } from "@/lib/data/store";
import type { Reservation } from "@/lib/types";

// A booked ("current") deal — a funded invoice from a batch.
export interface Deal {
  invoiceNumber: string;
  sellerId: string;
  obligorId: string;
  amount: number; // invoice face amount
  advanceRate: number; // 0..1
  coverage: number; // funded amount = invoice amount x advance rate
  revenue: number; // discount fee earned on the deal
  bookedDate: string; // when the batch was booked (uploaded)
  valueDate: string; // requested discount / value date
  maturityDate: string; // due date
  batchId: string;
}

// Funded deals for a seller and/or obligor, drawn from every batch.
export function fundedDeals(filter: { sellerId?: string; obligorId?: string }): Deal[] {
  const deals: Deal[] = [];
  for (const batch of getBatches()) {
    if (filter.sellerId && batch.sellerId !== filter.sellerId) continue;
    for (const r of batch.results) {
      if (!r.funding) continue; // only funded / current deals
      if (filter.sellerId && r.invoice.sellerId !== filter.sellerId) continue;
      if (filter.obligorId && r.invoice.obligorId !== filter.obligorId) continue;
      const advanceRate = r.invoice.advanceRate ?? 1;
      deals.push({
        invoiceNumber: r.invoice.invoiceNumber,
        sellerId: r.invoice.sellerId,
        obligorId: r.invoice.obligorId,
        amount: r.invoice.amount,
        advanceRate,
        coverage: r.invoice.coverageAmount ?? r.invoice.amount * advanceRate,
        revenue: r.discountFee,
        bookedDate: batch.uploadedAt,
        valueDate: r.invoice.requestedDiscountDate,
        maturityDate: r.invoice.dueDate,
        batchId: batch.batchId,
      });
    }
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
