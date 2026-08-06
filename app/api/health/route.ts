import { NextResponse } from "next/server";
import { persistenceEnabled, lastPersistError, lastPersistAt } from "@/lib/data/persistence";

// Lightweight, public liveness/readiness probe for uptime monitoring. Reports the
// process as up and whether the snapshot persistence loop is healthy (no leak of
// business data). A monitor should alert if `ok` is false or persistence stalls.
export const dynamic = "force-dynamic";

export async function GET() {
  const persistOk = !persistenceEnabled() || lastPersistError() === null;
  return NextResponse.json(
    {
      ok: persistOk,
      status: persistOk ? "healthy" : "degraded",
      persistence: {
        enabled: persistenceEnabled(),
        lastSaveAt: lastPersistAt(),
        lastError: lastPersistError(),
      },
      time: new Date().toISOString(),
    },
    { status: persistOk ? 200 : 503 },
  );
}
