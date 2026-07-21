import type { LimitView, EligibilityStatus, Severity } from "@/lib/types";
import { mm, pct } from "@/lib/format";

export function UtilBar({ view }: { view: LimitView }) {
  const p = Math.min(Math.max(view.utilizationPct, 0), 1);
  const cls = p >= 1 ? "hot" : p >= view.limit.warnThreshold ? "warn" : "ok";
  return (
    <div className="bar" title={`${pct(view.utilizationPct)} utilized`}>
      <span className={cls} style={{ width: `${p * 100}%` }} />
    </div>
  );
}

const STATUS_TO_BADGE: Record<EligibilityStatus, { cls: string; label: string }> = {
  ELIGIBLE: { cls: "green", label: "Eligible" },
  ELIGIBLE_WITH_WARNING: { cls: "yellow", label: "Warning" },
  EXCEPTION_REQUIRED: { cls: "orange", label: "Exception" },
  EXCEPTION_APPROVED: { cls: "green", label: "Exception approved" },
  REJECTED: { cls: "red", label: "Rejected" },
  PENDING_DATA: { cls: "grey", label: "Pending" },
};

export function StatusBadge({ status }: { status: EligibilityStatus }) {
  const b = STATUS_TO_BADGE[status];
  return <span className={`badge ${b.cls}`}>{b.label}</span>;
}

const SEV_CLS: Record<Severity, string> = {
  GREEN: "green",
  YELLOW: "yellow",
  ORANGE: "orange",
  RED: "red",
};

export function CheckPill({ severity, text }: { severity: Severity; text: string }) {
  return <span className={`check-pill ${SEV_CLS[severity]}`}>{text}</span>;
}

export function Available({ view }: { view: LimitView }) {
  return (
    <span>
      {mm(view.available)}{" "}
      <span className="muted">/ {mm(view.approvedLimit)}</span>
    </span>
  );
}
