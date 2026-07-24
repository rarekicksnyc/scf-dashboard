import type { DocTemplateType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Document generation. Pure + isomorphic (no server/DOM APIs) so the same fill
// logic drives the in-app preview (client) and the Word/Excel export (server).
// Word export is Word-compatible HTML (application/msword) — no extra deps, and
// the same HTML renders the on-page preview.
// ---------------------------------------------------------------------------

export type DocTokens = Record<string, string>;

// Replace {{token}} placeholders. Unknown tokens are left blank (never leak the
// raw {{token}} into a client-facing document).
export function fillTemplate(body: string, tokens: DocTokens): string {
  return body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, key: string) => tokens[key.toLowerCase()] ?? "");
}

// Schedule A is a structured single-transaction table (columns differ by product
// type). Returns header + one row; used for the preview and the .xlsx export.
export function scheduleA(tokens: DocTokens, isUtrc: boolean): { columns: string[]; row: string[] } {
  if (isUtrc) {
    return {
      columns: ["Seller", "Obligor", "Reference", "Currency", "Committed amount", "Commitment date", "Commitment due date", "Final demand date", "Fee margin (bps)"],
      row: [tokens.seller, tokens.obligor, tokens.reference, tokens.currency, tokens.committed_amount, tokens.value_date, tokens.commitment_due_date, tokens.final_demand_date, tokens.pricing_bps],
    };
  }
  return {
    columns: ["Seller", "Obligor", "Reference", "Currency", "Invoice amount", "Advance rate", "Coverage amount", "Value date", "Maturity date", "Margin (bps)"],
    row: [tokens.seller, tokens.obligor, tokens.reference, tokens.currency, tokens.invoice_amount, tokens.advance_rate, tokens.coverage, tokens.value_date, tokens.maturity_date, tokens.pricing_bps],
  };
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A filled Word/preview document rendered as HTML from a plain-text template
// (blank lines become paragraph breaks; a line "Signature: ____" stays as-is).
export function requestDocHtml(title: string, filledBody: string): string {
  const paras = filledBody.split(/\n/).map((line) => (line.trim() === "" ? "<p>&nbsp;</p>" : `<p>${esc(line)}</p>`)).join("");
  return `<h2 style="font-family:Georgia,serif">${esc(title)}</h2>${paras}`;
}

// The Schedule A table as HTML (preview + Word).
export function scheduleAHtml(title: string, table: { columns: string[]; row: string[] }): string {
  const head = table.columns.map((c) => `<th style="border:1px solid #444;padding:6px;text-align:left;background:#eee">${esc(c)}</th>`).join("");
  const body = table.row.map((c) => `<td style="border:1px solid #444;padding:6px">${esc(c)}</td>`).join("");
  return `<h2 style="font-family:Georgia,serif">${esc(title)}</h2><table style="border-collapse:collapse;font-family:Arial;font-size:12px"><thead><tr>${head}</tr></thead><tbody><tr>${body}</tr></tbody></table>`;
}

// Wrap inner HTML into a full Word-openable document.
export function wordDocument(innerHtml: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Document</title></head><body style="font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#111">${innerHtml}</body></html>`;
}

// The set of documents a transaction produces, by product type.
export interface GeneratedDoc {
  key: string; // stable id for export
  title: string;
  kind: "REQUEST" | "SCHEDULE_A";
  templateType?: DocTemplateType; // for REQUEST docs
  html: string; // preview + Word body
  table?: { columns: string[]; row: string[] }; // SCHEDULE_A → Excel
}

export function buildDocSet(opts: {
  isUtrc: boolean;
  tokens: DocTokens;
  requestBody: string; // filled Purchase/Commitment request template text
}): GeneratedDoc[] {
  const { isUtrc, tokens, requestBody } = opts;
  const requestTitle = isUtrc ? "Commitment Request" : "Purchase Request";
  const table = scheduleA(tokens, isUtrc);
  return [
    {
      key: "REQUEST",
      title: requestTitle,
      kind: "REQUEST",
      templateType: isUtrc ? "COMMITMENT_REQUEST" : "PURCHASE_REQUEST",
      html: requestDocHtml(requestTitle, requestBody),
    },
    {
      key: "SCHEDULE_A",
      title: "Schedule A",
      kind: "SCHEDULE_A",
      html: scheduleAHtml("Schedule A", table),
      table,
    },
  ];
}
