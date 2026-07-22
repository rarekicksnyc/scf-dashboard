import {
  allSellers,
  allObligors,
  findLimit,
  entitySwingline,
  viewLimit,
  sellerEntitiesOf,
  obligorEntitiesOf,
} from "@/lib/data/store";
import type { LimitView } from "@/lib/types";

export interface EligibleEntity {
  id: string;
  name: string;
  cdl: string;
  domicile: string;
}

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
  rrl?: LimitView; // seller RRL (undefined when the seller has none)
  entities: EligibleEntity[]; // eligible legal entities sharing the aggregate line
}

export function sellerExposure(asOf?: string): ExposureRow[] {
  return allSellers().map((s) => {
    const main = findLimit("SELLER", s.id);
    const swl = entitySwingline("SELLER", s.id);
    const rrl = findLimit("RRL", s.id);
    return {
      id: s.id,
      name: s.name,
      cdl: s.cdl,
      status: s.status,
      main: main ? viewLimit(main, asOf) : undefined,
      swingline: swl ? viewLimit(swl, asOf) : undefined,
      rrl: rrl ? viewLimit(rrl, asOf) : undefined,
      entities: sellerEntitiesOf(s.id).map((e) => ({ id: e.id, name: e.name, cdl: e.cdl, domicile: e.domicile })),
    };
  });
}

export function obligorExposure(asOf?: string): ExposureRow[] {
  return allObligors().map((o) => {
    const main = findLimit("OBLIGOR", o.id);
    const swl = entitySwingline("OBLIGOR", o.id);
    return {
      id: o.id,
      name: o.name,
      cdl: o.cdl,
      status: o.status,
      main: main ? viewLimit(main, asOf) : undefined,
      swingline: swl ? viewLimit(swl, asOf) : undefined,
      entities: obligorEntitiesOf(o.id).map((e) => ({ id: e.id, name: e.name, cdl: e.cdl, domicile: e.domicile })),
    };
  });
}
