import { NextResponse } from "next/server";
import { buildPaymentFile } from "@/lib/reports";
import { csvResponse } from "@/lib/csvexport";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { addAudit } from "@/lib/data/store";

// Generate the settlement/payment file for a batch's funded invoices. Gated by
// GENERATE_PAYMENT_FILE and audited (payment instruction generation is a
// controlled action).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "GENERATE_PAYMENT_FILE")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to generate payment files.` },
      { status: 403 },
    );
  }
  const built = buildPaymentFile(batchId);
  if (!built) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "PAYMENT_FILE_GENERATE",
    entityType: "BATCH",
    entityId: batchId,
    detail: `Generated payment file for ${batchId}.`,
  });
  return csvResponse(built.filename, built.csv);
}
