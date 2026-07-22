import { NextResponse } from "next/server";
import { parseRateCsv, parseRateXlsx } from "@/lib/upload";
import { getRates, replaceRates, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import type { BaseRateType } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ rates: getRates() });
}

// Upload a rate sheet for a base-rate type (replaces that type's rows).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json(
      { error: `Role ${user.role} is not permitted to upload rates.` },
      { status: 403 },
    );
  }
  const b = await request.json().catch(() => null);
  const rateType: BaseRateType = ["COF", "SOFR", "OTHER"].includes(b?.rateType) ? b.rateType : "SOFR";
  if (!b || (typeof b.csv !== "string" && typeof b.fileBase64 !== "string")) {
    return NextResponse.json({ error: "Expected { csv } or { fileBase64 } and rateType." }, { status: 400 });
  }
  const rows = typeof b.fileBase64 === "string" ? parseRateXlsx(b.fileBase64, rateType) : parseRateCsv(b.csv, rateType);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rate rows found." }, { status: 422 });
  }
  replaceRates(rateType, rows);
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "RATE_UPLOAD",
    entityType: "RATE",
    entityId: rateType,
    detail: `Uploaded ${rows.length} ${rateType} rate rows.`,
  });
  return NextResponse.json({ ok: true, count: rows.length, rateType });
}
