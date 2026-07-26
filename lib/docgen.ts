import type { DocTemplateType } from "@/lib/types";
import { usd } from "@/lib/format";
import { DAY_COUNT_BASIS } from "@/lib/config";

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

// The discount / fee tokens derived from the priced deal. Discount is the full
// customer price reduction (margin + base rate); revenue is the MARGIN-ONLY slice
// (base rate is MUFG's funding cost, not income). Purchase price = coverage −
// discount. Isomorphic so the preview and the export/email agree.
export function pricingTokens(o: { coverage: number; pricingBps: number; baseRatePct: number; tenorDays: number }): DocTokens {
  const t = Math.max(o.tenorDays, 0) / DAY_COUNT_BASIS;
  const marginDec = o.pricingBps / 10000;
  const baseDec = o.baseRatePct / 100;
  const discount = o.coverage * (marginDec + baseDec) * t;
  const revenue = o.coverage * marginDec * t; // margin-only
  return {
    base_rate: `${o.baseRatePct.toFixed(2)}%`,
    discount_rate: `${(o.pricingBps / 100 + o.baseRatePct).toFixed(2)}%`,
    discount: usd(discount),
    purchase_price: usd(o.coverage - discount),
    commitment_fee: usd(revenue),
    revenue: usd(revenue),
  };
}

// Investor-portion pricing. The client is funded at COF + margin; the investor
// participates at the interpolated SOFR + (margin − skim). Since COF > SOFR, the
// bank keeps the differential plus the skim. These tokens drive the separate
// investor Schedule A.
export function investorTokens(o: { investorName: string; investorAmount: number; skimBps: number; marginBps: number; interpSofrPct: number; tenorDays: number }): DocTokens {
  const investorMarginBps = o.marginBps - o.skimBps;
  const investorRatePct = o.interpSofrPct + investorMarginBps / 100;
  const t = Math.max(o.tenorDays, 0) / DAY_COUNT_BASIS;
  const discount = o.investorAmount * (investorRatePct / 100) * t;
  return {
    investor_name: o.investorName,
    investor_amount: usd(o.investorAmount),
    skim_bps: String(o.skimBps),
    investor_base: `${o.interpSofrPct.toFixed(3)}%`,
    investor_margin: `${investorMarginBps} bps`,
    investor_rate: `${investorRatePct.toFixed(3)}%`,
    investor_discount: usd(discount),
    investor_purchase_price: usd(o.investorAmount - discount),
  };
}

// Schedule A is a per-seller, per-product column-spec template: one column per
// non-blank line, each "Header|token" (token from the deal tokens). This makes
// Schedule A editable and different per seller. Returns header + one row.
export function scheduleAFromSpec(spec: string, tokens: DocTokens): { columns: string[]; row: string[] } {
  const columns: string[] = [];
  const row: string[] = [];
  for (const raw of spec.split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [header, token] = line.split("|").map((s) => s.trim());
    columns.push(header || token || "");
    row.push(token ? tokens[token.toLowerCase()] ?? "" : "");
  }
  return { columns, row };
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
  scheduleSpec: string; // Schedule A column spec (per seller/product)
  investor?: { spec: string; tokens: DocTokens }; // optional investor Schedule A
}): GeneratedDoc[] {
  const { isUtrc, tokens, requestBody, scheduleSpec, investor } = opts;
  const requestTitle = isUtrc ? "Commitment Request" : "Purchase Request";
  const table = scheduleAFromSpec(scheduleSpec, tokens);
  const docs: GeneratedDoc[] = [
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
  // Investor deals get a separate Schedule A for the investor portion only.
  if (investor) {
    const invTable = scheduleAFromSpec(investor.spec, investor.tokens);
    docs.push({ key: "SCHEDULE_A_INVESTOR", title: "Schedule A (Investor)", kind: "SCHEDULE_A", html: scheduleAHtml("Schedule A — Investor", invTable), table: invTable });
  }
  return docs;
}
