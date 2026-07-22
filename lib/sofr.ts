import type { RateRow } from "@/lib/types";

// ---------------------------------------------------------------------------
// Daily SOFR from the official New York Fed public markets API. This is the one
// deliberate outbound call in the app (market data only — no financial data is
// sent, no key required). The overnight SOFR fixing is the free official number;
// the tenor-specific Term SOFR curve is a CME-licensed product, so we apply the
// official overnight fixing across the standard tenor buckets as the base rate.
// ---------------------------------------------------------------------------

const NY_FED_SOFR_URL = "https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json";
const STANDARD_TENORS = [30, 60, 90, 180];

export interface SofrFixing {
  rate: number; // percent, e.g. 5.32
  effectiveDate: string; // ISO date the fixing applies to
}

export async function fetchSofr(): Promise<SofrFixing> {
  const res = await fetch(NY_FED_SOFR_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`NY Fed SOFR API returned ${res.status}`);
  const data = (await res.json()) as { refRates?: Array<{ type?: string; percentRate?: number; effectiveDate?: string }> };
  const row = data.refRates?.find((r) => r.type === "SOFR") ?? data.refRates?.[0];
  if (!row || typeof row.percentRate !== "number") throw new Error("Unexpected NY Fed response shape");
  return { rate: row.percentRate, effectiveDate: String(row.effectiveDate ?? "") };
}

function addDays(iso: string, days: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

// Build the SOFR rate rows from a fixing: the official overnight rate applied
// flat across the standard tenor buckets (see note above).
export function sofrRateRows(fixing: SofrFixing): RateRow[] {
  return STANDARD_TENORS.map((tenorDays) => ({
    rateType: "SOFR" as const,
    startDate: fixing.effectiveDate,
    maturityDate: addDays(fixing.effectiveDate, tenorDays),
    tenorDays,
    bid: fixing.rate,
    offer: fixing.rate,
    calcRate: fixing.rate,
  }));
}
