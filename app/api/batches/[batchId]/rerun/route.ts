import { NextResponse } from "next/server";
import {
  getBatch,
  updateBatch,
  getApprovedOverrides,
  addAudit,
} from "@/lib/data/store";
import { runBatch } from "@/lib/engine";
import { getCurrentUser } from "@/lib/auth";

// Re-run eligibility for an existing batch against the current limits, applying
// any checker-approved exception overrides (so approved exceptions now fund).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const batch = getBatch(batchId);
  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  const invoices = batch.results.map((r) => r.invoice);
  const rerun = runBatch(
    invoices,
    {
      batchId: batch.batchId,
      fileName: batch.fileName,
      uploadedAt: batch.uploadedAt,
      makerUserId: batch.makerUserId,
    },
    { approvedOverrides: getApprovedOverrides(batchId) },
  );
  updateBatch(rerun);

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "BATCH_RERUN",
    entityType: "BATCH",
    entityId: batchId,
    detail: `Re-ran eligibility; ${rerun.summary.eligibleCount} eligible, ${rerun.summary.exceptionCount} exception, ${rerun.summary.rejectedCount} rejected.`,
  });

  return NextResponse.json({ batchId, summary: rerun.summary });
}
