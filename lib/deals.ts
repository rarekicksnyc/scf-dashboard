import { getBatches, getReservations } from "@/lib/data/store";
import type { Reservation } from "@/lib/types";

// A booked ("current") deal — a funded invoice from a batch.
export interface Deal {
  invoiceNumber: string;
  sellerId: string;
  obligorId: string;
  amount: number;
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
      deals.push({
        invoiceNumber: r.invoice.invoiceNumber,
        sellerId: r.invoice.sellerId,
        obligorId: r.invoice.obligorId,
        amount: r.invoice.amount,
        bookedDate: batch.uploadedAt,
        valueDate: r.invoice.requestedDiscountDate,
        maturityDate: r.invoice.dueDate,
        batchId: batch.batchId,
      });
    }
  }
  return deals;
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
