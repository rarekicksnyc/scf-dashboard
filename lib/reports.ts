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
  {
    key: "four-eyes-evidence",
    title: "Four-eyes evidence report",
    description: "Every completed maker-checker approval — limits, ASR sublimits, and booking exceptions — with requester, approver, reference, and reason.",
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

    case "four-eyes-evidence": {
      // Every completed four-eyes approval, from the structured governance records
      // (not free-text audit). Requester and approver are always different users
      // (enforced at approval time), so this is the auditor's segregation-of-duties
      // evidence in one place.
      type Row = [string, string, string, string, string, string, string, number, string];
      const rows: Row[] = [];
      for (const l of store.limits) {
        if (l.approval?.status !== "APPROVED") continue;
        rows.push(["Limit", `${l.type} · ${l.entityId}`, l.approval.reference ?? "", l.approval.requestedByName ?? "", l.approval.approvedByName ?? "", l.approval.requestedAt ?? "", l.approval.approvedAt ?? "", Math.round(l.approvedLimit), ""]);
      }
      for (const s of store.sellerObligorLimits) {
        if (s.approval?.status !== "APPROVED") continue;
        rows.push(["ASR sublimit", `${s.sellerId} · ${s.obligorId}`, s.approval.reference ?? "", s.approval.requestedByName ?? "", s.approval.approvedByName ?? "", s.approval.requestedAt ?? "", s.approval.approvedAt ?? "", Math.round(s.approvedLimit), ""]);
      }
      for (const wf of store.transactionWorkflows) {
        if (!wf.exceptionApprovedBy) continue;
        rows.push(["Booking exception", wf.reference ?? wf.id, "", wf.exceptionRequestedByName ?? "", wf.exceptionApprovedByName ?? "", "", wf.exceptionApprovedAt ?? "", Math.round(wf.coverage ?? wf.amount ?? 0), wf.exceptionReason ?? ""]);
      }
      return {
        filename: "four-eyes-evidence.csv",
        csv: toCsv(
          ["control", "item", "reference", "requested_by", "approved_by", "requested_at", "approved_at", "amount", "reason"],
          rows,
        ),
      };
    }

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
