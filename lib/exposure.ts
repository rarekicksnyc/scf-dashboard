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

// ---------------------------------------------------------------------------
// Flat per-name exposure for the selectable summary / email export. One row per
// seller and per obligor, combining the main line with its swingline (and RRL
// for sellers). Derived from the same reservation-aware views above.
// ---------------------------------------------------------------------------

export interface EntityExposure {
  kind: "SELLER" | "OBLIGOR";
  id: string;
  name: string;
  cdl: string;
  status: string;
  approved: number;
  outstanding: number;
  reserved: number;
  available: number;
  utilizationPct: number;
}

function flatten(kind: "SELLER" | "OBLIGOR", r: ExposureRow): EntityExposure {
  const parts = [r.main, r.swingline, r.rrl].filter(Boolean) as LimitView[];
  const approved = parts.reduce((a, v) => a + v.approvedLimit, 0);
  const outstanding = parts.reduce((a, v) => a + v.outstanding, 0);
  const reserved = parts.reduce((a, v) => a + v.reserved, 0);
  const available = parts.reduce((a, v) => a + v.available, 0);
  const consumed = outstanding + reserved;
  return {
    kind,
    id: r.id,
    name: r.name,
    cdl: r.cdl,
    status: r.status,
    approved,
    outstanding,
    reserved,
    available,
    utilizationPct: approved > 0 ? consumed / approved : 0,
  };
}

export function entityExposures(asOf?: string): EntityExposure[] {
  return [
    ...sellerExposure(asOf).map((r) => flatten("SELLER", r)),
    ...obligorExposure(asOf).map((r) => flatten("OBLIGOR", r)),
  ];
}
