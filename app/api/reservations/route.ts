import { NextResponse } from "next/server";
import { getReservations, addReservation, addAudit, entitySwingline } from "@/lib/data/store";
import { checkSwinglineReservation } from "@/lib/engine/reservation";
import { checkDiscount } from "@/lib/engine/eligibility";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { mm } from "@/lib/format";
import type { Currency, DiscountTransaction } from "@/lib/types";

type Failing = { severity: string; message: string };

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export async function GET() {
  return NextResponse.json({ reservations: getReservations() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to book reservations.` },
      { status: 403 },
    );
  }

  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const amount = Number(b.amount);
  const tenorDays = daysBetween(b.valueDate, b.maturityDate);
  const override = Boolean(b.override);
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";
  const kind = b.kind === "SWINGLINE" ? "SWINGLINE" : "DISCOUNT";

  if (!(amount > 0)) {
    return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
  }
  if (!(tenorDays > 0)) {
    return NextResponse.json({ error: "Maturity date must be after value date." }, { status: 422 });
  }

  // Shared "did not clear → soft-warning exception" gate.
  const gate = (blocked: boolean, failing: Failing[]) => {
    if (blocked && !override) {
      return { stop: NextResponse.json({ error: "This reservation does not clear the eligibility test.", canOverride: true, checks: failing }, { status: 422 }) };
    }
    if (blocked && override && comment.length === 0) {
      return { stop: NextResponse.json({ error: "A reason is required to book a soft-warning exception.", canOverride: true, checks: failing }, { status: 422 }) };
    }
    return { isException: blocked && override, failing };
  };

  // ------------------------------------------------------------------ SWINGLINE
  if (kind === "SWINGLINE") {
    const entityType: "SELLER" | "OBLIGOR" = b.entityType === "OBLIGOR" ? "OBLIGOR" : "SELLER";
    const direction: "REDUCTION" | "INCREASE" = b.swinglineDirection === "INCREASE" ? "INCREASE" : "REDUCTION";
    if (!b.entityId) {
      return NextResponse.json({ error: "A single seller or obligor is required." }, { status: 400 });
    }
    const decision = checkSwinglineReservation(entityType, b.entityId, amount, direction);
    const failing = decision.checks.filter((c) => c.severity === "RED");
    const g = gate(decision.decision === "BLOCK", failing);
    if (g.stop) return g.stop;

    const created = addReservation({
      kind: "SWINGLINE",
      swinglineDirection: direction,
      sellerId: entityType === "SELLER" ? b.entityId : "",
      obligorId: entityType === "OBLIGOR" ? b.entityId : "",
      amount,
      currency: (b.currency as Currency) ?? "USD",
      valueDate: b.valueDate,
      maturityDate: b.maturityDate,
      pricingBps: 0,
      tenorDays,
      usesSwingline: true,
      status: "RESERVED",
      createdBy: user.id,
      exception: g.isException || undefined,
      exceptionComment: g.isException ? comment : undefined,
      exceptionReasons: g.isException ? g.failing.map((c) => c.message) : undefined,
      resolveByDate: g.isException && b.resolveByDate ? b.resolveByDate : undefined,
    });
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: g.isException ? "RESERVATION_EXCEPTION" : "SWINGLINE_RESERVATION",
      entityType: "RESERVATION",
      entityId: created.id,
      detail: `Swingline ${direction.toLowerCase()} ${mm(amount)} on ${entityType} ${b.entityId} value ${b.valueDate}${g.isException ? ` — ${comment}` : ""}.`,
    });
    return NextResponse.json({ reservation: created, decision: g.isException ? "EXCEPTION" : decision.decision, checks: decision.checks });
  }

  // ------------------------------------------------------------------ DISCOUNT
  // Run the full eligibility engine — the reservation amount is the exposure
  // (advance = 100%). It auto-clears if it passes; a REJECTED / EXCEPTION result
  // is what triggers the soft-warning exception path.
  if (!b.sellerId || !b.obligorId) {
    return NextResponse.json({ error: "Expected sellerId and obligorId." }, { status: 400 });
  }
  const txn: DiscountTransaction = {
    sellerId: b.sellerId,
    obligorId: b.obligorId,
    invoiceNumber: "RESERVATION",
    invoiceAmount: amount,
    currency: (b.currency as Currency) ?? "USD",
    invoiceType: "FINAL",
    advanceRate: 1,
    valueDate: b.valueDate,
    maturityDate: b.maturityDate,
    pricingBps: Number(b.pricingBps) || 0,
    distributed: false,
    insured: false,
  };
  const report = checkDiscount(txn);
  const didNotClear = report.decision === "REJECTED" || report.decision === "EXCEPTION_REQUIRED";
  const failing = report.checks.filter((c) => c.severity === "RED" || c.severity === "ORANGE");
  const g = gate(didNotClear, failing);
  if (g.stop) return g.stop;

  const created = addReservation({
    kind: "DISCOUNT",
    sellerId: b.sellerId,
    obligorId: b.obligorId,
    amount,
    currency: (b.currency as Currency) ?? "USD",
    valueDate: b.valueDate,
    maturityDate: b.maturityDate,
    pricingBps: Number(b.pricingBps) || 0,
    rrlAmount: Math.min(Math.max(Number(b.rrlAmount) || 0, 0), amount),
    tenorDays,
    usesSwingline:
      Boolean(entitySwingline("SELLER", b.sellerId)) ||
      Boolean(entitySwingline("OBLIGOR", b.obligorId)),
    status: "RESERVED",
    createdBy: user.id,
    exception: g.isException || undefined,
    exceptionComment: g.isException ? comment : undefined,
    exceptionReasons: g.isException ? g.failing.map((c) => c.message) : undefined,
    resolveByDate: g.isException && b.resolveByDate ? b.resolveByDate : undefined,
  });

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: g.isException ? "RESERVATION_EXCEPTION" : "RESERVATION_CREATE",
    entityType: "RESERVATION",
    entityId: created.id,
    detail: g.isException
      ? `EXCEPTION ${b.sellerId}/${b.obligorId} ${mm(amount)} — ${comment}${b.resolveByDate ? ` (resolve by ${b.resolveByDate})` : ""}`
      : `${b.sellerId} / ${b.obligorId} ${mm(amount)} value ${b.valueDate} mat ${b.maturityDate} @ ${created.pricingBps}bps.`,
  });

  return NextResponse.json({ reservation: created, decision: g.isException ? "EXCEPTION" : report.decision, checks: report.checks });
}
