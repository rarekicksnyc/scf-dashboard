import { NextResponse } from "next/server";
import {
  getSeller,
  getObligor,
  addObligor,
  addSellerObligorLimit,
  updateObligor,
  sellerObligorLimit,
  allSellers,
  addAudit,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Add an obligor to a seller's facility (ASR approved list) — or to ALL sellers
// at once. Either links an existing obligor or creates a new one inline, then
// records the ASR sublimit (amount + max tenor) and the obligor group approval
// expiry, so the obligor is properly linked to the facility. Gated by CHANGE_LIMIT.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to change limits.` }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  const toAllSellers = b.allSellers === true;

  const asrSublimit = Number(b.asrSublimit);
  const maxTenorDays = Number(b.maxTenorDays);
  if (!(asrSublimit >= 0)) return NextResponse.json({ error: "ASR sublimit must be a number." }, { status: 422 });
  if (!(maxTenorDays > 0)) return NextResponse.json({ error: "Max tenor (days) is required." }, { status: 422 });
  const groupExpiry = typeof b.groupExpiry === "string" ? b.groupExpiry : "";

  // Target sellers: one selected seller, or every seller.
  const targets = toAllSellers ? allSellers() : [getSeller(b.sellerId)].filter(Boolean);
  if (targets.length === 0) return NextResponse.json({ error: "Unknown seller." }, { status: 422 });

  // Resolve the obligor once (create it if new).
  let obligorId: string;
  let obligorName: string;
  if (b.mode === "NEW") {
    const cdl = String(b.cdl ?? "");
    if (!b.name || !/^\d{8}$/.test(cdl)) {
      return NextResponse.json({ error: "New obligor needs a name and an 8-digit CDL." }, { status: 422 });
    }
    if (!groupExpiry) {
      return NextResponse.json({ error: "A group approval expiry date is required for a new obligor." }, { status: 422 });
    }
    const created = addObligor({
      name: String(b.name).trim(),
      cdl,
      country: b.country || "US",
      masterLimit: Number(b.masterLimit) || 0,
      maxTenorDays,
      expiryDate: groupExpiry, // sets both the master-limit expiry and the group expiry
    });
    obligorId = created.id;
    obligorName = created.name;
  } else {
    const obligor = getObligor(b.obligorId);
    if (!obligor) return NextResponse.json({ error: "Unknown obligor." }, { status: 422 });
    obligorId = obligor.id;
    obligorName = obligor.name;
    if (groupExpiry) updateObligor(obligorId, { expiryDate: groupExpiry });
  }

  // Link to each target seller not already carrying it.
  let linked = 0;
  const skipped: string[] = [];
  for (const s of targets) {
    if (sellerObligorLimit(s!.id, obligorId)) { skipped.push(s!.name); continue; }
    addSellerObligorLimit(s!.id, obligorId, asrSublimit, maxTenorDays);
    linked += 1;
  }

  if (linked === 0) {
    return NextResponse.json({ error: `${obligorName} is already on ${skipped.length === 1 ? "this seller" : "every selected seller"}'s ASR list.` }, { status: 422 });
  }

  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "FACILITY_OBLIGOR_ADD",
    entityType: "ASR_SUBLIMIT",
    entityId: toAllSellers ? `ALL/${obligorId}` : `${targets[0]!.id}/${obligorId}`,
    detail: `Added ${obligorName} to ${linked} seller ASR list(s) — sublimit ${asrSublimit.toLocaleString()}, max tenor ${maxTenorDays}d, group expiry ${groupExpiry || "—"}${skipped.length ? ` (already on ${skipped.length})` : ""}.`,
  });

  return NextResponse.json({ ok: true, linked, skipped, obligorId });
}
