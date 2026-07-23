import {
  limitViews,
  allSellers,
  allObligors,
  allObligorEntities,
  activePolicies,
  listParentGuarantees,
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

  // Obligor group-level approval expiry (separate from the obligor limit line).
  for (const o of allObligors()) {
    if (!o.expiryDate) continue;
    const d = days(asOf, o.expiryDate);
    items.push({ kind: "Obligor group approval", ref: o.id, entity: o.name, detail: "Group approval / review", expiryDate: o.expiryDate, daysToExpiry: d, flag: flagFor(d) });
  }

  // Obligor legal-entity credentials — borrower rating, insurance, and PCG.
  for (const e of allObligorEntities()) {
    const parent = getObligor(e.groupId)?.name ?? e.groupId;
    const label = `${e.name} (${parent})`;
    if (e.borrowerRatingExpiry) {
      const d = days(asOf, e.borrowerRatingExpiry);
      items.push({ kind: "Obligor entity rating", ref: e.id, entity: label, detail: `Rating ${e.borrowerRating}`, expiryDate: e.borrowerRatingExpiry, daysToExpiry: d, flag: flagFor(d) });
    }
    if (e.insurancePolicyId && e.insuranceExpiry) {
      const d = days(asOf, e.insuranceExpiry);
      items.push({ kind: "Obligor entity insurance", ref: e.id, entity: label, detail: "Insurance coverage", expiryDate: e.insuranceExpiry, daysToExpiry: d, flag: flagFor(d) });
    }
    if (e.pcg === "Y" && e.pcgExpiry) {
      const d = days(asOf, e.pcgExpiry);
      items.push({ kind: "Obligor entity PCG", ref: e.id, entity: label, detail: "Parent company guarantee", expiryDate: e.pcgExpiry, daysToExpiry: d, flag: flagFor(d) });
    }
  }

  // Parent Company Guarantees — only the ones with a fixed expiry (continuing
  // unconditional guarantees are indefinite and never expire).
  for (const g of listParentGuarantees()) {
    if (g.continuing || !g.expiryDate) continue;
    const parties = [g.sellerId ? getSeller(g.sellerId)?.name : null, g.obligorId ? getObligor(g.obligorId)?.name : null].filter(Boolean).join(" / ") || "—";
    const d = days(asOf, g.expiryDate);
    items.push({ kind: "Parent company guarantee", ref: g.id, entity: g.parentName, detail: `Supports ${parties}`, expiryDate: g.expiryDate, daysToExpiry: d, flag: flagFor(d) });
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

  // Continuing (indefinite) items are not expirations, so they are not added
  // here; they are shown as such in the full register on the page.
  return items.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

export function expiryCounts(items: ExpiringItem[]) {
  return {
    expired: items.filter((i) => i.flag === "EXPIRED").length,
    within30: items.filter((i) => i.flag === "WITHIN_30").length,
    within60: items.filter((i) => i.flag === "WITHIN_60").length,
  };
}
