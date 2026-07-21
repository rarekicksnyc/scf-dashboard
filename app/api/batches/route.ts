import { NextResponse } from "next/server";
import { parseCsvFlexible, parseXlsx } from "@/lib/upload";
import { runBatch } from "@/lib/engine";
import {
  getBatches,
  saveBatch,
  syncExceptionsForBatch,
  addAudit,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { mm } from "@/lib/format";

export async function GET() {
  const batches = getBatches().map((b) => ({
    batchId: b.batchId,
    sellerId: b.sellerId,
    fileName: b.fileName,
    uploadedAt: b.uploadedAt,
    summary: b.summary,
  }));
  return NextResponse.json({ batches });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to upload batches.` },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || (typeof body.csv !== "string" && typeof body.fileBase64 !== "string")) {
    return NextResponse.json(
      { error: "Expected { csv } or { fileBase64 } (with fileName)." },
      { status: 400 },
    );
  }

  // .xlsx arrives base64-encoded; CSV/paste arrives as text. Both go through the
  // same flexible mapping.
  const parsed =
    typeof body.fileBase64 === "string"
      ? parseXlsx(body.fileBase64)
      : parseCsvFlexible(body.csv);
  const { invoices } = parsed;
  const errors = parsed.warnings;
  if (invoices.length === 0) {
    return NextResponse.json(
      { error: errors.length ? errors.join(" ") : "No invoice rows found." },
      { status: 422 },
    );
  }

  const seq = getBatches().length + 1;
  const batchId = `BATCH-2026-${String(seq).padStart(6, "0")}`;
  const result = runBatch(invoices, {
    batchId,
    fileName: typeof body.fileName === "string" ? body.fileName : "upload.csv",
    uploadedAt: new Date().toISOString(),
    makerUserId: user.id,
  });
  (result as unknown as { parseWarnings?: string[] }).parseWarnings = errors;
  saveBatch(result);
  syncExceptionsForBatch(result, user.id);

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "BATCH_UPLOAD",
    entityType: "BATCH",
    entityId: batchId,
    detail: `Uploaded ${result.summary.totalCount} invoices (${mm(
      result.summary.totalRequested,
    )}); ${result.summary.exceptionCount} exception, ${result.summary.rejectedCount} rejected.`,
  });

  return NextResponse.json({ batchId, summary: result.summary, parseWarnings: errors });
}
