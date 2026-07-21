import {
  allSellers,
  allObligors,
  findLimit,
  entitySwingline,
  viewLimit,
} from "@/lib/data/store";
import type { LimitView } from "@/lib/types";

// ---------------------------------------------------------------------------
// Per-entity exposure rows for the Sellers / Obligors tabs. Each row combines
// the entity's main limit (SELLER or OBLIGOR) with its optional swingline, both
// as reservation-aware views (outstanding + reserved + available).
// ---------------------------------------------------------------------------

export interface ExposureRow {
  id: string;
  name: string;
  cdl: string;
  status: string;
  main?: LimitView; // main seller/obligor limit
  swingline?: LimitView; // per-entity swingline (undefined when not toggled on)
}

export function sellerExposure(): ExposureRow[] {
  return allSellers().map((s) => {
    const main = findLimit("SELLER", s.id);
    const swl = entitySwingline("SELLER", s.id);
    return {
      id: s.id,
      name: s.name,
      cdl: s.cdl,
      status: s.status,
      main: main ? viewLimit(main) : undefined,
      swingline: swl ? viewLimit(swl) : undefined,
    };
  });
}

export function obligorExposure(): ExposureRow[] {
  return allObligors().map((o) => {
    const main = findLimit("OBLIGOR", o.id);
    const swl = entitySwingline("OBLIGOR", o.id);
    return {
      id: o.id,
      name: o.name,
      cdl: o.cdl,
      status: o.status,
      main: main ? viewLimit(main) : undefined,
      swingline: swl ? viewLimit(swl) : undefined,
    };
  });
}
