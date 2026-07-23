import { NextResponse } from "next/server";
import { removeSeller, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Remove a seller (facility) and everything tied only to it — its limits,
// eligible entities, ASR sublimits, and participation agreements. Gated by
// CHANGE_LIMIT and audited; blocked while it has an active forward book.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to remove sellers.` }, { status: 403 });
  }
  try {
    removeSeller(id);
    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "SELLER_DELETE",
      entityType: "SELLER",
      entityId: id,
      detail: `Removed seller ${id} and its limits, entities, ASR sublimits, and participation agreements.`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
