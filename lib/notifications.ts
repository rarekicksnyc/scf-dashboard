import { listBookedTransactions, getReservations, coveredEntityIds, getSeller, getObligor } from "@/lib/data/store";
import { buildExpirations } from "@/lib/expirations";
import { outstandingPrincipal } from "@/lib/receivables";
import { usd } from "@/lib/format";

// The live, coverage-routed digest (derived each read — never stored). Three
// sections per the desk's ask: transactions maturing today, reservations funding
// today, and covered limits coming due within 30 days. Everything is filtered to
// the entities (sellers/obligors) the user covers.

export interface DigestItem { id: string; label: string; sub?: string; href?: string }
export interface Digest { maturing: DigestItem[]; reservationsToday: DigestItem[]; limitsDue: DigestItem[] }

export function coverageDigest(userId: string, asOf: string): Digest {
  const { sellers, obligors } = coveredEntityIds(userId);
  const covers = (sid?: string, oid?: string) => Boolean((sid && sellers.has(sid)) || (oid && obligors.has(oid)));

  const maturing: DigestItem[] = listBookedTransactions()
    .filter((t) => t.maturityDate === asOf && !t.settledAt && covers(t.sellerId, t.obligorId))
    .map((t) => ({ id: t.id, label: `${t.reference} · ${usd(outstandingPrincipal(t))}`, sub: `${getObligor(t.obligorId)?.name ?? t.obligorId} — matures today`, href: "/receivables" }));

  const reservationsToday: DigestItem[] = getReservations()
    .filter((r) => r.status === "RESERVED" && r.valueDate === asOf && covers(r.sellerId, r.obligorId))
    .map((r) => ({ id: r.id, label: `${getSeller(r.sellerId)?.name ?? r.sellerId} · ${usd(r.amount)}`, sub: `${getObligor(r.obligorId)?.name ?? r.obligorId} — funds today`, href: "/reservations" }));

  const limitsDue: DigestItem[] = buildExpirations(asOf)
    .filter((i) => i.kind === "Limit" && i.daysToExpiry <= 30 && ((i.sellerId && sellers.has(i.sellerId)) || (i.obligorId && obligors.has(i.obligorId))))
    .map((i) => ({ id: i.ref, label: `${i.entity} · ${i.detail}`, sub: i.daysToExpiry < 0 ? `expired ${-i.daysToExpiry}d ago` : `due in ${i.daysToExpiry}d`, href: "/expirations" }));

  return { maturing, reservationsToday, limitsDue };
}

export function digestCount(d: Digest): number {
  return d.maturing.length + d.reservationsToday.length + d.limitsDue.length;
}
