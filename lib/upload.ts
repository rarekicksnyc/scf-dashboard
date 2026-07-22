import * as XLSX from "xlsx";
import { allSellers, allObligors } from "@/lib/data/store";
import type { Invoice, Currency, PcgFlag, RateRow, BaseRateType, ProductType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Flexible batch ingestion. Accepts either a CSV or an .xlsx file with the
// strict template columns OR the looser business columns (seller, seller PCG,
// obligor, obligor PCG, invoice amount, invoice number [optional]). Sellers and
// obligors resolve by id, name, or CDL. Missing dates default; a missing
// invoice number is auto-generated. A single row (one invoice) is fine.
// ---------------------------------------------------------------------------

export interface ParsedUpload {
  invoices: Invoice[];
  warnings: string[];
}

function normKey(k: string): string {
  return k.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function rowGetter(row: Record<string, unknown>) {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) norm[normKey(k)] = String(v ?? "").trim();
  return (keys: string[]): string => {
    for (const key of keys) if (norm[key]) return norm[key];
    return "";
  };
}

function pcg(v: string): PcgFlag | undefined {
  const u = v.toUpperCase().replace(/\s/g, "");
  if (["Y", "YES"].includes(u)) return "Y";
  if (["N", "NO"].includes(u)) return "N";
  if (["N/A", "NA"].includes(u)) return "N/A";
  return undefined;
}

function resolveSellerId(v: string): string {
  if (!v) return "";
  const q = v.trim().toLowerCase();
  const s = allSellers().find(
    (x) => x.id.toLowerCase() === q || x.name.toLowerCase() === q || x.cdl === v.trim(),
  );
  return s?.id ?? v.trim();
}

function resolveObligorId(v: string): string {
  if (!v) return "";
  const q = v.trim().toLowerCase();
  const o = allObligors().find(
    (x) => x.id.toLowerCase() === q || x.name.toLowerCase() === q || x.cdl === v.trim(),
  );
  return o?.id ?? v.trim();
}

function isoToday(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export function parseRowObjects(rows: Record<string, unknown>[]): ParsedUpload {
  const invoices: Invoice[] = [];
  const warnings: string[] = [];

  rows.forEach((row, i) => {
    const get = rowGetter(row);
    // Skip fully blank rows.
    if (Object.values(row).every((v) => String(v ?? "").trim() === "")) return;

    const sellerRaw = get(["seller_id", "sellerid", "seller", "seller_name", "sellername", "eligible_seller"]);
    const obligorRaw = get(["obligor_id", "obligorid", "obligor", "obligor_name", "obligorname", "eligible_obligor", "eligible_buyer", "buyer"]);
    const amountRaw = get(["invoice_amount", "amount", "invoiceamount", "invoice_amt"]).replace(/[$,]/g, "");
    const amount = Number(amountRaw);
    const invNo = get(["invoice_number", "invoicenumber", "invoice_no", "invoice_num"]);

    if (Number.isNaN(amount)) warnings.push(`Row ${i + 2}: invalid amount '${amountRaw}'.`);

    const sellerId = resolveSellerId(sellerRaw);
    const obligorId = resolveObligorId(obligorRaw);
    if (sellerRaw && !allSellers().some((s) => s.id === sellerId))
      warnings.push(`Row ${i + 2}: unrecognized seller '${sellerRaw}'.`);
    if (obligorRaw && !allObligors().some((o) => o.id === obligorId))
      warnings.push(`Row ${i + 2}: unrecognized obligor '${obligorRaw}'.`);

    const due = get(["due_date", "duedate", "maturity", "maturity_date", "invoice_due_date", "commitment_due_date"]);
    const value = get(["requested_discount_date", "value_date", "valuedate", "discount_date", "purchase_date", "commitment_date"]);
    const issue = get(["issue_date", "issuedate", "invoice_date"]);

    // Schedule A / UTRC pricing fields (optional).
    const coverage = Number(get(["coverage_amount", "coverage", "commitment_amount"]).replace(/[$,]/g, "")) || undefined;
    let adv = Number(get(["advance_rate", "advancerate", "applicable_purchase_percentage", "purchase_percentage"]).replace(/%/g, ""));
    if (adv > 1.5) adv = adv / 100; // percent → decimal
    const marginRaw = Number(get(["margin", "margin_rate", "pricing", "applicable_margin_rate"]).replace(/[%bps]/gi, ""));
    const productRaw = get(["product", "product_type", "producttype"]).toUpperCase();
    const productType: ProductType | undefined = productRaw === "UTRC" ? "UTRC" : productRaw === "DTR" ? "DTR" : undefined;

    invoices.push({
      invoiceNumber: invNo || `AUTO-${i + 1}`,
      sellerId,
      obligorId,
      amount: Number.isNaN(amount) ? 0 : amount,
      currency: (get(["currency", "ccy"]) || "USD").toUpperCase() as Currency,
      issueDate: issue || isoToday(),
      dueDate: due || isoToday(90),
      requestedDiscountDate: value || isoToday(),
      sellerPcg: pcg(get(["seller_pcg", "sellerpcg", "seller_parent_company_guarantee"])),
      obligorPcg: pcg(get(["obligor_pcg", "obligorpcg", "obligor_parent_company_guarantee"])),
      coverageAmount: coverage,
      advanceRate: adv > 0 ? adv : undefined,
      marginBps: marginRaw > 0 ? Math.round(marginRaw * 100) : undefined, // 1.15 -> 115 bps
      productType,
    });
  });

  return { invoices, warnings };
}

// Parse CSV into row objects (header-keyed), then map.
function csvToRows(text: string): Record<string, string>[] {
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
}

export function parseCsvFlexible(text: string): ParsedUpload {
  return parseRowObjects(csvToRows(text));
}

export function parseXlsx(base64: string): ParsedUpload {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { invoices: [], warnings: ["No sheet found in workbook."] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return parseRowObjects(rows);
}

// ---------------------------------------------------------------------------
// Rate sheet upload — columns: start days / value date, maturity, bid, offer,
// calcrate, error. Offer is the used rate.
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function parseRateRows(rows: Record<string, unknown>[], rateType: BaseRateType): RateRow[] {
  const out: RateRow[] = [];
  for (const row of rows) {
    if (Object.values(row).every((v) => String(v ?? "").trim() === "")) continue;
    const get = rowGetter(row);
    const startDate = get(["start_days", "startdays", "start_date", "value_date", "valuedate", "start"]);
    const maturityDate = get(["maturity", "maturity_date", "maturitydate", "end_date"]);
    if (!startDate || !maturityDate) continue;
    out.push({
      rateType,
      startDate,
      maturityDate,
      tenorDays: daysBetween(startDate, maturityDate),
      bid: Number(get(["bid"]).replace(/%/g, "")) || 0,
      offer: Number(get(["offer"]).replace(/%/g, "")) || 0,
      calcRate: Number(get(["calcrate", "calc_rate", "calculated_rate"]).replace(/%/g, "")) || undefined,
      error: get(["error"]) || undefined,
    });
  }
  return out;
}

export function parseRateCsv(text: string, rateType: BaseRateType): RateRow[] {
  return parseRateRows(csvToRows(text), rateType);
}

export function parseRateXlsx(base64: string, rateType: BaseRateType): RateRow[] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return parseRateRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }), rateType);
}
