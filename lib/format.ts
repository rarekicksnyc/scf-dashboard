export function usd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function mm(n: number): string {
  return `$${(n / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}MM`;
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function dateShort(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const STATUS_LABEL: Record<string, string> = {
  ELIGIBLE: "Eligible",
  ELIGIBLE_WITH_WARNING: "Eligible (warning)",
  EXCEPTION_REQUIRED: "Exception",
  REJECTED: "Rejected",
  PENDING_DATA: "Pending data",
};

export const LIMIT_LABEL: Record<string, string> = {
  SELLER: "Seller",
  ASR: "ASR",
  OBLIGOR: "Obligor",
  SWINGLINE: "Swingline",
  RRL_SWINGLINE: "RRL Swingline",
  RRL: "RRL",
  INSURANCE: "Insurance",
  INVESTOR: "Investor",
  PROGRAM: "Program",
};

export const SETTLEMENT_LABEL: Record<string, string> = {
  NOT_APPLICABLE: "—",
  PENDING: "Pending funding",
  FUNDED: "Funded",
  SETTLED: "Settled",
};
