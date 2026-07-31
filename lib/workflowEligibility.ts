import { checkDiscount } from "@/lib/engine/eligibility";
import { getReservation } from "@/lib/data/store";
import { blockingChecks } from "@/lib/format";
import type { DiscountTransaction, TransactionWorkflow } from "@/lib/types";

// Build the eligibility transaction for a workflow (DTR or UTRC).
export function buildWorkflowTxn(wf: TransactionWorkflow): DiscountTransaction {
  const isUtrc = wf.productType === "UTRC";
  return {
    sellerId: wf.sellerId,
    obligorId: wf.obligorId,
    obligorEntityId: wf.obligorEntityId,
    invoiceNumber: wf.reference,
    invoiceAmount: wf.amount,
    currency: wf.currency,
    invoiceType: "FINAL",
    advanceRate: isUtrc ? 1 : wf.advanceRate,
    valueDate: wf.valueDate,
    maturityDate: wf.maturityDate,
    pricingBps: wf.pricingBps,
    productType: wf.productType,
    committedAmount: isUtrc ? wf.amount : undefined,
    commitmentDueDate: wf.commitmentDueDate,
    finalDemandDate: wf.finalDemandDate,
    distributed: false,
    insured: false,
  };
}

// Run the eligibility engine with one reservation excluded from availability —
// it is being realised (booked), so it must not count against itself. The
// temporary status change is synchronous and restored in `finally`, before
// anything else can observe it. Returns the FULL report (for previews/booking).
export function checkDiscountExcluding(txn: DiscountTransaction, reservationId?: string): ReturnType<typeof checkDiscount> {
  const rsv = reservationId ? getReservation(reservationId) : undefined;
  const prev = rsv?.status;
  if (rsv) rsv.status = "CANCELLED";
  try {
    return checkDiscount(txn);
  } finally {
    if (rsv && prev) rsv.status = prev;
  }
}

// Re-run eligibility on a workflow's live parameters, excluding the reservation
// it realises. Returns whether it clears (ELIGIBLE / ELIGIBLE_WITH_WARNING) and
// the blocking reasons if not.
export function evaluateTxn(txn: DiscountTransaction, reservationId?: string): { clears: boolean; decision: string; reasons: string[] } {
  const report = checkDiscountExcluding(txn, reservationId);
  const clears = report.decision === "ELIGIBLE" || report.decision === "ELIGIBLE_WITH_WARNING";
  return { clears, decision: report.decision, reasons: blockingChecks(report.checks).map((c) => c.message) };
}

export function evaluateWorkflow(wf: TransactionWorkflow): { clears: boolean; decision: string; reasons: string[] } {
  return evaluateTxn(buildWorkflowTxn(wf), wf.reservationId);
}
