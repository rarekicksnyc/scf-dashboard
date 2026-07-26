import { NextResponse } from "next/server";
import { getRevision } from "@/lib/data/store";

// Tiny polling endpoint for live sync. Clients read the global change counter and
// refresh their view only when it moves — so idle screens never refresh, and a
// change made by any user shows up on everyone else's next poll. Behind the auth
// gate (logged-in users only), so no extra permission needed.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rev: getRevision() }, { headers: { "cache-control": "no-store" } });
}
