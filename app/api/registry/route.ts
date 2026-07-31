import { NextResponse } from "next/server";
import {
  addLimit,
  addSeller,
  addObligor,
  addSellerObligorLimit,
  addSellerEntity,
  addObligorEntity,
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

  // Any record that books exposure needs an 8-digit CDL.
  const isCdl = (v: unknown) => typeof v === "string" && /^\d{8}$/.test(v);

  try {
    let audit = "";
    let created: unknown;

    if (b.kind === "LIMIT") {
      if (!b.type || !b.entityType || !b.entityId || !(Number(b.approvedLimit) >= 0)) {
        return NextResponse.json({ error: "Missing limit fields." }, { status: 422 });
      }
      if (!isCdl(b.cdl)) {
        return NextResponse.json({ error: "A CDL is required — an 8-digit customer code." }, { status: 422 });
      }
      // Four-eyes: a new limit needs a GCARS/approval reference and does not grant
      // capacity until a second user approves it in the limit-approvals queue.
      const reference = typeof b.reference === "string" ? b.reference.trim() : "";
      if (!reference) {
        return NextResponse.json({ error: "A GCARS / credit-approval reference is required to add a limit." }, { status: 422 });
      }
      created = addLimit({
        type: b.type,
        cdl: b.cdl,
        entityType: b.entityType,
        entityId: b.entityId,
        approvedLimit: Number(b.approvedLimit),
        maxTenorDays: Number(b.maxTenorDays) || 90,
        expiryDate: b.expiryDate || "2026-12-31",
        approval: { reference, requestedBy: user.id, requestedByName: user.name },
      });
      audit = `Requested ${b.type} limit ${Number(b.approvedLimit).toLocaleString()} (CDL ${b.cdl}) for ${b.entityId} — pending four-eyes approval (ref ${reference}).`;
    } else if (b.kind === "SELLER") {
      if (!b.name || !isCdl(b.cdl)) {
        return NextResponse.json({ error: "Seller needs a name and an 8-digit CDL." }, { status: 422 });
      }
      // Four-eyes: the seller's master credit limit is minted PENDING and grants
      // no capacity until a second user approves it in the limit-approvals queue.
      const reference = typeof b.reference === "string" ? b.reference.trim() : "";
      if (!reference) return NextResponse.json({ error: "A GCARS / credit-approval reference is required to add a seller." }, { status: 422 });
      created = addSeller({
        name: b.name,
        cdl: b.cdl,
        creditLimit: Number(b.approvedLimit) || 0,
        maxTenorDays: Number(b.maxTenorDays) || 90,
        expiryDate: b.expiryDate || "2026-12-31",
        approval: { reference, requestedBy: user.id, requestedByName: user.name },
      });
      audit = `Added seller ${b.name} (${b.cdl}); credit limit ${Number(b.approvedLimit).toLocaleString()} pending four-eyes approval (ref ${reference}).`;
    } else if (b.kind === "OBLIGOR") {
      if (!b.name || !isCdl(b.cdl)) {
        return NextResponse.json({ error: "Obligor needs a name and an 8-digit CDL." }, { status: 422 });
      }
      // Four-eyes: the obligor's master limit is minted PENDING and grants no
      // capacity until a second user approves it in the limit-approvals queue.
      const reference = typeof b.reference === "string" ? b.reference.trim() : "";
      if (!reference) return NextResponse.json({ error: "A GCARS / credit-approval reference is required to add an obligor." }, { status: 422 });
      created = addObligor({
        name: b.name,
        cdl: b.cdl,
        country: b.country || "US",
        masterLimit: Number(b.approvedLimit) || 0,
        maxTenorDays: Number(b.maxTenorDays) || 90,
        expiryDate: b.expiryDate || "2026-12-31",
        approval: { reference, requestedBy: user.id, requestedByName: user.name },
      });
      audit = `Added obligor ${b.name} (${b.cdl}); master limit ${Number(b.approvedLimit).toLocaleString()} pending four-eyes approval (ref ${reference}).`;
    } else if (b.kind === "ASR_SUBLIMIT") {
      if (!getSeller(b.sellerId) || !getObligor(b.obligorId)) {
        return NextResponse.json({ error: "Unknown seller or obligor." }, { status: 422 });
      }
      const reference = typeof b.reference === "string" ? b.reference.trim() : "";
      if (!reference) return NextResponse.json({ error: "A GCARS / credit-approval reference is required to add an ASR sublimit." }, { status: 422 });
      addSellerObligorLimit(
        b.sellerId,
        b.obligorId,
        Number(b.approvedLimit) || 0,
        Number(b.maxTenorDays) || 90,
        { reference, requestedBy: user.id, requestedByName: user.name },
      );
      created = { sellerId: b.sellerId, obligorId: b.obligorId };
      audit = `Requested ASR sublimit ${Number(b.approvedLimit).toLocaleString()} for ${b.obligorId} under ${b.sellerId} — pending four-eyes (ref ${reference}).`;
    } else if (b.kind === "SELLER_ENTITY") {
      if (!b.name || !isCdl(b.cdl)) return NextResponse.json({ error: "Entity needs a name and an 8-digit CDL." }, { status: 422 });
      if (!getSeller(b.groupId)) return NextResponse.json({ error: "Choose the seller group to add the entity under." }, { status: 422 });
      created = addSellerEntity({ facilityId: b.groupId, name: b.name, cdl: b.cdl, domicile: b.country || "US" });
      audit = `Added seller legal entity ${b.name} (${b.cdl}) under ${b.groupId}.`;
    } else if (b.kind === "OBLIGOR_ENTITY") {
      if (!b.name || !isCdl(b.cdl)) return NextResponse.json({ error: "Entity needs a name and an 8-digit CDL." }, { status: 422 });
      if (!getObligor(b.groupId)) return NextResponse.json({ error: "Choose the obligor group to add the entity under." }, { status: 422 });
      created = addObligorEntity({ groupId: b.groupId, name: b.name, cdl: b.cdl, bookingCdl: b.bookingCdl || b.cdl, domicile: b.country || "US" });
      audit = `Added obligor legal entity ${b.name} (${b.cdl}) under ${b.groupId}.`;
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
