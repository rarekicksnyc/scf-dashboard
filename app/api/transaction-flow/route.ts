import { NextResponse } from "next/server";
import { createTransactionWorkflow, getSeller, getObligor, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { Currency, ProductType, ReservationScope } from "@/lib/types";

// Proceed with a transaction — create an in-progress workflow from the checked
// transaction. Booking needs real seller/obligor ids, so this comes from a
// reservation (or explicit ids). Gated by UPLOAD_BATCH.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to proceed with transactions.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const seller = getSeller(b.sellerId);
  const obligor = getObligor(b.obligorId);
  if (!seller || !obligor) {
    return NextResponse.json({ error: "Proceed from a reservation so the seller and obligor are linked to real records." }, { status: 422 });
  }
  const productType: ProductType = b.productType === "UTRC" ? "UTRC" : "DTR";
  const amount = Number(b.amount) || 0;
  const advanceRate = productType === "UTRC" ? 1 : Number(b.advanceRate) || 1;
  const coverage = productType === "UTRC" ? amount : Math.round(amount * advanceRate);
  if (!(coverage > 0)) return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 422 });

  const wf = createTransactionWorkflow({
    reservationId: typeof b.reservationId === "string" && b.reservationId ? b.reservationId : undefined,
    sellerId: seller.id,
    sellerName: seller.name,
    obligorId: obligor.id,
    obligorName: obligor.name,
    obligorEntityId: b.obligorEntityId || undefined,
    productType,
    reference: String(b.reference || "TXN"),
    currency: (b.currency as Currency) || "USD",
    amount,
    advanceRate,
    coverage,
    valueDate: String(b.valueDate || ""),
    maturityDate: String(b.maturityDate || ""),
    commitmentDueDate: b.commitmentDueDate || undefined,
    finalDemandDate: b.finalDemandDate || undefined,
    pricingBps: Number(b.pricingBps) || 0,
    scope: (b.scope as ReservationScope) || undefined,
    createdBy: user.name,
  });
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "TXN_FLOW_PROCEED",
    entityType: "TRANSACTION_WORKFLOW",
    entityId: wf.id,
    detail: `Proceeded: ${seller.name} / ${obligor.name} ${productType} ${wf.reference}.`,
  });
  return NextResponse.json({ ok: true, workflow: wf });
}
