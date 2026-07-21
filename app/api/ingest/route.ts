import { NextResponse } from "next/server";
import { parseInvoiceCsv } from "@/lib/csv";
import { runBatch } from "@/lib/engine";
import { getBatches, saveBatch, syncExceptionsForBatch, addAudit } from "@/lib/data/store";

// ---------------------------------------------------------------------------
// Host-to-host / API ingestion endpoint (Phase 4, stub). Real deployments
// authenticate this with mTLS + a rotated API key issued per counterparty and
// map the key to a service identity. Here a single demo key gates a CSV push so
// the ingestion path exists end-to-end; production hardening is deferred.
//
//   curl -X POST /api/ingest -H "x-api-key: demo-ingest-key" \
//        -H "content-type: text/csv" --data-binary @batch.csv
// ---------------------------------------------------------------------------

const DEMO_KEY = process.env.SCF_INGEST_KEY ?? "demo-ingest-key";
const SERVICE_MAKER = "svc_host2host";

export async function POST(request: Request) {
  if (request.headers.get("x-api-key") !== DEMO_KEY) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }
  const csv = await request.text();
  const { invoices, errors } = parseInvoiceCsv(csv);
  if (invoices.length === 0) {
    return NextResponse.json(
      { error: errors.join(" ") || "No invoice rows found." },
      { status: 422 },
    );
  }

  const seq = getBatches().length + 1;
  const batchId = `BATCH-2026-${String(seq).padStart(6, "0")}`;
  const result = runBatch(invoices, {
    batchId,
    fileName: "host-to-host.csv",
    uploadedAt: new Date().toISOString(),
    makerUserId: SERVICE_MAKER,
  });
  saveBatch(result);
  syncExceptionsForBatch(result, SERVICE_MAKER);
  addAudit({
    actorUserId: SERVICE_MAKER,
    actorName: "Host-to-host ingestion",
    action: "BATCH_INGEST",
    entityType: "BATCH",
    entityId: batchId,
    detail: `Ingested ${result.summary.totalCount} invoices via API.`,
  });

  return NextResponse.json({ batchId, summary: result.summary });
}
