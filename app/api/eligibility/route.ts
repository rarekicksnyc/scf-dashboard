import { NextResponse } from "next/server";
import { checkDiscount } from "@/lib/engine/eligibility";
import type { DiscountTransaction } from "@/lib/types";

// Run one discount transaction through the consolidated eligibility engine.
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Partial<DiscountTransaction> | null;
  const isUtrc = b?.productType === "UTRC";
  // DTR needs an invoice amount; UTRC needs a committed amount.
  const primaryAmount = isUtrc ? Number(b?.committedAmount) : Number(b?.invoiceAmount);
  if (!b || !b.sellerId || !b.obligorId || !(primaryAmount > 0)) {
    return NextResponse.json(
      { error: isUtrc ? "Expected sellerId, obligorId, committedAmount." : "Expected sellerId, obligorId, invoiceAmount." },
      { status: 400 },
    );
  }

  const txn: DiscountTransaction = {
    sellerId: b.sellerId,
    obligorId: b.obligorId,
    obligorEntityId: b.obligorEntityId || undefined,
    rrlAmount: Number(b.rrlAmount) || 0,
    invoiceNumber: b.invoiceNumber ?? "TXN",
    invoiceAmount: Number(b.invoiceAmount) || 0,
    currency: b.currency ?? "USD",
    invoiceType: b.invoiceType ?? "FINAL",
    advanceRate: Number(b.advanceRate) || 1,
    valueDate: b.valueDate ?? "2026-08-01",
    maturityDate: b.maturityDate ?? "2026-11-01",
    pricingBps: Number(b.pricingBps) || 0,
    productType: isUtrc ? "UTRC" : "DTR",
    committedAmount: isUtrc ? Number(b.committedAmount) || 0 : undefined,
    commitmentDueDate: isUtrc ? b.commitmentDueDate || undefined : undefined,
    finalDemandDate: isUtrc ? b.finalDemandDate || undefined : undefined,
    baseRateType: b.baseRateType ?? "SOFR",
    baseRate: Number(b.baseRate) || 0,
    distributed: Boolean(b.distributed),
    investorAllocations: Array.isArray(b.investorAllocations)
      ? b.investorAllocations
          .filter((a) => a && a.investorId)
          .map((a) => ({ investorId: a.investorId, amount: Number(a.amount) || 0 }))
      : undefined,
    insured: Boolean(b.insured),
    insurerAllocations: Array.isArray(b.insurerAllocations)
      ? b.insurerAllocations
          .filter((a) => a && a.policyId)
          .map((a) => ({ policyId: a.policyId, amount: Number(a.amount) || 0 }))
      : undefined,
  };

  return NextResponse.json(checkDiscount(txn));
}
