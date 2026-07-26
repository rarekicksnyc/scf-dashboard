import { NextResponse } from "next/server";
import {
  getBatch,
  updateBatch,
  getApprovedOverrides,
  removeBatchBookings,
  materializeBatchBookings,
  addAudit,
} from "@/lib/data/store";
import { runBatch } from "@/lib/engine";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Re-run eligibility for an existing batch against the current limits, applying
// any checker-approved exception overrides (so approved exceptions now fund).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to re-run batches.` }, { status: 403 });
  }
  const batch = getBatch(batchId);
  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const invoices = batch.results.map((r) => r.invoice);
  // Clear this batch's prior bookings first so the re-run sees a clean slate
  // (it must not count its own previous exposure), then re-materialise.
  removeBatchBookings(batchId);
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
  materializeBatchBookings(rerun, user.id);

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
