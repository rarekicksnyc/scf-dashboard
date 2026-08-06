import { getBatch, getObligor } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csvexport";
import type { InvoiceResult } from "@/lib/types";

// Exception report: every invoice that did not cleanly pass (exception or
// rejected), with the blocking check's reason and its own breach amount.
function blockingCheck(r: InvoiceResult) {
  return r.checks.find((c) => c.severity === "RED" || c.severity === "ORANGE");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "VIEW_REPORTS") && !roleHas(user.role, "UPLOAD_BATCH")) {
    return new Response("Not permitted", { status: 403 });
  }
  const batch = getBatch(batchId);
  if (!batch) {
    return new Response("Not found", { status: 404 });
  }

  const rows = batch.results.filter(
    (r) => r.status === "EXCEPTION_REQUIRED" || r.status === "REJECTED",
  );

  const header = [
    "invoice_number",
    "obligor_id",
    "obligor_name",
    "amount",
    "currency",
    "tenor_days",
    "status",
    "breach_amount",
    "reason",
  ];

  const body = rows.map((r) => {
    const blk = blockingCheck(r);
    return [
      r.invoice.invoiceNumber,
      r.invoice.obligorId,
      getObligor(r.invoice.obligorId)?.name ?? "",
      r.invoice.amount,
      r.invoice.currency,
      r.tenorDays,
      r.status,
      Math.round(blk?.breachAmount ?? 0),
      blk?.message ?? "",
    ];
  });

  return csvResponse(`${batchId}-exceptions.csv`, toCsv(header, body));
}
