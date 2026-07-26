import type { InvoiceType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Bank parameters — the single place every tunable business rule lives, so a
// reviewer can see (and change) the numbers without reading the engines. Each
// value is referenced from exactly one engine; nothing here is duplicated
// in-line elsewhere.
//
// NB: per-customer parameters (approved limit, max tenor, warn/exception
// thresholds, pricing floor, coverage %) live ON the individual limit/seller
// records in the data store — those vary by name and are edited on-screen.
// This file holds only the portfolio-wide defaults and conventions.
// ---------------------------------------------------------------------------

// Day-count basis for discount/fee accrual (actual/360 money-market convention).
export const DAY_COUNT_BASIS = 360;

// COF is priced on a separate MUFG platform. When that feed is available, set
// this to its endpoint and implement the fetch inside cofRate() in the store —
// the single COF integration point. Empty = use the uploaded COF rate sheet.
export const COF_FEED_URL = process.env.COF_FEED_URL ?? "";

// Fallback margin (bps) when an uploaded schedule omits pricing.
export const DEFAULT_MARGIN_BPS = 200;

// Pricing convention: a margin entered as 1.15 means 115 bps, stored as 115.
export const MARGIN_INPUT_TO_BPS = 100;

// Advance rate is valid across the full 0–100% range. Only the per-invoice-type
// cap below adds a (non-blocking) warning when the desk prices high for return.
export const ADVANCE_RATE_MIN = 0.0;
export const ADVANCE_RATE_MAX = 1.0;

// Advance-rate cap by invoice type. The desk may price above these for return,
// so exceeding a cap warns (yellow) rather than failing.
export const ADVANCE_RATE_CAP: Record<InvoiceType, number> = {
  FINAL: 1.0,
  PROVISIONAL: 0.9,
  PIPELINE: 0.85,
};
