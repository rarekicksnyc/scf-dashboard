import { NextResponse } from "next/server";
import {
  getBookedTransaction,
  recordCollection,
  markReceivableDefault,
  clearReceivableDefault,
  fileInsuranceClaim,
  decideInsuranceClaim,
  settleInvestorParticipation,
  addAudit,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { usd } from "@/lib/format";
import type { WorkoutRoute } from "@/lib/types";

// Post-booking lifecycle actions on a live receivable — recording collections,
// declaring default, filing / deciding insurance claims, and settling investor
// participations. One dispatching route keeps the whole lifecycle in one place.
// Gated by CHANGE_LIMIT (Product Manager & Administrator), like every manage
// action. Each action audits what happened.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to manage receivables.` }, { status: 403 });
  }
  const t = getBookedTransaction(id);
  if (!t) return NextResponse.json({ error: "Receivable not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const audit = (detail: string, subAction: string) =>
    addAudit({ actorUserId: user.id, actorName: user.name, action: subAction, entityType: "BOOKED_TRANSACTION", entityId: id, detail });

  switch (action) {
    case "collect": {
      const amount = Number(body.amount);
      const date = String(body.date || new Date().toISOString().slice(0, 10));
      if (!(amount > 0)) return NextResponse.json({ error: "Collection amount must be positive." }, { status: 400 });
      const updated = recordCollection(id, { amount, date, faceReceived: body.faceReceived ? Number(body.faceReceived) : undefined, note: body.note }, user.name);
      audit(`Recorded collection of ${usd(amount)} on ${t.reference}${updated?.settledAt ? " — receivable settled" : ""}.`, "RECEIVABLE_COLLECT");
      return NextResponse.json({ ok: true, settled: !!updated?.settledAt });
    }
    case "default": {
      const reason = String(body.reason || "").trim();
      const workout = String(body.workout || "") as WorkoutRoute;
      if (!reason) return NextResponse.json({ error: "A default reason is required." }, { status: 400 });
      if (!["RECOURSE_TO_SELLER", "INSURANCE_CLAIM", "WRITE_OFF"].includes(workout)) {
        return NextResponse.json({ error: "Choose a workout route." }, { status: 400 });
      }
      markReceivableDefault(id, { reason, workout }, user.name);
      audit(`Declared default on ${t.reference} (${workout}): ${reason}.`, "RECEIVABLE_DEFAULT");
      return NextResponse.json({ ok: true });
    }
    case "clear-default": {
      clearReceivableDefault(id);
      audit(`Cleared default on ${t.reference}.`, "RECEIVABLE_DEFAULT_CLEAR");
      return NextResponse.json({ ok: true });
    }
    case "file-claim": {
      const updated = fileInsuranceClaim(id);
      if (!updated?.insuranceClaim) return NextResponse.json({ error: "This receivable has no insured portion to claim." }, { status: 400 });
      audit(`Filed insurance claim of ${usd(updated.insuranceClaim.amount)} on ${t.reference} (${updated.insuranceClaim.policyName}).`, "INSURANCE_CLAIM_FILE");
      return NextResponse.json({ ok: true });
    }
    case "decide-claim": {
      const status = String(body.status || "");
      if (status !== "PAID" && status !== "DENIED") return NextResponse.json({ error: "Claim decision must be PAID or DENIED." }, { status: 400 });
      const updated = decideInsuranceClaim(id, status, user.name, body.reference);
      if (!updated?.insuranceClaim) return NextResponse.json({ error: "No filed claim to decide." }, { status: 400 });
      audit(`Insurance claim ${status} on ${t.reference}${status === "PAID" ? " — insured principal recovered" : ""}.`, "INSURANCE_CLAIM_DECIDE");
      return NextResponse.json({ ok: true });
    }
    case "investor-settle": {
      const updated = settleInvestorParticipation(id, user.name);
      if (!updated) return NextResponse.json({ error: "This receivable has no investor participation." }, { status: 400 });
      audit(`Settled investor participation on ${t.reference}.`, "INVESTOR_SETTLE");
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: `Unknown action '${action}'.` }, { status: 400 });
  }
}
