import { NextResponse } from "next/server";
import { buildReport } from "@/lib/reports";
import { csvResponse } from "@/lib/csvexport";
import { currentUserCan } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  if (!(await currentUserCan("VIEW_REPORTS"))) {
    return NextResponse.json({ error: "Not permitted to view reports." }, { status: 403 });
  }
  const { report } = await params;
  const built = buildReport(report);
  if (!built) {
    return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  }
  return csvResponse(built.filename, built.csv);
}
