import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { usd } from "@/lib/format";

// ---------------------------------------------------------------------------
// Invoice PDF renderer. One small, self-contained layout used by every invoice
// the desk produces (additional-interest statements and ad-hoc client
// invoices). It draws a MUFG letterhead, a bill-to block, an invoice-meta box,
// a line-item table, a total, and payment notes — returning a real .pdf byte
// stream that can be downloaded or attached to an email.
//
// The numbers come from tokens filled elsewhere; this file only knows how to
// lay them out, so a reviewer changing wording never touches layout and vice
// versa (single responsibility).
// ---------------------------------------------------------------------------

export interface InvoiceLineItem {
  description: string;
  amount: number;
}

export interface InvoiceSpec {
  title: string; // e.g. "INVOICE" or "STATEMENT OF ADDITIONAL INTEREST"
  invoiceNumber: string;
  date: string; // ISO
  dueDate?: string; // ISO
  billToName: string;
  billToLines?: string[]; // address / reference lines under the name
  meta?: { label: string; value: string }[]; // extra rows in the meta box
  lineItems: InvoiceLineItem[];
  currency?: string; // display only; amounts are formatted as USD
  notes?: string; // free-text payment instructions / footer note
  totalLabel?: string; // defaults to "Total due"
}

const PAGE = { w: 612, h: 792 }; // US Letter
const MARGIN = 50;
const INK = rgb(0.11, 0.12, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.82, 0.84, 0.87);
const MUFG_RED = rgb(0.7, 0.09, 0.11);

function money(n: number): string {
  return usd(Math.round(n));
}

// Draw right-aligned text ending at x = right.
function drawRight(page: PDFPage, text: string, right: number, y: number, font: PDFFont, size: number, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: right - w, y, size, font, color });
}

// Wrap text to a max width, returning the lines.
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function renderInvoicePdf(spec: InvoiceSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE.w, PAGE.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = MARGIN;
  const right = PAGE.w - MARGIN;
  let y = PAGE.h - MARGIN;

  // --- Letterhead ----------------------------------------------------------
  page.drawText("MUFG", { x: left, y: y - 4, size: 22, font: bold, color: MUFG_RED });
  page.drawText("Supply Chain Finance", { x: left + 74, y: y + 2, size: 12, font: bold, color: INK });
  page.drawText("Global Corporate & Investment Banking", { x: left + 74, y: y - 11, size: 9, font, color: MUTED });
  drawRight(page, spec.title.toUpperCase(), right, y - 2, bold, 15, INK);
  y -= 30;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: MUFG_RED });
  y -= 26;

  // --- Bill-to (left) + meta box (right) -----------------------------------
  const metaTop = y;
  page.drawText("Bill to", { x: left, y, size: 8, font: bold, color: MUTED });
  let by = y - 14;
  page.drawText(spec.billToName, { x: left, y: by, size: 11, font: bold, color: INK });
  by -= 14;
  for (const l of spec.billToLines ?? []) {
    page.drawText(l, { x: left, y: by, size: 9, font, color: MUTED });
    by -= 12;
  }

  // Meta rows on the right.
  const metaRows: { label: string; value: string }[] = [
    { label: "Invoice no.", value: spec.invoiceNumber },
    { label: "Date", value: spec.date },
    ...(spec.dueDate ? [{ label: "Due date", value: spec.dueDate }] : []),
    ...(spec.meta ?? []),
  ];
  let my = metaTop;
  for (const row of metaRows) {
    page.drawText(row.label, { x: right - 200, y: my, size: 9, font, color: MUTED });
    drawRight(page, row.value, right, my, bold, 9, INK);
    my -= 14;
  }

  y = Math.min(by, my) - 24;

  // --- Line-item table -----------------------------------------------------
  const amtCol = right; // amounts right-aligned to the margin
  page.drawText("Description", { x: left, y, size: 8, font: bold, color: MUTED });
  drawRight(page, "Amount", amtCol, y, bold, 8, MUTED);
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 16;

  let subtotal = 0;
  for (const item of spec.lineItems) {
    subtotal += item.amount;
    const descLines = wrap(item.description, font, 10, right - left - 130);
    descLines.forEach((l, i) => page.drawText(l, { x: left, y: y - i * 12, size: 10, font, color: INK }));
    drawRight(page, money(item.amount), amtCol, y, font, 10, INK);
    y -= Math.max(descLines.length * 12, 12) + 8;
  }

  // --- Total ---------------------------------------------------------------
  y -= 4;
  page.drawLine({ start: { x: right - 230, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 18;
  page.drawText(spec.totalLabel ?? "Total due", { x: right - 230, y, size: 11, font: bold, color: INK });
  drawRight(page, money(subtotal), amtCol, y, bold, 12, MUFG_RED);
  y -= 30;

  // --- Notes ---------------------------------------------------------------
  if (spec.notes) {
    page.drawText("Notes", { x: left, y, size: 8, font: bold, color: MUTED });
    y -= 14;
    for (const l of wrap(spec.notes, font, 9, right - left)) {
      page.drawText(l, { x: left, y, size: 9, font, color: INK });
      y -= 12;
    }
  }

  // --- Footer --------------------------------------------------------------
  page.drawLine({ start: { x: left, y: MARGIN + 16 }, end: { x: right, y: MARGIN + 16 }, thickness: 0.5, color: LINE });
  page.drawText("This statement is issued under the governing Receivables Purchase / facility agreement.", {
    x: left, y: MARGIN, size: 7.5, font, color: MUTED,
  });

  return doc.save();
}
