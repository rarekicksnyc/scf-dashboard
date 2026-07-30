import {
  listBookedTransactions,
  allSellers,
  allObligors,
  getSeller,
  getObligor,
} from "@/lib/data/store";
import { allRevenueDeals, revenueSummary, accruedRevenue, pipelineRevenue } from "@/lib/revenue";
import { outstandingPrincipal, collectedPrincipal, overdueDays } from "@/lib/receivables";
import { daysBetween } from "@/lib/format";
import type { Context } from "@/lib/creator/expr";
import type { WatchScope } from "@/lib/types";

// ---------------------------------------------------------------------------
// The Creator-Mode surface: the ONLY data KPI tiles and watch rules may read.
// A single declaration of {key,label} catalogs + the matching context builders,
// so the builder UI, the evaluator's validation, and evaluation all agree on
// what exists (single source). Everything here is derived and read-only — the
// canonical store/ledger, never a copy.
// ---------------------------------------------------------------------------

export interface FieldSpec { key: string; label: string; help?: string }

// --- Book-level aggregates (KPI tiles) -------------------------------------
export const KPI_FIELDS: FieldSpec[] = [
  { key: "total_revenue", label: "Total revenue (margin + skim)" },
  { key: "margin_revenue", label: "Margin revenue" },
  { key: "investor_skim", label: "Investor skim" },
  { key: "funding_basis", label: "Funding basis (COF − SOFR)" },
  { key: "margin_skim", label: "Margin skim (bps)" },
  { key: "insurer_skim", label: "Insurer skim" },
  { key: "dtr_revenue", label: "DTR revenue" },
  { key: "utrc_revenue", label: "UTRC revenue" },
  { key: "booked_revenue", label: "Revenue from bookings" },
  { key: "batch_revenue", label: "Revenue from batches" },
  { key: "earned_to_date", label: "Revenue earned to date" },
  { key: "unearned", label: "Unearned (remaining)" },
  { key: "pipeline_revenue", label: "Pipeline revenue" },
  { key: "volume", label: "Volume funded" },
  { key: "deal_count", label: "Deal count" },
  { key: "weighted_yield_bps", label: "Weighted yield (bps)" },
  { key: "total_outstanding", label: "Total outstanding principal" },
  { key: "avg_tenor_days", label: "Average tenor (days)" },
];

export function kpiContext(): Context {
  const deals = allRevenueDeals();
  const sum = revenueSummary(deals);
  const today = new Date().toISOString().slice(0, 10);
  const accrual = accruedRevenue(deals, today);
  const pipeline = pipelineRevenue();
  const booked = listBookedTransactions();
  const totalOutstanding = booked.reduce((a, t) => a + outstandingPrincipal(t), 0);
  const avgTenor = deals.length ? deals.reduce((a, d) => a + d.tenorDays, 0) / deals.length : 0;
  return {
    total_revenue: sum.total,
    margin_revenue: sum.revenue,
    investor_skim: sum.skimRevenue,
    funding_basis: sum.fundingBasisRevenue,
    margin_skim: sum.marginSkimRevenue,
    insurer_skim: sum.insurerSkimRevenue,
    dtr_revenue: sum.dtrRevenue,
    utrc_revenue: sum.utrcRevenue,
    booked_revenue: sum.bookedRevenue,
    batch_revenue: sum.batchRevenue,
    earned_to_date: accrual.accrued,
    unearned: accrual.unearned,
    pipeline_revenue: pipeline.revenue,
    volume: sum.volume,
    deal_count: sum.deals,
    weighted_yield_bps: sum.weightedMarginBps,
    total_outstanding: totalOutstanding,
    avg_tenor_days: Math.round(avgTenor),
  };
}

// --- Per-deal (watch rules, scope DEAL) ------------------------------------
export const DEAL_FIELDS: FieldSpec[] = [
  { key: "amount", label: "Coverage / funded amount" },
  { key: "face_amount", label: "Invoice face amount" },
  { key: "advance_rate", label: "Advance rate (0–1)" },
  { key: "pricing_bps", label: "Margin (bps)" },
  { key: "tenor_days", label: "Tenor (days)" },
  { key: "investor_amount", label: "Investor participation" },
  { key: "skim_bps", label: "Skim (bps)" },
  { key: "insured_amount", label: "Insured amount" },
  { key: "uninsured_residual", label: "Uninsured residual (bank-held)" },
  { key: "outstanding", label: "Outstanding principal" },
  { key: "collected", label: "Collected principal" },
  { key: "overdue_days", label: "Days past due (0 if not)" },
  { key: "is_investor", label: "Has investor participation (1/0)" },
  { key: "is_insured", label: "Insured (1/0)" },
  { key: "settled", label: "Settled (1/0)" },
  { key: "defaulted", label: "Defaulted (1/0)" },
  { key: "product_type", label: "Product ('DTR' / 'UTRC')" },
  { key: "currency", label: "Currency (e.g. 'USD')" },
];

export interface WatchItem { id: string; label: string; context: Context }

function dealItems(asOf: string): WatchItem[] {
  return listBookedTransactions().map((t) => {
    const insured = (t.insurerAllocations ?? []).reduce((a, x) => a + x.amount, 0);
    const investor = t.investorAmount ?? 0;
    const bankHeld = Math.max(0, t.amount - investor);
    return {
      id: t.id,
      label: `${t.reference} · ${getObligor(t.obligorId)?.name ?? t.obligorId}`,
      context: {
        amount: t.amount,
        face_amount: t.faceAmount ?? t.amount,
        advance_rate: t.advanceRate ?? 0,
        pricing_bps: t.pricingBps,
        tenor_days: daysBetween(t.valueDate, t.maturityDate),
        investor_amount: investor,
        skim_bps: t.skimBps ?? 0,
        insured_amount: insured,
        uninsured_residual: Math.max(0, bankHeld - insured),
        outstanding: outstandingPrincipal(t),
        collected: collectedPrincipal(t),
        overdue_days: Math.max(0, overdueDays(t, asOf)),
        is_investor: investor > 0 ? 1 : 0,
        is_insured: insured > 0 ? 1 : 0,
        settled: t.settledAt ? 1 : 0,
        defaulted: t.defaultedAt ? 1 : 0,
        product_type: t.productType,
        currency: t.currency,
      },
    };
  });
}

// --- Per-seller / per-obligor (watch rules) --------------------------------
export const SELLER_FIELDS: FieldSpec[] = [
  { key: "rating", label: "Borrower rating (e.g. 'BBB')" },
  { key: "asr_rating", label: "ASR rating" },
  { key: "min_pricing_bps", label: "Minimum pricing (bps)" },
  { key: "rrl_enabled", label: "RRL enabled (1/0)" },
  { key: "deal_count", label: "Live deal count" },
  { key: "exposure", label: "Outstanding exposure" },
];

export const OBLIGOR_FIELDS: FieldSpec[] = [
  { key: "deal_count", label: "Live deal count" },
  { key: "exposure", label: "Outstanding exposure" },
];

function exposureBy(pick: (t: ReturnType<typeof listBookedTransactions>[number]) => string): Map<string, { count: number; exposure: number }> {
  const map = new Map<string, { count: number; exposure: number }>();
  for (const t of listBookedTransactions()) {
    const id = pick(t);
    const row = map.get(id) ?? { count: 0, exposure: 0 };
    row.count += 1;
    row.exposure += outstandingPrincipal(t);
    map.set(id, row);
  }
  return map;
}

function sellerItems(): WatchItem[] {
  const exp = exposureBy((t) => t.sellerId);
  return allSellers().map((s) => {
    const e = exp.get(s.id) ?? { count: 0, exposure: 0 };
    return {
      id: s.id,
      label: s.name,
      context: {
        rating: s.borrowerRating ?? "",
        asr_rating: s.asrRating ?? "",
        min_pricing_bps: s.minPricingBps ?? 0,
        rrl_enabled: s.rrlEnabled ? 1 : 0,
        deal_count: e.count,
        exposure: e.exposure,
      },
    };
  });
}

function obligorItems(): WatchItem[] {
  const exp = exposureBy((t) => t.obligorId);
  return allObligors().map((o) => {
    const e = exp.get(o.id) ?? { count: 0, exposure: 0 };
    return { id: o.id, label: o.name, context: { deal_count: e.count, exposure: e.exposure } };
  });
}

// The catalog + items for a watch-rule scope. One entry point the builder,
// validation, and evaluation all share.
export function watchSurface(scope: WatchScope): { fields: FieldSpec[]; items: WatchItem[] } {
  const asOf = new Date().toISOString().slice(0, 10);
  if (scope === "DEAL") return { fields: DEAL_FIELDS, items: dealItems(asOf) };
  if (scope === "SELLER") return { fields: SELLER_FIELDS, items: sellerItems() };
  return { fields: OBLIGOR_FIELDS, items: obligorItems() };
}

export function watchFields(scope: WatchScope): FieldSpec[] {
  if (scope === "DEAL") return DEAL_FIELDS;
  if (scope === "SELLER") return SELLER_FIELDS;
  return OBLIGOR_FIELDS;
}
