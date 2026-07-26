import { store } from "@/lib/data/store";
import { renderInvoicePdf } from "@/lib/pdf";
import { additionalInterestInvoiceSpec, adHocInvoiceSpec } from "@/lib/invoicegen";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; };
const isPdf = (b: Uint8Array) => b.length > 800 && b[0] === 0x25 && b[1] === 0x50; // %P

async function main() {
  // Ad-hoc invoice → PDF.
  const adhoc = adHocInvoiceSpec({
    invoiceNumber: "INV-20260726-0001",
    date: "2026-07-26",
    billToName: "Acme Manufacturing LLC",
    billToLines: ["Attn: Accounts Payable"],
    lineItems: [
      { description: "Early settlement handling fee", amount: 2500 },
      { description: "Document reissue", amount: 750 },
    ],
  });
  ok("ad-hoc total = 3250", adhoc.lineItems.reduce((a, l) => a + l.amount, 0) === 3250);
  const pdf1 = await renderInvoicePdf(adhoc);
  ok("ad-hoc renders a PDF", isPdf(pdf1));

  // Additional-interest invoice from a past-due receivable.
  const seller = store.sellers[0];
  const obligor = store.obligors[0];
  store.bookedTransactions.unshift({
    id: "BKD-TEST", source: "BOOKED", sellerId: seller.id, obligorId: obligor.id,
    productType: "DTR", reference: "INV-TEST-1", currency: "USD", amount: 10_000_000,
    valueDate: "2026-04-01", maturityDate: "2026-06-30", pricingBps: 125, baseRatePct: 4.5,
    bookedAt: "2026-04-01T00:00:00Z", bookedBy: "test",
  });
  const spec = additionalInterestInvoiceSpec("BKD-TEST", "2026-07-26", "INV-20260726-0002");
  ok("additional-interest spec built", spec !== null);
  ok("bills the seller", spec?.billToName === seller.name);
  ok("one line item with the interest", spec?.lineItems.length === 1 && (spec.lineItems[0].amount ?? 0) > 40000);
  const pdf2 = await renderInvoicePdf(spec!);
  ok("additional-interest renders a PDF", isPdf(pdf2));

  // Not-past-due returns null (nothing to bill).
  const notDue = additionalInterestInvoiceSpec("BKD-TEST", "2026-05-01", "INV-X");
  ok("current receivable → no additional-interest invoice", notDue === null);

  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  if (fail) process.exit(1);
}
main();
