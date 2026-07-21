import { NextResponse } from "next/server";
import {
  addLimit,
  addSeller,
  addObligor,
  addSellerObligorLimit,
  addAudit,
  getSeller,
  getObligor,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Add to the register: a new limit (any type), a new seller/obligor, or an ASR
// approved-obligor sublimit. Gated by CHANGE_LIMIT and audited.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to add to the register.` },
      { status: 403 },
    );
  }

  const b = await request.json().catch(() => null);
  if (!b || !b.kind) {
    return NextResponse.json({ error: "Expected a 'kind'." }, { status: 400 });
  }

  try {
    let audit = "";
    let created: unknown;

    if (b.kind === "LIMIT") {
      if (!b.type || !b.entityType || !b.entityId || !(Number(b.approvedLimit) >= 0)) {
        return NextResponse.json({ error: "Missing limit fields." }, { status: 422 });
      }
      created = addLimit({
        type: b.type,
        entityType: b.entityType,
        entityId: b.entityId,
        approvedLimit: Number(b.approvedLimit),
        maxTenorDays: Number(b.maxTenorDays) || 90,
        expiryDate: b.expiryDate || "2026-12-31",
      });
      audit = `Added ${b.type} limit ${Number(b.approvedLimit).toLocaleString()} for ${b.entityId}.`;
    } else if (b.kind === "SELLER") {
      if (!b.name || !b.cdl) {
        return NextResponse.json({ error: "Seller needs name and CDL." }, { status: 422 });
      }
      created = addSeller({
        name: b.name,
        cdl: b.cdl,
        creditLimit: Number(b.approvedLimit) || 0,
        maxTenorDays: Number(b.maxTenorDays) || 90,
        expiryDate: b.expiryDate || "2026-12-31",
      });
      audit = `Added seller ${b.name} (${b.cdl}) with credit limit ${Number(b.approvedLimit).toLocaleString()}.`;
    } else if (b.kind === "OBLIGOR") {
      if (!b.name || !b.cdl) {
        return NextResponse.json({ error: "Obligor needs name and CDL." }, { status: 422 });
      }
      created = addObligor({
        name: b.name,
        cdl: b.cdl,
        country: b.country || "US",
        masterLimit: Number(b.approvedLimit) || 0,
        maxTenorDays: Number(b.maxTenorDays) || 90,
        expiryDate: b.expiryDate || "2026-12-31",
      });
      audit = `Added obligor ${b.name} (${b.cdl}) with master limit ${Number(b.approvedLimit).toLocaleString()}.`;
    } else if (b.kind === "ASR_SUBLIMIT") {
      if (!getSeller(b.sellerId) || !getObligor(b.obligorId)) {
        return NextResponse.json({ error: "Unknown seller or obligor." }, { status: 422 });
      }
      addSellerObligorLimit(
        b.sellerId,
        b.obligorId,
        Number(b.approvedLimit) || 0,
        Number(b.maxTenorDays) || 90,
      );
      created = { sellerId: b.sellerId, obligorId: b.obligorId };
      audit = `Added ASR sublimit ${Number(b.approvedLimit).toLocaleString()} for ${b.obligorId} under ${b.sellerId}.`;
    } else {
      return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
    }

    addAudit({
      actorUserId: user.id,
      actorName: user.name,
      action: "REGISTRY_ADD",
      entityType: b.kind,
      entityId: (created as { id?: string })?.id ?? b.entityId ?? "—",
      detail: audit,
    });

    return NextResponse.json({ ok: true, created });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
