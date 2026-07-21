import { NextResponse } from "next/server";
import { checkDiscount } from "@/lib/engine/eligibility";
import type { DiscountTransaction } from "@/lib/types";

// Run one discount transaction through the consolidated eligibility engine.
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Partial<DiscountTransaction> | null;
  if (!b || !b.sellerId || !b.obligorId || !(Number(b.invoiceAmount) > 0)) {
    return NextResponse.json(
      { error: "Expected sellerId, obligorId, invoiceAmount." },
      { status: 400 },
    );
  }

  const txn: DiscountTransaction = {
    sellerId: b.sellerId,
    obligorId: b.obligorId,
    invoiceNumber: b.invoiceNumber ?? "TXN",
    invoiceAmount: Number(b.invoiceAmount),
    currency: b.currency ?? "USD",
    invoiceType: b.invoiceType ?? "FINAL",
    advanceRate: Number(b.advanceRate) || 1,
    valueDate: b.valueDate ?? "2026-08-01",
    maturityDate: b.maturityDate ?? "2026-11-01",
    pricingBps: Number(b.pricingBps) || 0,
    usesSwingline: Boolean(b.usesSwingline),
    distributed: Boolean(b.distributed),
    investorId: b.investorId,
    participationAmount: b.participationAmount ? Number(b.participationAmount) : undefined,
    insured: Boolean(b.insured),
    insurerAllocations: b.insurerAllocations,
  };

  return NextResponse.json(checkDiscount(txn));
}
