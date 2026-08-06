import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { parseInvoiceCsv } from "@/lib/csv";
import { runBatch } from "@/lib/engine";
import { getBatches, saveBatch, syncExceptionsForBatch, materializeBatchBookings, addAudit } from "@/lib/data/store";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { MAX_BATCH_INVOICES } from "@/lib/config";

const MAX_INGEST_BYTES = 8_000_000; // 8MB CSV push ceiling

// ---------------------------------------------------------------------------
// Host-to-host / API ingestion endpoint (Phase 4, stub). Real deployments
// authenticate this with mTLS + a rotated API key issued per counterparty and
// map the key to a service identity. Here a single demo key gates a CSV push so
// the ingestion path exists end-to-end; production hardening is deferred.
//
//   curl -X POST /api/ingest -H "x-api-key: demo-ingest-key" \
//        -H "content-type: text/csv" --data-binary @batch.csv
// ---------------------------------------------------------------------------

// The ingest key MUST be explicitly configured in production — never fall back to
// the public demo key (that would let anyone who knows it push bookings that
// materialize real exposure). In development a demo key is allowed for local use.
const CONFIGURED_KEY = process.env.SCF_INGEST_KEY;
const INGEST_KEY = CONFIGURED_KEY ?? (process.env.NODE_ENV === "production" ? undefined : "demo-ingest-key");
const SERVICE_MAKER = "svc_host2host";

// Constant-time key comparison (hash first so unequal lengths don't leak).
function keyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const rl = rateLimit(`ingest:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }
  if (!INGEST_KEY) {
    // Fail closed: no key configured in production.
    return NextResponse.json({ error: "Ingestion is not configured." }, { status: 503 });
  }
  if (!keyMatches(request.headers.get("x-api-key") ?? "", INGEST_KEY)) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }
  const csv = await request.text();
  // Cap the ingest payload so a giant push can't exhaust memory.
  if (csv.length > MAX_INGEST_BYTES) {
    return NextResponse.json({ error: `Payload too large (max ${Math.floor(MAX_INGEST_BYTES / 1_000_000)}MB).` }, { status: 413 });
  }
  const { invoices, errors } = parseInvoiceCsv(csv);
  if (invoices.length === 0) {
    return NextResponse.json(
      { error: errors.join(" ") || "No invoice rows found." },
      { status: 422 },
    );
  }
  if (invoices.length > MAX_BATCH_INVOICES) {
    return NextResponse.json({ error: `Batch too large: ${invoices.length} rows (max ${MAX_BATCH_INVOICES}). Split it.` }, { status: 413 });
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
  materializeBatchBookings(result, SERVICE_MAKER);
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
