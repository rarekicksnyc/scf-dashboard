import { NextResponse } from "next/server";
import { getTransactionWorkflow, bookTransactionFromWorkflow, advanceWorkflow, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { evaluateWorkflow } from "@/lib/workflowEligibility";

// Final step: book the transaction in the system. Re-verifies eligibility on the
// live parameters first (a limit/date/rating could have changed since the
// reservation) — it must clear, or be booked with a documented exception. Then
// creates the time-phased booked transaction (real outstanding across every
// limit), removes the reservation it realises, and marks the workflow BOOKED.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to book transactions.` }, { status: 403 });
  }
  const wf = getTransactionWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  if (wf.status !== "SIGNATURE_VERIFIED" && wf.status !== "BOOKING_EMAILED") {
    return NextResponse.json({ error: "Verify the signature (and draft the booking email) before booking." }, { status: 422 });
  }

  const b = await request.json().catch(() => ({}));
  const override = Boolean(b.override);
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";

  // Governance: re-run eligibility at booking. Block unless it clears or is
  // overridden with a reason.
  const evalr = evaluateWorkflow(wf);
  if (!evalr.clears) {
    if (!override) {
      return NextResponse.json({ error: "This transaction no longer clears the eligibility test — booking blocked.", canOverride: true, breachReasons: evalr.reasons }, { status: 422 });
    }
    if (!comment) {
      return NextResponse.json({ error: "A reason is required to book despite the breach.", canOverride: true, breachReasons: evalr.reasons }, { status: 422 });
    }
  }

  const result = bookTransactionFromWorkflow(id, user.name);
  if (!result) return NextResponse.json({ error: "Could not book." }, { status: 422 });
  if (!evalr.clears && override) {
    advanceWorkflow(id, { by: user.name, event: `Booked with exception (${evalr.decision}): ${comment}. Breach: ${evalr.reasons.join("; ")}` });
  }
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_BOOK", entityType: "BOOKED_TRANSACTION", entityId: result.booked.id, detail: `Booked ${wf.reference} (${result.booked.id})${!evalr.clears ? " WITH EXCEPTION" : ""}; reservation ${wf.reservationId ?? "—"} removed.` });
  return NextResponse.json({ ok: true, workflow: result.workflow, booked: result.booked });
}
