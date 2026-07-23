import { NextResponse } from "next/server";
import { currentUserCan } from "@/lib/auth";
import { xlsxResponse, type Cell, type XlsxColumn } from "@/lib/xlsxexport";

// Downloadable Excel templates for the bulk add-to-register upload. A ?type=
// picks a tailored template (sellers, obligors, limits, or obligor-to-facility
// ASR links); the default is a combined template covering seller/obligor/limit.
type TemplateDef = { file: string; sheet: string; columns: XlsxColumn[]; rows: Cell[][] };

const TEMPLATES: Record<string, TemplateDef> = {
  sellers: {
    file: "sellers-template.xlsx",
    sheet: "Sellers",
    columns: [
      { header: "record_type", width: 14 }, // SELLER
      { header: "name", width: 30 },
      { header: "cdl", width: 12 },
      { header: "approved_limit", width: 16 },
      { header: "max_tenor_days", width: 14 },
      { header: "expiry_date", width: 12 },
    ],
    rows: [
      ["SELLER", "Acme Components Inc", "10099001", 100000000, 150, "2027-12-31"],
      ["SELLER", "Beacon Textiles LLC", "10099002", 75000000, 120, "2027-12-31"],
    ],
  },
  obligors: {
    file: "obligors-template.xlsx",
    sheet: "Obligors",
    columns: [
      { header: "record_type", width: 14 }, // OBLIGOR
      { header: "name", width: 30 },
      { header: "cdl", width: 12 },
      { header: "country", width: 10 },
      { header: "approved_limit", width: 16 }, // master limit
      { header: "max_tenor_days", width: 14 },
      { header: "expiry_date", width: 12 }, // group approval expiry
    ],
    rows: [
      ["OBLIGOR", "Global Buyer Co", "20099001", "US", 40000000, 120, "2027-12-31"],
      ["OBLIGOR", "Northwind Retail SA", "20099002", "FR", 25000000, 90, "2027-06-30"],
    ],
  },
  limits: {
    file: "limits-template.xlsx",
    sheet: "Limits",
    columns: [
      { header: "record_type", width: 14 }, // LIMIT
      { header: "name", width: 30 }, // existing seller or obligor
      { header: "cdl", width: 12 },
      { header: "limit_type", width: 16 }, // SELLER/ASR/OBLIGOR/SWINGLINE/RRL/RRL_SWINGLINE/INVESTOR/INSURANCE
      { header: "approved_limit", width: 16 },
      { header: "max_tenor_days", width: 14 },
      { header: "expiry_date", width: 12 },
    ],
    rows: [
      ["LIMIT", "Acme Components Inc", "10099001", "SWINGLINE", 30000000, 45, "2027-12-31"],
      ["LIMIT", "Acme Components Inc", "10099001", "RRL", 20000000, 150, "2027-12-31"],
    ],
  },
  asr: {
    file: "obligor-to-facility-template.xlsx",
    sheet: "ASR obligors",
    columns: [
      { header: "record_type", width: 14 }, // ASR_SUBLIMIT
      { header: "seller_name", width: 26 },
      { header: "seller_cdl", width: 12 },
      { header: "obligor_name", width: 26 },
      { header: "obligor_cdl", width: 12 },
      { header: "country", width: 10 }, // used only if the obligor is created
      { header: "master_limit", width: 16 }, // used only if the obligor is created
      { header: "asr_sublimit", width: 16 },
      { header: "max_tenor_days", width: 14 },
      { header: "group_expiry", width: 12 },
    ],
    rows: [
      // Same obligor added to two sellers — repeat the row per seller.
      ["ASR_SUBLIMIT", "Acme Components Inc", "10099001", "Global Buyer Co", "20099001", "US", 40000000, 25000000, 150, "2027-12-31"],
      ["ASR_SUBLIMIT", "Beacon Textiles LLC", "10099002", "Global Buyer Co", "20099001", "US", 40000000, 15000000, 120, "2027-12-31"],
    ],
  },
};

// Combined default (backward compatible with the original single button).
const COMBINED: TemplateDef = {
  file: "register-template.xlsx",
  sheet: "Register",
  columns: [
    { header: "record_type", width: 14 }, // SELLER | OBLIGOR | LIMIT
    { header: "name", width: 30 },
    { header: "cdl", width: 12 },
    { header: "limit_type", width: 16 },
    { header: "approved_limit", width: 16 },
    { header: "max_tenor_days", width: 14 },
    { header: "expiry_date", width: 12 },
    { header: "country", width: 10 },
  ],
  rows: [
    ["SELLER", "Acme Components Inc", "10099001", "", 100000000, 150, "2027-12-31", ""],
    ["OBLIGOR", "Global Buyer Co", "20099001", "", 40000000, 120, "2027-12-31", "US"],
    ["LIMIT", "Acme Components Inc", "10099001", "SWINGLINE", 30000000, 45, "2027-12-31", ""],
  ],
};

export async function GET(request: Request) {
  if (!(await currentUserCan("CHANGE_LIMIT"))) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  const type = new URL(request.url).searchParams.get("type") ?? "";
  const def = TEMPLATES[type] ?? COMBINED;
  return xlsxResponse(def.file, def.sheet, def.columns, def.rows);
}
