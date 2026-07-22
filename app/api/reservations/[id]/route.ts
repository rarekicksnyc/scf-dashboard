import { NextResponse } from "next/server";
import {
  getReservation,
  cancelReservation,
  addAudit,
  entitySwingline,
} from "@/lib/data/store";
import { checkSwinglineReservation } from "@/lib/engine/reservation";
import { checkDiscount } from "@/lib/engine/eligibility";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { mm, daysBetween, blockingChecks } from "@/lib/format";
import type { DiscountTransaction } from "@/lib/types";

// Cancel a reservation (releases its held capacity).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to cancel reservations.` },
      { status: 403 },
    );
  }
  const r = getReservation(id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  cancelReservation(id);
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "RESERVATION_CANCEL",
    entityType: "RESERVATION",
    entityId: id,
    detail: `Cancelled and removed reservation ${id}.`,
  });
  return NextResponse.json({ reservation: r });
}

// Adjust a reservation's amount / dates / pricing / direction. Re-runs the
// eligibility test on the NEW details (excluding the reservation itself from
// availability so it doesn't double-count), and supports the soft-warning
// override. The calendar and every limit are derived from the reservation, so
// they auto-adjust the moment the new values are saved.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to adjust reservations.` },
      { status: 403 },
    );
  }
  const r = getReservation(id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = await request.json().catch(() => ({}));
  const amount = b.amount != null ? Number(b.amount) : r.amount;
  const valueDate = b.valueDate ?? r.valueDate;
  const maturityDate = b.maturityDate ?? r.maturityDate;
  const tenorDays = daysBetween(valueDate, maturityDate);
  const override = Boolean(b.override);
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";

  if (!(amount > 0)) return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
  if (!(tenorDays > 0)) return NextResponse.json({ error: "Maturity date must be after value date." }, { status: 422 });

  // Exclude this reservation from availability while re-checking the new values
  // (RESERVED-only filter means a temporary non-RESERVED status drops it).
  const prevStatus = r.status;
  r.status = "CANCELLED";

  let didNotClear = false;
  let failing: { severity: string; message: string }[] = [];
  let decisionLabel = "OK";

  if (r.kind === "SWINGLINE") {
    const direction = (b.swinglineDirection ?? r.swinglineDirection ?? "REDUCTION") as "REDUCTION" | "INCREASE";
    const entityType: "SELLER" | "OBLIGOR" = r.sellerId ? "SELLER" : "OBLIGOR";
    const entityId = r.sellerId || r.obligorId;
    const decision = checkSwinglineReservation(entityType, entityId, amount, direction);
    didNotClear = decision.decision === "BLOCK";
    failing = decision.checks.filter((c) => c.severity === "RED");
    decisionLabel = decision.decision;
  } else {
    const pricingBps = b.pricingBps != null ? Number(b.pricingBps) : r.pricingBps;
    const txn: DiscountTransaction = {
      sellerId: r.sellerId,
      obligorId: r.obligorId,
      invoiceNumber: "RESERVATION",
      invoiceAmount: amount,
      currency: r.currency,
      invoiceType: "FINAL",
      advanceRate: 1,
      valueDate,
      maturityDate,
      pricingBps,
      distributed: false,
      insured: false,
    };
    const report = checkDiscount(txn);
    didNotClear = report.decision === "REJECTED" || report.decision === "EXCEPTION_REQUIRED";
    failing = blockingChecks(report.checks);
    decisionLabel = report.decision;
  }

  if (didNotClear && !override) {
    r.status = prevStatus; // revert
    return NextResponse.json({ error: "The adjusted reservation does not clear the eligibility test.", canOverride: true, checks: failing }, { status: 422 });
  }
  if (didNotClear && override && comment.length === 0) {
    r.status = prevStatus; // revert
    return NextResponse.json({ error: "A reason is required to keep a soft-warning exception.", canOverride: true, checks: failing }, { status: 422 });
  }

  // Apply the adjustment.
  const isException = didNotClear && override;
  r.status = "RESERVED";
  r.amount = amount;
  r.valueDate = valueDate;
  r.maturityDate = maturityDate;
  r.tenorDays = tenorDays;
  if (r.kind === "SWINGLINE") {
    if (b.swinglineDirection) r.swinglineDirection = b.swinglineDirection;
  } else {
    if (b.pricingBps != null) r.pricingBps = Number(b.pricingBps);
    r.usesSwingline =
      Boolean(entitySwingline("SELLER", r.sellerId)) ||
      Boolean(entitySwingline("OBLIGOR", r.obligorId));
  }
  r.exception = isException || undefined;
  r.exceptionComment = isException ? comment : undefined;
  r.exceptionReasons = isException ? failing.map((c) => c.message) : undefined;
  r.resolveByDate = isException && b.resolveByDate ? b.resolveByDate : undefined;

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "RESERVATION_ADJUST",
    entityType: "RESERVATION",
    entityId: id,
    detail: `Adjusted to ${mm(amount)} value ${valueDate} mat ${maturityDate}${isException ? ` (soft-warning: ${comment})` : ""}.`,
  });

  return NextResponse.json({ reservation: r, decision: isException ? "EXCEPTION" : decisionLabel });
}
