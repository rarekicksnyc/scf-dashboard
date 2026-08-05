import { getObligor, isCountryEligible, effectiveObligorDomicile } from "@/lib/data/store";
import type { Seller } from "@/lib/types";

// Re-exported from the store so there is ONE definition of "which jurisdiction
// governs an obligor booking" shared by the engines and reservedInsurance.
export { effectiveObligorDomicile };

// ---------------------------------------------------------------------------
// Domicile enforceability — the single source of the "is this counterparty's
// jurisdiction enforceable (do we hold an enforceability opinion)?" check,
// consumed by BOTH the interactive engine (eligibility.ts) and the batch engine
// (index.ts). A domicile is an assignable jurisdiction on each seller and each
// obligor (group or named legal entity); it can differ across entities under one
// group. A domicile that is not on the eligible-country register (no enforceability
// opinion) is flagged ORANGE — an exception requiring enforceability approval,
// consistent with the obligor legal-entity domicile check in obligorEntity.ts.
// ---------------------------------------------------------------------------

export type DomicileSeverity = "GREEN" | "ORANGE" | "GREY";

export interface DomicileFinding {
  key: string; // batch checkName, e.g. SELLER_DOMICILE
  label: string; // interactive check name, e.g. "Seller domicile"
  checkedAgainst: string;
  txnValue: string;
  severity: DomicileSeverity;
  message: string;
}

function finding(key: string, label: string, domicile: string | undefined): DomicileFinding {
  if (!domicile) {
    return { key, label, checkedAgainst: "Enforceable jurisdiction", txnValue: "—", severity: "ORANGE",
      message: "No domicile on file — assign a jurisdiction with an enforceability opinion." };
  }
  const ok = isCountryEligible(domicile);
  return { key, label, checkedAgainst: "Enforceable jurisdiction", txnValue: domicile, severity: ok ? "GREEN" : "ORANGE",
    message: ok ? "Domicile is an eligible / enforceable jurisdiction."
      : "Domicile is not on the eligible-country list — enforceability approval required." };
}

// Seller jurisdiction check (facility-level domicile).
export function sellerDomicileFinding(seller: Seller): DomicileFinding {
  return finding("SELLER_DOMICILE", "Seller domicile", seller.domicile);
}

// Obligor GROUP jurisdiction check — used only when NO specific legal entity is
// booked; a named entity's domicile is already checked by obligorEntityFindings,
// so this avoids double-flagging the same booking.
export function obligorGroupDomicileFinding(obligorId: string, obligorEntityId?: string): DomicileFinding | null {
  if (obligorEntityId) return null;
  const obligor = getObligor(obligorId);
  if (!obligor) return null;
  return finding("OBLIGOR_DOMICILE", "Obligor domicile", obligor.country);
}
