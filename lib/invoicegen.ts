import { getBookedTransaction, getSeller, getObligor, getDocTemplate } from "@/lib/data/store";
import { additionalInterest } from "@/lib/receivables";
import { fillTemplate } from "@/lib/docgen";
import { usd, dateShort } from "@/lib/format";
import type { InvoiceSpec, InvoiceLineItem } from "@/lib/pdf";

// ---------------------------------------------------------------------------
// Invoice specs — turns a past-due receivable (or ad-hoc client request) into
// the InvoiceSpec the PDF renderer draws. Wording comes from editable templates
// (INVOICE_ADDITIONAL_INTEREST / INVOICE_NOTE), so the desk controls the text;
// the numbers come from the single ledger and the additional-interest engine.
// ---------------------------------------------------------------------------

// A due date N days after a base ISO date (default 14 days net terms).
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

// Additional-interest statement for a single past-due booked receivable. Returns
// null when the receivable is not past due (nothing to bill).
export function additionalInterestInvoiceSpec(
  txnId: string,
  asOf: string,
  invoiceNumber: string,
): InvoiceSpec | null {
  const t = getBookedTransaction(txnId);
  if (!t) return null;
  const ai = additionalInterest(t, asOf);
  if (ai.amount <= 0) return null; // not past due (or settled / defaulted)

  const seller = getSeller(t.sellerId);
  const obligor = getObligor(t.obligorId);
  const dueDate = addDays(asOf, 14);
  const tokens = {
    seller: seller?.name ?? t.sellerId,
    obligor: obligor?.name ?? t.obligorId,
    reference: t.reference,
    overdue_days: String(ai.days),
    all_in_rate: `${ai.allInRatePct.toFixed(2)}%`,
    principal: usd(ai.principal),
    additional_interest: usd(ai.amount),
    maturity_date: dateShort(t.maturityDate),
    invoice_no: invoiceNumber,
    today: dateShort(asOf),
    total: usd(ai.amount),
    due_date: dateShort(dueDate),
  };
  const descTmpl = getDocTemplate("INVOICE_ADDITIONAL_INTEREST", t.sellerId);
  const noteTmpl = getDocTemplate("INVOICE_NOTE", t.sellerId);
  return {
    title: "Statement of Additional Interest",
    invoiceNumber,
    date: asOf,
    dueDate,
    billToName: seller?.name ?? t.sellerId,
    billToLines: [`Obligor: ${obligor?.name ?? t.obligorId}`, `Receivable: ${t.reference}`],
    meta: [
      { label: "Original maturity", value: dateShort(t.maturityDate) },
      { label: "Days past due", value: String(ai.days) },
      { label: "Rate (margin + base)", value: `${ai.allInRatePct.toFixed(2)}%` },
    ],
    lineItems: [{ description: fillTemplate(descTmpl?.body ?? "", tokens), amount: ai.amount }],
    notes: fillTemplate(noteTmpl?.body ?? "", tokens),
    totalLabel: "Additional interest due",
  };
}

export interface AdHocInvoiceInput {
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  billToName: string;
  billToLines?: string[];
  lineItems: InvoiceLineItem[];
  notes?: string;
  sellerId?: string; // pulls a seller-specific note template when set
}

// Ad-hoc client invoice from a filled input table (the same template-driven
// mechanism as the deal documents). Falls back to the default note template.
export function adHocInvoiceSpec(input: AdHocInvoiceInput): InvoiceSpec {
  const total = input.lineItems.reduce((a, l) => a + l.amount, 0);
  const dueDate = input.dueDate || addDays(input.date, 14);
  const noteTmpl = getDocTemplate("INVOICE_NOTE", input.sellerId);
  const notes = input.notes && input.notes.trim()
    ? input.notes
    : fillTemplate(noteTmpl?.body ?? "", {
        invoice_no: input.invoiceNumber,
        total: usd(total),
        due_date: dateShort(dueDate),
        seller: input.billToName,
      });
  return {
    title: "Invoice",
    invoiceNumber: input.invoiceNumber,
    date: input.date,
    dueDate,
    billToName: input.billToName,
    billToLines: input.billToLines?.filter(Boolean),
    lineItems: input.lineItems,
    notes,
  };
}
