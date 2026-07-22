import {
  findLimit,
  entitySwingline,
  viewLimit,
  swinglineConsumed,
  getSeller,
  getObligor,
} from "@/lib/data/store";
import type { CheckResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Reservation eligibility. A new reservation is checked against the SAME limits
// the exposure tabs show — seller, obligor, and (if it draws swingline) each
// entity's swingline — plus max tenor. Because viewLimit() already includes
// existing reservations, "available" here is capacity net of the current
// forward book. A hard breach blocks the reservation; a near-threshold hit
// warns but is allowed.
// ---------------------------------------------------------------------------

export interface ReservationInput {
  sellerId: string;
  obligorId: string;
  amount: number;
  tenorDays: number;
}

export interface ReservationDecision {
  decision: "OK" | "WARN" | "BLOCK";
  checks: CheckResult[];
}

// A standalone swingline movement on one entity. A REDUCTION draws down the
// available swingline (must fit); an INCREASE releases capacity (always clears).
export function checkSwinglineReservation(
  entityType: "SELLER" | "OBLIGOR",
  entityId: string,
  amount: number,
  direction: "REDUCTION" | "INCREASE",
  swinglineKind: "REGULAR" | "RRL" = "REGULAR",
): ReservationDecision {
  const checks: CheckResult[] = [];
  const swl = swinglineKind === "RRL" ? findLimit("RRL_SWINGLINE", entityId) : entitySwingline(entityType, entityId);
  const label = swinglineKind === "RRL" ? "RRL" : entityType === "SELLER" ? "Seller" : "Obligor";
  if (!swl) {
    checks.push({
      checkName: "SWINGLINE_CHECK",
      status: "FAIL",
      severity: "RED",
      message: `${label} has no swingline configured.`,
    });
    return { decision: "BLOCK", checks };
  }
  // Consumed = mirrored parent booking + existing adjustments; available is net.
  const used = swinglineConsumed(entityType, entityId, swinglineKind);
  const available = swl.approvedLimit - used;
  if (direction === "INCREASE") {
    checks.push({
      checkName: "SWINGLINE_CHECK",
      status: "PASS",
      severity: "GREEN",
      message: `Increase releases ${mm(amount)} of ${label.toLowerCase()} swingline capacity.`,
    });
  } else {
    checks.push(
      capacityCheck("SWINGLINE_CHECK", available, swl.approvedLimit, used, swl.warnThreshold, amount),
    );
  }
  const decision = checks.some((c) => c.severity === "RED")
    ? "BLOCK"
    : checks.some((c) => c.severity === "YELLOW" || c.severity === "ORANGE")
      ? "WARN"
      : "OK";
  return { decision, checks };
}

function mm(n: number): string {
  return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}MM`;
}

function capacityCheck(
  name: string,
  available: number | undefined,
  approved: number | undefined,
  consumed: number | undefined,
  warnThreshold: number,
  amount: number,
): CheckResult {
  if (available === undefined) {
    return {
      checkName: name,
      status: "FAIL",
      severity: "RED",
      message: `No active limit found for ${name.replace("_CHECK", "").toLowerCase()}.`,
      breachAmount: amount,
    };
  }
  if (amount > available) {
    return {
      checkName: name,
      status: "FAIL",
      severity: "RED",
      message: `Exceeds available capacity by ${mm(amount - available)} (available ${mm(available)}).`,
      breachAmount: amount - available,
    };
  }
  const projected =
    approved && approved > 0 ? ((consumed ?? 0) + amount) / approved : 0;
  if (projected >= warnThreshold) {
    return {
      checkName: name,
      status: "PASS_WITH_WARNING",
      severity: "YELLOW",
      message: `Reserves; utilization reaches ${(projected * 100).toFixed(1)}% after this reservation.`,
    };
  }
  return {
    checkName: name,
    status: "PASS",
    severity: "GREEN",
    message: `Within available capacity (${mm(available)}).`,
  };
}

export function checkReservation(input: ReservationInput): ReservationDecision {
  const checks: CheckResult[] = [];
  const seller = getSeller(input.sellerId);
  const obligor = getObligor(input.obligorId);

  if (!seller) {
    checks.push({
      checkName: "SELLER_STATUS_CHECK",
      status: "FAIL",
      severity: "RED",
      message: `Unknown seller '${input.sellerId}'.`,
    });
  }
  if (!obligor) {
    checks.push({
      checkName: "OBLIGOR_STATUS_CHECK",
      status: "FAIL",
      severity: "RED",
      message: `Unknown obligor '${input.obligorId}'.`,
    });
  }

  const sellerLimit = findLimit("SELLER", input.sellerId);
  if (sellerLimit) {
    const v = viewLimit(sellerLimit);
    checks.push(
      capacityCheck(
        "SELLER_LIMIT_CHECK",
        v.available,
        v.approvedLimit,
        v.consumed,
        v.limit.warnThreshold,
        input.amount,
      ),
    );
  }

  const obligorLimit = findLimit("OBLIGOR", input.obligorId);
  if (obligorLimit) {
    const v = viewLimit(obligorLimit);
    checks.push(
      capacityCheck(
        "OBLIGOR_LIMIT_CHECK",
        v.available,
        v.approvedLimit,
        v.consumed,
        v.limit.warnThreshold,
        input.amount,
      ),
    );
  }

  // Swingline is a core limit: if the seller or obligor line carries one, the
  // reservation always draws on it, so it is always tested.
  const ss = entitySwingline("SELLER", input.sellerId);
  if (ss) {
    const v = viewLimit(ss);
    checks.push(
      capacityCheck("SELLER_SWINGLINE_CHECK", v.available, v.approvedLimit, v.consumed, v.limit.warnThreshold, input.amount),
    );
  }
  const os = entitySwingline("OBLIGOR", input.obligorId);
  if (os) {
    const v = viewLimit(os);
    checks.push(
      capacityCheck("OBLIGOR_SWINGLINE_CHECK", v.available, v.approvedLimit, v.consumed, v.limit.warnThreshold, input.amount),
    );
  }

  // Max tenor — tightest of seller / obligor limit tenors.
  const tenorCaps = [sellerLimit?.maxTenorDays, obligorLimit?.maxTenorDays].filter(
    (n): n is number => n != null,
  );
  const permitted = tenorCaps.length ? Math.min(...tenorCaps) : Infinity;
  if (input.tenorDays > permitted) {
    checks.push({
      checkName: "MAX_TENOR_CHECK",
      status: "FAIL",
      severity: "RED",
      message: `Tenor ${input.tenorDays}d exceeds max ${permitted}d.`,
    });
  } else {
    checks.push({
      checkName: "MAX_TENOR_CHECK",
      status: "PASS",
      severity: "GREEN",
      message: `Tenor ${input.tenorDays}d within max ${permitted}d.`,
    });
  }

  const decision = checks.some((c) => c.severity === "RED")
    ? "BLOCK"
    : checks.some((c) => c.severity === "ORANGE" || c.severity === "YELLOW")
      ? "WARN"
      : "OK";

  return { decision, checks };
}
