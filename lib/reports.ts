import {
  store,
  limitViews,
  getSeller,
  getObligor,
  getExceptions,
  getAuditLog,
} from "@/lib/data/store";
import { toCsv } from "@/lib/csvexport";

// ---------------------------------------------------------------------------
// Reporting module. Each report reads live store state and returns a CSV
// string. Reports are derived, never stored — same single-source discipline as
// the rest of the platform.
// ---------------------------------------------------------------------------

export const REPORTS: Array<{ key: string; title: string; description: string }> = [
  {
    key: "asr-utilization",
    title: "ASR utilization report",
    description: "Asset Securitization limit usage by seller.",
  },
  {
    key: "obligor-exposure",
    title: "Obligor exposure report",
    description: "Exposure and headroom by obligor.",
  },
  {
    key: "limit-utilization",
    title: "Limit utilization report",
    description: "Every limit: approved, consumed, available, utilization.",
  },
  {
    key: "exceptions",
    title: "Exception approval report",
    description: "All exceptions raised, with maker-checker decisions.",
  },
  {
    key: "audit",
    title: "Audit log export",
    description: "Every state-changing action with actor and timestamp.",
  },
];

export function buildReport(key: string): { filename: string; csv: string } | null {
  switch (key) {
    case "asr-utilization":
      return {
        filename: "asr-utilization.csv",
        csv: toCsv(
          [
            "seller_id",
            "seller_name",
            "asr_rating",
            "approved",
            "consumed",
            "available",
            "utilization_pct",
            "max_tenor_days",
            "expiry",
          ],
          limitViews()
            .filter((v) => v.limit.type === "ASR")
            .map((v) => {
              const s = getSeller(v.limit.entityId);
              return [
                v.limit.entityId,
                s?.name ?? "",
                s?.asrRating ?? "",
                v.approvedLimit,
                v.consumed,
                v.available,
                (v.utilizationPct * 100).toFixed(1),
                v.limit.maxTenorDays,
                v.limit.expiryDate,
              ];
            }),
        ),
      };

    case "obligor-exposure":
      return {
        filename: "obligor-exposure.csv",
        csv: toCsv(
          [
            "obligor_id",
            "obligor_name",
            "internal_rating",
            "approved",
            "consumed",
            "available",
            "utilization_pct",
          ],
          limitViews()
            .filter((v) => v.limit.type === "OBLIGOR")
            .map((v) => {
              const o = getObligor(v.limit.entityId);
              return [
                v.limit.entityId,
                o?.name ?? "",
                o?.internalRating ?? "",
                v.approvedLimit,
                v.consumed,
                v.available,
                (v.utilizationPct * 100).toFixed(1),
              ];
            }),
        ),
      };

    case "limit-utilization":
      return {
        filename: "limit-utilization.csv",
        csv: toCsv(
          [
            "limit_id",
            "type",
            "entity_id",
            "approved",
            "consumed",
            "available",
            "utilization_pct",
            "status",
          ],
          limitViews().map((v) => [
            v.limit.id,
            v.limit.type,
            v.limit.entityId,
            v.approvedLimit,
            v.consumed,
            v.available,
            (v.utilizationPct * 100).toFixed(1),
            v.limit.status,
          ]),
        ),
      };

    case "exceptions":
      return {
        filename: "exception-approvals.csv",
        csv: toCsv(
          [
            "exception_id",
            "batch_id",
            "invoice_number",
            "obligor_id",
            "amount",
            "check",
            "reason",
            "breach_amount",
            "status",
            "maker",
            "decided_by",
            "decided_at",
            "comment",
          ],
          getExceptions().map((e) => [
            e.id,
            e.batchId,
            e.invoiceNumber,
            e.obligorId,
            e.amount,
            e.checkName,
            e.reason,
            Math.round(e.breachAmount),
            e.status,
            e.makerUserId,
            e.decidedByName ?? "",
            e.decidedAt ?? "",
            e.comment ?? "",
          ]),
        ),
      };

    case "audit":
      return {
        filename: "audit-log.csv",
        csv: toCsv(
          ["audit_id", "timestamp", "actor", "action", "entity_type", "entity_id", "detail"],
          getAuditLog().map((a) => [
            a.id,
            a.timestamp,
            a.actorName,
            a.action,
            a.entityType,
            a.entityId,
            a.detail,
          ]),
        ),
      };

    default:
      return null;
  }
}

// Payment/settlement file for a batch: one row per funded invoice with net
// proceeds, value date, and funding breakdown.
export function buildPaymentFile(batchId: string): { filename: string; csv: string } | null {
  const batch = store.batches.find((b) => b.batchId === batchId);
  if (!batch) return null;
  const funded = batch.results.filter((r) => r.funding);
  const rows = funded.map((r) => {
    const f = r.funding!;
    const investor = f.legs
      .filter((l) => l.source === "INVESTOR")
      .map((l) => `${l.sourceName}:${Math.round(l.amount)}`)
      .join("|");
    return [
      r.invoice.invoiceNumber,
      r.invoice.sellerId,
      r.invoice.obligorId,
      r.invoice.currency,
      r.invoice.amount,
      Math.round(r.discountFee),
      Math.round(r.netProceeds),
      r.invoice.requestedDiscountDate,
      investor || "—",
      Math.round(f.bankHeld),
      Math.round(f.insuredAmount),
    ];
  });
  return {
    filename: `${batchId}-payment-file.csv`,
    csv: toCsv(
      [
        "invoice_number",
        "seller_id",
        "obligor_id",
        "currency",
        "invoice_amount",
        "discount_fee",
        "net_proceeds",
        "value_date",
        "investor_takeout",
        "bank_hold",
        "insured_amount",
      ],
      rows,
    ),
  };
}
