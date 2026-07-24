import { NextResponse } from "next/server";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { xlsxResponse } from "@/lib/xlsxexport";

// Render an .xlsx from tabular data the client already has (Schedule A table, or
// a request doc's fields as key/value). Kept dumb: the client sends the sheet
// name, columns, and rows. Gated by UPLOAD_BATCH (transaction booking).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "UPLOAD_BATCH")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to generate documents.` }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const columns = Array.isArray(b.columns) ? b.columns.map((c: unknown) => ({ header: String(c ?? "") })) : [];
  const rows = Array.isArray(b.rows) ? b.rows.map((r: unknown[]) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : (typeof c === "number" ? c : String(c)))) : [])) : [];
  if (columns.length === 0) return NextResponse.json({ error: "No columns." }, { status: 400 });
  const filename = String(b.filename || "schedule-a.xlsx").replace(/[^\w.\-]/g, "_");
  const sheetName = String(b.sheetName || "Sheet1");
  return xlsxResponse(filename, sheetName, columns, rows);
}
