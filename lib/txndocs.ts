import * as XLSX from "xlsx";
import { getDocTemplate, interpolateSofr, listTemplateFields } from "@/lib/data/store";
import { fillTemplate, buildDocSet, pricingTokens, investorTokens, scheduleAFromSpec, requestDocHtml, wordDocument, type DocTokens } from "@/lib/docgen";
import { usd, daysBetween } from "@/lib/format";
import { evaluateExpression, toNumber } from "@/lib/creator/expr";
import type { TransactionWorkflow, DocTemplateType } from "@/lib/types";
import type { EmlAttachment } from "@/lib/email";

// Creator-Mode DOCUMENT fields → {{cf_<key>}} tokens usable in any file template.
// Formula fields evaluate the safe evaluator over the deal surface; text/dropdown
// resolve to their value/default. Prefixed cf_ so they never collide with built-ins.
function documentCustomTokens(wf: TransactionWorkflow): DocTokens {
  const defs = listTemplateFields("DOCUMENT");
  if (defs.length === 0) return {};
  const ctx = {
    coverage: wf.coverage,
    amount: wf.amount,
    advance_rate: wf.advanceRate,
    pricing_bps: wf.pricingBps,
    base_rate: wf.baseRate ?? 0,
    tenor_days: daysBetween(wf.valueDate, wf.maturityDate),
    investor_amount: wf.investorAmount ?? 0,
    skim_bps: wf.skimBps ?? 0,
  };
  const out: DocTokens = {};
  for (const f of defs) {
    let v = "";
    if (f.kind === "text") v = f.text ?? "";
    else if (f.kind === "dropdown") v = f.options?.[0] ?? "";
    else {
      const { value, error } = evaluateExpression(f.formula ?? "", ctx);
      if (error === undefined && value !== undefined) {
        const n = toNumber(value);
        v = f.format === "currency" ? usd(n) : f.format === "percent" ? `${(n * 100).toFixed(1)}%` : f.format === "bps" ? `${Math.round(n)} bps` : f.format === "text" ? String(value) : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
      }
    }
    out[`cf_${f.key}`] = v;
  }
  return out;
}

// Server-side generation of a workflow's documents and email drafts. Mirrors the
// client DocsSection token building so preview and export/email stay identical.

const slug = (s: string) => String(s ?? "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

export function workflowTokens(wf: TransactionWorkflow): DocTokens {
  const isUtrc = wf.productType === "UTRC";
  const tenorDays = daysBetween(wf.valueDate, isUtrc ? (wf.finalDemandDate || wf.maturityDate) : wf.maturityDate);
  const inv = !isUtrc && wf.investorAmount && wf.investorAmount > 0
    ? investorTokens({ investorName: wf.investorName ?? "", investorAmount: wf.investorAmount, skimBps: wf.skimBps ?? 0, marginBps: wf.pricingBps, interpSofrPct: interpolateSofr(daysBetween(wf.valueDate, wf.maturityDate)) ?? 0, tenorDays: daysBetween(wf.valueDate, wf.maturityDate) })
    : {};
  return {
    ...inv,
    seller: wf.sellerName,
    obligor: wf.obligorName,
    reference: wf.reference,
    currency: wf.currency,
    product_type: wf.productType,
    invoice_amount: usd(wf.amount),
    advance_rate: `${Math.round(wf.advanceRate * 100)}%`,
    coverage: usd(wf.coverage),
    committed_amount: usd(wf.amount),
    value_date: wf.valueDate,
    maturity_date: wf.maturityDate,
    commitment_due_date: wf.commitmentDueDate ?? "",
    final_demand_date: wf.finalDemandDate ?? "",
    pricing_bps: String(wf.pricingBps),
    today: wf.createdAt.slice(0, 10),
    primary_amount: isUtrc ? usd(wf.amount) : usd(wf.coverage),
    document_name: isUtrc ? "Commitment Request" : "Purchase Request",
    ...pricingTokens({ coverage: wf.coverage, pricingBps: wf.pricingBps, baseRatePct: wf.baseRate ?? 0, tenorDays }),
    ...documentCustomTokens(wf),
  };
}

function xlsxBase64(sheetName: string, columns: string[], row: string[]): string {
  const ws = XLSX.utils.aoa_to_sheet([columns, row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf.toString("base64");
}

// The generated request doc (Word) + Schedule A (Excel) as email attachments.
// The investor Schedule A is the investor's own document — it is EXCLUDED from
// the client execution email (the client must not see the investor's terms) and
// only included where opts.includeInvestor is set (the booking-team email).
export function workflowAttachments(wf: TransactionWorkflow, opts: { includeInvestor?: boolean } = {}): EmlAttachment[] {
  const isUtrc = wf.productType === "UTRC";
  const tokens = workflowTokens(wf);
  const reqType: DocTemplateType = isUtrc ? "COMMITMENT_REQUEST" : "PURCHASE_REQUEST";
  const requestBody = fillTemplate(getDocTemplate(reqType, wf.sellerId)?.body ?? "", tokens);
  const scheduleSpec = getDocTemplate(isUtrc ? "SCHEDULE_A_UTRC" : "SCHEDULE_A_DTR", wf.sellerId)?.body ?? "";

  // Investor deals get a separate investor Schedule A at the interpolated SOFR.
  let investor: { spec: string; tokens: DocTokens } | undefined;
  if (opts.includeInvestor && !isUtrc && wf.investorAmount && wf.investorAmount > 0) {
    const tenor = daysBetween(wf.valueDate, wf.maturityDate);
    const interpSofrPct = interpolateSofr(tenor) ?? 0;
    investor = {
      spec: getDocTemplate("SCHEDULE_A_INVESTOR", wf.sellerId)?.body ?? "",
      tokens: { ...tokens, ...investorTokens({ investorName: wf.investorName ?? "", investorAmount: wf.investorAmount, skimBps: wf.skimBps ?? 0, marginBps: wf.pricingBps, interpSofrPct, tenorDays: tenor }) },
    };
  }

  const docs = buildDocSet({ isUtrc, tokens, requestBody, scheduleSpec, investor });
  const req = docs.find((d) => d.kind === "REQUEST")!;
  const schedules = docs.filter((d) => d.kind === "SCHEDULE_A");
  const base = slug(wf.reference);
  const out = [
    { filename: `${slug(req.title)}-${base}.doc`, mime: "application/msword", base64: Buffer.from(wordDocument(req.html), "utf-8").toString("base64") },
  ];
  schedules.forEach((sch, i) => {
    out.push({ filename: `${slug(sch.title)}-${base}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: xlsxBase64(sch.title, sch.table!.columns, sch.table!.row) });
    void i;
  });
  return out;
}

// The investor Schedule A (Excel) as a single attachment — for the investor email.
export function investorAttachment(wf: TransactionWorkflow): EmlAttachment | undefined {
  if (wf.productType === "UTRC" || !wf.investorAmount || wf.investorAmount <= 0) return undefined;
  const table = scheduleAFromSpec(getDocTemplate("SCHEDULE_A_INVESTOR", wf.sellerId)?.body ?? "", workflowTokens(wf));
  return { filename: `Schedule-A-Investor-${slug(wf.reference)}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: xlsxBase64("Schedule A Investor", table.columns, table.row) };
}

// The full investor OFFER package: the investor Purchase Request (client pricing
// replaced with the investor's own terms — SOFR + investor margin, never the
// skim) plus the investor Schedule A. Both fill from the same tokens the on-page
// preview uses, so the offer, the export, and the email always agree. Returns []
// for a UTRC or a deal with no investor participation.
export function investorOfferAttachments(wf: TransactionWorkflow): EmlAttachment[] {
  if (wf.productType === "UTRC" || !wf.investorAmount || wf.investorAmount <= 0) return [];
  const tokens = workflowTokens(wf); // investor_* tokens are merged in when investorAmount > 0
  const base = slug(wf.reference);
  const prBody = fillTemplate(getDocTemplate("PURCHASE_REQUEST_INVESTOR", wf.sellerId)?.body ?? "", tokens);
  const prHtml = requestDocHtml("Purchase Request — Investor", prBody);
  const out: EmlAttachment[] = [
    { filename: `Purchase-Request-Investor-${base}.doc`, mime: "application/msword", base64: Buffer.from(wordDocument(prHtml), "utf-8").toString("base64") },
  ];
  const sch = investorAttachment(wf);
  if (sch) out.push(sch);
  return out;
}

// Fill an email template (subject + body) for a workflow.
export function workflowEmail(type: DocTemplateType, wf: TransactionWorkflow): { subject: string; body: string } {
  const tokens = workflowTokens(wf);
  const t = getDocTemplate(type, wf.sellerId);
  return {
    subject: fillTemplate(t?.subject ?? "", tokens),
    body: fillTemplate(t?.body ?? "", tokens),
  };
}
