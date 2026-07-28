import { NextResponse } from "next/server";
import { getTransactionWorkflow, bookTransactionFromWorkflow, advanceWorkflow, requestWorkflowException, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { evaluateWorkflow } from "@/lib/workflowEligibility";
import { addBusinessDays, daysBetween } from "@/lib/format";

// Final step: book the transaction in the system. Re-verifies eligibility on the
// live parameters first (a limit/date/rating could have changed since the
// reservation). A clean deal books in one click. A breach cannot be self-booked:
// the maker records a reason (an exception request) and a SECOND authorized user
// (the checker) must approve it before booking — governance parity with the
// batch maker-checker. Booking then creates the time-phased booked transaction,
// removes the reservation it realises, and marks the workflow BOOKED.
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
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";

  // T+n settlement: if a basis is chosen, the deal is struck today (trade date)
  // and funded n business days later — the funding (value) date drives the
  // exposure window, so eligibility below is re-checked against the funding date.
  if (b.settlementBasis != null) {
    const n = Math.round(Number(b.settlementBasis));
    if (Number.isNaN(n) || n < 0 || n > 3) {
      return NextResponse.json({ error: "Settlement basis must be T+0, T+1, T+2, or T+3." }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const fundingDate = addBusinessDays(today, n);
    if (daysBetween(fundingDate, wf.maturityDate) <= 0) {
      return NextResponse.json({ error: `Funding date ${fundingDate} (T+${n}) is on or after maturity ${wf.maturityDate} — no tenor left.` }, { status: 422 });
    }
    wf.tradeDate = today;
    wf.settlementBasis = n;
    wf.valueDate = fundingDate;
  }

  // Governance: re-run eligibility at booking (against the funding date).
  const evalr = evaluateWorkflow(wf);
  const approved = Boolean(wf.exceptionApprovedBy);
  if (!evalr.clears && !approved) {
    // A breach needs a checker's approval. Record (or update) the exception
    // request with the maker's reason and wait for a second user to approve.
    if (!comment) {
      return NextResponse.json({ error: "This transaction no longer clears the eligibility test — a reason and a second approver are required.", canOverride: true, breachReasons: evalr.reasons }, { status: 422 });
    }
    requestWorkflowException(id, comment, user.id, user.name);
    addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_EXCEPTION_REQUEST", entityType: "TRANSACTION_WORKFLOW", entityId: id, detail: `Requested booking exception on ${wf.reference}: ${comment}. Breach: ${evalr.reasons.join("; ")}` });
    return NextResponse.json({ needsApproval: true, breachReasons: evalr.reasons }, { status: 202 });
  }

  const result = bookTransactionFromWorkflow(id, user.name);
  if (!result) return NextResponse.json({ error: "Could not book." }, { status: 422 });
  if (!evalr.clears && approved) {
    advanceWorkflow(id, { by: user.name, event: `Booked with checker-approved exception (${evalr.decision}), approved by ${wf.exceptionApprovedByName}. Breach: ${evalr.reasons.join("; ")}` });
  }
  addAudit({ actorUserId: user.id, actorName: user.name, action: "TXN_FLOW_BOOK", entityType: "BOOKED_TRANSACTION", entityId: result.booked.id, detail: `Booked ${wf.reference} (${result.booked.id})${!evalr.clears ? ` WITH EXCEPTION (approved by ${wf.exceptionApprovedByName})` : ""}; reservation ${wf.reservationId ?? "—"} removed.` });
  return NextResponse.json({ ok: true, workflow: result.workflow, booked: result.booked });
}
