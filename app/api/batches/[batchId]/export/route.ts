import { getBatch, getObligor } from "@/lib/data/store";
import type { InvoiceResult } from "@/lib/types";

// Exception report: every invoice that did not cleanly pass (exception or
// rejected), with the blocking check's reason and its own breach amount.
function blockingCheck(r: InvoiceResult) {
  return r.checks.find((c) => c.severity === "RED" || c.severity === "ORANGE");
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
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

  const lines = [header.join(",")];
  for (const r of rows) {
    const blk = blockingCheck(r);
    lines.push(
      [
        r.invoice.invoiceNumber,
        r.invoice.obligorId,
        getObligor(r.invoice.obligorId)?.name ?? "",
        r.invoice.amount,
        r.invoice.currency,
        r.tenorDays,
        r.status,
        Math.round(blk?.breachAmount ?? 0),
        blk?.message ?? "",
      ]
        .map(csvField)
        .join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${batchId}-exceptions.csv"`,
    },
  });
}
