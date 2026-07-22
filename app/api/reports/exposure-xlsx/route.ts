import { NextResponse } from "next/server";
import { entityExposures } from "@/lib/exposure";
import { currentUserCan } from "@/lib/auth";
import { xlsxResponse, type Cell } from "@/lib/xlsxexport";

// Formatted Excel export of the exposure summary for a selected set of names.
// `ids` is a comma-separated list of `SELLER:id` / `OBLIGOR:id` keys; empty ->
// all names. Mirrors what the on-screen selection shows.
export async function GET(request: Request) {
  if (!(await currentUserCan("VIEW_REPORTS"))) {
    return NextResponse.json({ error: "Not permitted to view reports." }, { status: 403 });
  }

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const wanted = new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean));

  let rows = entityExposures();
  if (wanted.size > 0) rows = rows.filter((r) => wanted.has(`${r.kind}:${r.id}`));
  rows.sort((a, b) => b.outstanding - a.outstanding);

  const body: Cell[][] = rows.map((r) => [
    r.kind === "SELLER" ? "Seller" : "Obligor",
    r.name,
    r.cdl,
    Math.round(r.approved),
    Math.round(r.outstanding),
    Math.round(r.reserved),
    Math.round(r.available),
    Number((r.utilizationPct * 100).toFixed(1)),
  ]);

  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const totApproved = sum("approved");
  const totConsumed = sum("outstanding") + sum("reserved");
  body.push([
    `Total (${rows.length})`,
    "",
    "",
    Math.round(totApproved),
    Math.round(sum("outstanding")),
    Math.round(sum("reserved")),
    Math.round(sum("available")),
    totApproved > 0 ? Number(((totConsumed / totApproved) * 100).toFixed(1)) : 0,
  ]);

  return xlsxResponse(
    "exposure-summary.xlsx",
    "Exposure",
    [
      { header: "Type", width: 10 },
      { header: "Name", width: 34 },
      { header: "CDL", width: 12 },
      { header: "Approved (USD)", width: 16 },
      { header: "Outstanding (USD)", width: 17 },
      { header: "Reserved (USD)", width: 16 },
      { header: "Available (USD)", width: 16 },
      { header: "Utilization %", width: 13 },
    ],
    body,
  );
}
