import { NextResponse } from "next/server";
import { getReservations, addReservation, addAudit, entitySwingline } from "@/lib/data/store";
import { checkReservation } from "@/lib/engine/reservation";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { mm } from "@/lib/format";
import type { Currency } from "@/lib/types";

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
  if (!b || !b.sellerId || !b.obligorId || !(Number(b.amount) > 0)) {
    return NextResponse.json(
      { error: "Expected sellerId, obligorId, amount, valueDate, maturityDate." },
      { status: 400 },
    );
  }

  const amount = Number(b.amount);
  const tenorDays = daysBetween(b.valueDate, b.maturityDate);
  if (!(tenorDays > 0)) {
    return NextResponse.json(
      { error: "Maturity date must be after value date." },
      { status: 422 },
    );
  }
  // Swingline is a core limit: the reservation draws on it whenever the seller
  // or obligor line has one (no per-transaction choice).
  const usesSwingline =
    Boolean(entitySwingline("SELLER", b.sellerId)) ||
    Boolean(entitySwingline("OBLIGOR", b.obligorId));
  const override = Boolean(b.override);
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";

  const decision = checkReservation({
    sellerId: b.sellerId,
    obligorId: b.obligorId,
    amount,
    tenorDays,
  });
  const failing = decision.checks.filter((c) => c.severity === "RED");
  const blocked = decision.decision === "BLOCK";

  // Blocked and no override → tell the client it did not clear, but that a
  // documented soft-warning exception is available.
  if (blocked && !override) {
    return NextResponse.json(
      {
        error: "This reservation does not clear a limit control.",
        canOverride: true,
        checks: failing,
      },
      { status: 422 },
    );
  }
  // Overriding a block requires a reason.
  if (blocked && override && comment.length === 0) {
    return NextResponse.json(
      { error: "A reason is required to book a soft-warning exception.", canOverride: true, checks: failing },
      { status: 422 },
    );
  }

  const isException = blocked && override;
  const created = addReservation({
    sellerId: b.sellerId,
    obligorId: b.obligorId,
    amount,
    currency: (b.currency as Currency) ?? "USD",
    valueDate: b.valueDate,
    maturityDate: b.maturityDate,
    pricingBps: Number(b.pricingBps) || 0,
    tenorDays,
    usesSwingline,
    status: "RESERVED",
    createdBy: user.id,
    exception: isException || undefined,
    exceptionComment: isException ? comment : undefined,
    exceptionReasons: isException ? failing.map((c) => c.message) : undefined,
    resolveByDate: isException && b.resolveByDate ? b.resolveByDate : undefined,
  });

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: isException ? "RESERVATION_EXCEPTION" : "RESERVATION_CREATE",
    entityType: "RESERVATION",
    entityId: created.id,
    detail: isException
      ? `EXCEPTION ${b.sellerId}/${b.obligorId} ${mm(amount)} — ${comment}${b.resolveByDate ? ` (resolve by ${b.resolveByDate})` : ""}`
      : `${b.sellerId} / ${b.obligorId} ${mm(amount)} value ${b.valueDate} mat ${b.maturityDate} @ ${created.pricingBps}bps.`,
  });

  return NextResponse.json({ reservation: created, decision: isException ? "EXCEPTION" : decision.decision, checks: decision.checks });
}
