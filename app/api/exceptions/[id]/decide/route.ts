import { NextResponse } from "next/server";
import { getException, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { mm } from "@/lib/format";

// Maker-checker decision on an exception. Enforces two controls:
//  1. the acting user must hold APPROVE_EXCEPTION;
//  2. the checker may not be the maker who submitted the batch (segregation of
//     duties) — you cannot approve your own work.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const exc = getException(id);
  if (!exc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!roleHas(user.role, "APPROVE_EXCEPTION")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to decide exceptions.` },
      { status: 403 },
    );
  }
  if (exc.makerUserId === user.id) {
    return NextResponse.json(
      { error: "Maker-checker: you cannot approve an exception on a batch you submitted." },
      { status: 403 },
    );
  }
  if (exc.status !== "OPEN") {
    return NextResponse.json(
      { error: `Exception already ${exc.status.toLowerCase()}.` },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const decision = body?.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const comment = typeof body?.comment === "string" ? body.comment : undefined;

  exc.status = decision;
  exc.decidedByUserId = user.id;
  exc.decidedByName = user.name;
  exc.decidedAt = new Date().toISOString();
  exc.comment = comment;

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: decision === "APPROVED" ? "EXCEPTION_APPROVE" : "EXCEPTION_REJECT",
    entityType: "EXCEPTION",
    entityId: exc.id,
    detail: `${exc.invoiceNumber} (${mm(exc.amount)}) — ${exc.reason}${
      comment ? ` [${comment}]` : ""
    }`,
  });

  return NextResponse.json({ exception: exc });
}
