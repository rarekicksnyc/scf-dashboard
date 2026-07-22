import { resolveBaseRate } from "@/lib/data/store";
import type { PricingResult, ProductType, BaseRateType } from "@/lib/types";

// Shared pricing used by the eligibility engine and the batch engine.
// Convention: margin input of 1.15 = 115 bps; marginBps stored as 115.
//   DTR discount = coverage x (margin_dec + base_dec) x tenor/360
//   UTRC fee     = coverage x margin_dec x tenor/360
export function priceDeal(opts: {
  productType?: ProductType;
  baseRateType?: BaseRateType;
  baseRate?: number; // percent; 0/undefined = resolve from rate sheet
  marginBps: number;
  coverage: number;
  tenorDays: number;
}): PricingResult {
  const productType = opts.productType ?? "DTR";
  const baseRateType = opts.baseRateType ?? "SOFR";
  const marginBps = opts.marginBps;
  const baseRatePct =
    opts.baseRate && opts.baseRate > 0
      ? opts.baseRate
      : (resolveBaseRate(baseRateType, opts.tenorDays) ?? 0);
  const marginDec = marginBps / 10000;
  const baseDec = baseRatePct / 100;
  const t = Math.max(opts.tenorDays, 0) / 360;
  const discount = opts.coverage * (marginDec + baseDec) * t;
  const commitmentFee = opts.coverage * marginDec * t;
  return {
    productType,
    baseRateType,
    baseRatePct,
    marginBps,
    allInRatePct: marginBps / 100 + baseRatePct,
    coverage: opts.coverage,
    discount,
    purchasePrice: opts.coverage - discount,
    commitmentFee,
  };
}
