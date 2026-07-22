import {
  getObligor,
  getObligorEntity,
  getInsurancePolicy,
  isCountryEligible,
} from "@/lib/data/store";
import { mm2 as mm, expired } from "@/lib/format";

// ---------------------------------------------------------------------------
// Obligor legal-entity eligibility — the single source of the multi-entity
// checks, consumed by BOTH the interactive engine (lib/engine/eligibility.ts)
// and the batch engine (lib/engine/index.ts). Each engine maps these neutral
// findings into its own check shape, so the rules live in exactly one place.
//
// A named entity still consumes the obligor GROUP aggregate limits; these gate
// the entity on its own domicile, rating, insurance, and parent guarantee,
// evaluated as of the transaction value date.
// ---------------------------------------------------------------------------

export type EntitySeverity = "GREEN" | "ORANGE" | "RED" | "GREY";

export interface ObligorEntityFinding {
  key: string; // batch checkName, e.g. OBLIGOR_ENTITY_DOMICILE
  label: string; // interactive check name, e.g. "Entity domicile"
  checkedAgainst: string;
  txnValue: string;
  severity: EntitySeverity;
  message: string;
}

export function obligorEntityFindings(
  obligorEntityId: string,
  obligorId: string,
  advanceAmount: number,
  asOf: string,
): ObligorEntityFinding[] {
  const out: ObligorEntityFinding[] = [];
  const push = (
    key: string,
    label: string,
    checkedAgainst: string,
    txnValue: string,
    severity: EntitySeverity,
    message: string,
  ) => out.push({ key, label, checkedAgainst, txnValue, severity, message });

  const obligor = getObligor(obligorId);
  const groupName = obligor?.name ?? obligorId;
  const oe = getObligorEntity(obligorEntityId);

  if (!oe || oe.groupId !== obligorId) {
    push("OBLIGOR_ENTITY", "Obligor entity", `Legal entity within ${groupName}`, obligorEntityId, "RED",
      !oe ? "Unknown obligor legal entity." : `Named entity does not belong to ${groupName}.`);
    return out;
  }

  push("OBLIGOR_ENTITY", "Obligor entity", `${groupName} group`, `${oe.name} · CDL ${oe.bookingCdl || oe.cdl}`, "GREEN",
    "Named legal entity is part of the obligor group and consumes the group aggregate.");

  const domOk = isCountryEligible(oe.domicile);
  push("OBLIGOR_ENTITY_DOMICILE", "Entity domicile", "Enforceable jurisdiction", oe.domicile || "—",
    domOk ? "GREEN" : "ORANGE",
    domOk ? "Domicile is an eligible / enforceable jurisdiction." : "Domicile is not on the eligible-country list — enforceability approval required.");

  const ratingExpired = expired(oe.borrowerRatingExpiry, asOf);
  push("OBLIGOR_ENTITY_RATING", "Entity borrower rating", oe.borrowerRating || "—", oe.borrowerRatingExpiry || "—",
    ratingExpired ? "ORANGE" : "GREEN",
    ratingExpired ? "Borrower rating missing or expired as of the value date — refresh required." : "Borrower rating current as of the value date.");

  if (oe.insurancePolicyId) {
    const pol = getInsurancePolicy(oe.insurancePolicyId);
    const insExpired = expired(oe.insuranceExpiry, asOf);
    push("OBLIGOR_ENTITY_INSURANCE", "Entity insurance", pol ? pol.policyNumber : oe.insurancePolicyId, oe.insuranceExpiry || "—",
      !pol ? "RED" : insExpired ? "ORANGE" : "GREEN",
      !pol ? "Referenced insurance policy not found." : insExpired ? "Insurance cover has expired as of the value date." : "Insurance cover in force as of the value date.");
  } else {
    push("OBLIGOR_ENTITY_INSURANCE", "Entity insurance", "None", "—", "GREY", "Entity is not credit-insured (not applicable).");
  }

  if (oe.pcg === "Y") {
    const pcgExpired = expired(oe.pcgExpiry, asOf);
    const overPcg = oe.pcgLimit != null && advanceAmount > oe.pcgLimit;
    push("OBLIGOR_ENTITY_PCG", "Entity parent guarantee", oe.pcgLimit != null ? `${mm(oe.pcgLimit)} PCG limit` : "PCG on file", oe.pcgExpiry || "—",
      pcgExpired || overPcg ? "ORANGE" : "GREEN",
      pcgExpired
        ? "Parent company guarantee has expired as of the value date."
        : overPcg
          ? `Funded amount exceeds the PCG limit by ${mm(advanceAmount - (oe.pcgLimit ?? 0))} — approval required.`
          : "Parent company guarantee in force and within limit.");
  }

  return out;
}
