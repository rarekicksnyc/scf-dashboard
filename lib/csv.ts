import type { Invoice, Currency } from "@/lib/types";

// Minimal, dependency-free CSV parser for the invoice batch template. Handles
// quoted fields and commas inside quotes; not a full RFC-4180 implementation
// but sufficient for the well-formed batch files this MVP ingests.
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const REQUIRED = [
  "invoice_number",
  "seller_id",
  "obligor_id",
  "invoice_amount",
  "currency",
  "issue_date",
  "due_date",
  "requested_discount_date",
];

export interface ParseResult {
  invoices: Invoice[];
  errors: string[];
}

export function parseInvoiceCsv(text: string): ParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { invoices: [], errors: ["File is empty."] };
  }

  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return {
      invoices: [],
      errors: [`Missing required column(s): ${missing.join(", ")}.`],
    };
  }

  const idx = (col: string) => header.indexOf(col);
  const invoices: Invoice[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseLine(lines[r]);
    const amountRaw = cells[idx("invoice_amount")]?.replace(/[$,]/g, "");
    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) {
      errors.push(`Row ${r + 1}: invalid invoice_amount '${cells[idx("invoice_amount")]}'.`);
    }
    invoices.push({
      invoiceNumber: cells[idx("invoice_number")] ?? "",
      sellerId: cells[idx("seller_id")] ?? "",
      obligorId: cells[idx("obligor_id")] ?? "",
      amount: Number.isNaN(amount) ? 0 : amount,
      currency: (cells[idx("currency")] ?? "USD") as Currency,
      issueDate: cells[idx("issue_date")] ?? "",
      dueDate: cells[idx("due_date")] ?? "",
      requestedDiscountDate: cells[idx("requested_discount_date")] ?? "",
    });
  }

  return { invoices, errors };
}
