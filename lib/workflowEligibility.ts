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

// Re-run eligibility on a workflow's live parameters. The reservation it realises
// is excluded from availability (it is being replaced, so it must not count
// against itself). Returns whether it clears (ELIGIBLE / ELIGIBLE_WITH_WARNING)
// and the blocking reasons if not. checkDiscount is synchronous, so the temporary
// reservation status change is restored before anything else observes it.
export function evaluateTxn(txn: DiscountTransaction, reservationId?: string): { clears: boolean; decision: string; reasons: string[] } {
  const rsv = reservationId ? getReservation(reservationId) : undefined;
  const prev = rsv?.status;
  if (rsv) rsv.status = "CANCELLED";
  let report;
  try {
    report = checkDiscount(txn);
  } finally {
    if (rsv && prev) rsv.status = prev;
  }
  const clears = report.decision === "ELIGIBLE" || report.decision === "ELIGIBLE_WITH_WARNING";
  return { clears, decision: report.decision, reasons: blockingChecks(report.checks).map((c) => c.message) };
}

export function evaluateWorkflow(wf: TransactionWorkflow): { clears: boolean; decision: string; reasons: string[] } {
  return evaluateTxn(buildWorkflowTxn(wf), wf.reservationId);
}
