import {
  limitViews,
  allSellers,
  activePolicies,
  getSeller,
  getObligor,
  getInvestor,
  getInsurancePolicy,
} from "@/lib/data/store";
import { LIMIT_LABEL } from "@/lib/format";

// ---------------------------------------------------------------------------
// Expiry monitoring. Flags any limit (and key facility credentials) approaching
// its expiry date — 60 days out, 30 days out, or already expired.
// ---------------------------------------------------------------------------

export type ExpiryFlag = "EXPIRED" | "WITHIN_30" | "WITHIN_60" | "OK";

export interface ExpiringItem {
  kind: string; // Limit / Borrower rating / ASR rating / RRL / Insurance policy
  ref: string;
  entity: string;
  detail: string;
  expiryDate: string;
  daysToExpiry: number;
  flag: ExpiryFlag;
}

function flagFor(days: number): ExpiryFlag {
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "WITHIN_30";
  if (days <= 60) return "WITHIN_60";
  return "OK";
}

function days(fromISO: string, expiryISO: string): number {
  if (!expiryISO) return Infinity;
  return Math.ceil((Date.parse(expiryISO) - Date.parse(fromISO)) / 86_400_000);
}

function entityName(entityType: string, entityId: string): string {
  if (entityType === "SELLER") return getSeller(entityId)?.name ?? entityId;
  if (entityType === "OBLIGOR") return getObligor(entityId)?.name ?? entityId;
  if (entityType === "INVESTOR") return getInvestor(entityId)?.name ?? entityId;
  if (entityType === "INSURER_POLICY")
    return getInsurancePolicy(entityId)?.insurerName ?? entityId;
  return entityId;
}

export function buildExpirations(asOf: string): ExpiringItem[] {
  const items: ExpiringItem[] = [];

  for (const v of limitViews()) {
    const d = days(asOf, v.limit.expiryDate);
    items.push({
      kind: "Limit",
      ref: v.limit.id,
      entity: entityName(v.limit.entityType, v.limit.entityId),
      detail: `${LIMIT_LABEL[v.limit.type]} limit`,
      expiryDate: v.limit.expiryDate,
      daysToExpiry: d,
      flag: flagFor(d),
    });
  }

  for (const s of allSellers()) {
    const push = (kind: string, expiry: string, detail: string) => {
      if (!expiry) return;
      const d = days(asOf, expiry);
      items.push({ kind, ref: s.id, entity: s.name, detail, expiryDate: expiry, daysToExpiry: d, flag: flagFor(d) });
    };
    push("Borrower rating", s.borrowerRatingExpiry, `Rating ${s.borrowerRating}`);
    push("ASR rating", s.asrExpiry, `ASR ${s.asrRating}`);
    if (s.rrlEnabled) push("RRL", s.rrlExpiry, "Risk Reimbursement Line");
  }

  for (const p of activePolicies()) {
    const d = days(asOf, p.expiryDate);
    items.push({
      kind: "Insurance policy",
      ref: p.policyNumber,
      entity: p.insurerName,
      detail: "Policy validity",
      expiryDate: p.expiryDate,
      daysToExpiry: d,
      flag: flagFor(d),
    });
  }

  return items.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

export function expiryCounts(items: ExpiringItem[]) {
  return {
    expired: items.filter((i) => i.flag === "EXPIRED").length,
    within30: items.filter((i) => i.flag === "WITHIN_30").length,
    within60: items.filter((i) => i.flag === "WITHIN_60").length,
  };
}
