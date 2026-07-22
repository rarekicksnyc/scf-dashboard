import { NextResponse } from "next/server";
import { fetchSofr, sofrRateRows } from "@/lib/sofr";
import { replaceRates, addAudit } from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";

// Pull the latest official SOFR fixing from the NY Fed and refresh the SOFR
// rate rows. Permission-gated + audited, like a rate-sheet upload.
export async function POST() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to refresh rates.` }, { status: 403 });
  }

  let fixing;
  try {
    fixing = await fetchSofr();
  } catch (e) {
    return NextResponse.json(
      { error: `Could not reach the NY Fed SOFR feed: ${e instanceof Error ? e.message : "unknown error"}` },
      { status: 502 },
    );
  }

  const rows = sofrRateRows(fixing);
  replaceRates("SOFR", rows);
  addAudit({
    actorUserId: user.id,
    actorName: user.name,
    action: "RATE_REFRESH",
    entityType: "RATE",
    entityId: "SOFR",
    detail: `Pulled SOFR ${fixing.rate}% (as of ${fixing.effectiveDate}) from the NY Fed and applied across ${rows.length} tenor buckets.`,
  });

  return NextResponse.json({ ok: true, rate: fixing.rate, effectiveDate: fixing.effectiveDate, count: rows.length });
}
