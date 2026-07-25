import { getReservations, getBatches, listBookedTransactions } from "@/lib/data/store";
import type { ScheduleEvent } from "@/lib/types";

// ---------------------------------------------------------------------------
// Builds the forward calendar of exposure events from the reservation book and
// funded batch invoices: fundings (value dates), swingline draws, and expected
// repayments (maturities). This is how current exposure is tracked against
// future expected exposure over time.
// ---------------------------------------------------------------------------

export function buildScheduleEvents(): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];

  for (const r of getReservations()) {
    // Only OPEN reservations are forward exposure. A fulfilled (FUNDED)
    // reservation has become a real transaction — it is represented by its
    // funded invoice below, so including it here would double-count the deal.
    if (r.status !== "RESERVED") continue;

    // Standalone swingline movement — one event on its value date.
    if (r.kind === "SWINGLINE") {
      events.push({
        date: r.valueDate,
        type: "SWINGLINE_DRAW",
        amount: r.amount,
        sellerId: r.sellerId,
        obligorId: r.obligorId,
        refId: r.id,
        label: `Swingline ${r.swinglineDirection === "INCREASE" ? "increase" : "reduction"} ${r.id}`,
      });
      continue;
    }

    events.push({
      date: r.valueDate,
      type: "FUNDING",
      amount: r.amount,
      sellerId: r.sellerId,
      obligorId: r.obligorId,
      refId: r.id,
      label: `Reserved discount ${r.id}`,
    });
    if (r.usesSwingline) {
      events.push({
        date: r.valueDate,
        type: "SWINGLINE_DRAW",
        amount: r.amount,
        sellerId: r.sellerId,
        obligorId: r.obligorId,
        refId: r.id,
        label: `Swingline draw ${r.id}`,
      });
    }
    events.push({
      date: r.maturityDate,
      type: "REPAYMENT",
      amount: r.amount,
      sellerId: r.sellerId,
      obligorId: r.obligorId,
      refId: r.id,
      label: `Expected repayment ${r.id}`,
    });
  }

  // Booked transactions — real outstanding, time-phased: a funding on the value
  // date and an expected repayment on the maturity date, just like the batch.
  for (const t of listBookedTransactions()) {
    events.push({ date: t.valueDate, type: "FUNDING", amount: t.amount, sellerId: t.sellerId, obligorId: t.obligorId, refId: t.id, label: `Booked ${t.reference} (${t.id})` });
    events.push({ date: t.maturityDate, type: "REPAYMENT", amount: t.amount, sellerId: t.sellerId, obligorId: t.obligorId, refId: t.id, label: `Repayment ${t.reference}` });
  }

  // Funded batch invoices contribute a funding (value date) and an expected
  // repayment (due date).
  for (const batch of getBatches()) {
    for (const res of batch.results) {
      if (!res.funding) continue;
      const inv = res.invoice;
      events.push({
        date: inv.requestedDiscountDate,
        type: "FUNDING",
        amount: inv.amount,
        sellerId: inv.sellerId,
        obligorId: inv.obligorId,
        refId: inv.invoiceNumber,
        label: `Funded ${inv.invoiceNumber}`,
      });
      events.push({
        date: inv.dueDate,
        type: "REPAYMENT",
        amount: inv.amount,
        sellerId: inv.sellerId,
        obligorId: inv.obligorId,
        refId: inv.invoiceNumber,
        label: `Expected repayment ${inv.invoiceNumber}`,
      });
    }
  }

  return events;
}

// Events grouped by day (YYYY-MM-DD) for a given year/month (month is 1-12).
export function eventsByDay(year: number, month: number): Map<string, ScheduleEvent[]> {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const byDay = new Map<string, ScheduleEvent[]>();
  for (const e of buildScheduleEvents()) {
    if (!e.date.startsWith(prefix)) continue;
    const arr = byDay.get(e.date) ?? [];
    arr.push(e);
    byDay.set(e.date, arr);
  }
  return byDay;
}
