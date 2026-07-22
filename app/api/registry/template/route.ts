import { NextResponse } from "next/server";
import { currentUserCan } from "@/lib/auth";
import { xlsxResponse, type Cell } from "@/lib/xlsxexport";

// Empty (with examples) Excel template for the bulk add-to-register upload.
export async function GET() {
  if (!(await currentUserCan("CHANGE_LIMIT"))) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const rows: Cell[][] = [
    ["SELLER", "Acme Components Inc", "10099001", "", 100000000, 150, "2027-12-31", ""],
    ["OBLIGOR", "Global Buyer Co", "20099001", "", 40000000, 120, "2027-12-31", "US"],
    ["LIMIT", "Acme Components Inc", "10099001", "SWINGLINE", 30000000, 45, "2027-12-31", ""],
  ];

  return xlsxResponse(
    "register-template.xlsx",
    "Register",
    [
      { header: "record_type", width: 14 }, // SELLER | OBLIGOR | LIMIT
      { header: "name", width: 30 },
      { header: "cdl", width: 12 }, // 8-digit
      { header: "limit_type", width: 16 }, // for LIMIT rows: SELLER/ASR/OBLIGOR/SWINGLINE/RRL/RRL_SWINGLINE
      { header: "approved_limit", width: 16 },
      { header: "max_tenor_days", width: 14 },
      { header: "expiry_date", width: 12 },
      { header: "country", width: 10 }, // obligor only
    ],
    rows,
  );
}
