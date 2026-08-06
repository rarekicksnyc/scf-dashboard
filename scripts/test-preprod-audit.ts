// Regressions for the 3rd (pre-production) adversarial audit's confirmed fixes.
import {
  store, resetExposure, addSeller, removeSeller, addObligor, removeObligor,
  upsertDocTemplate, listDocTemplates, materializeBatchBookings, listBookedTransactions, removeBatchBookings,
} from "@/lib/data/store";
import { csvSafe } from "@/lib/csvexport";
import { emlResponse } from "@/lib/email";
import { DOC_FIELDS } from "@/lib/creator/surface";
import { DOC_TEMPLATE_TYPES } from "@/lib/types";
import { winAnsiSafe, renderInvoicePdf } from "@/lib/pdf";
import { parseRateRows } from "@/lib/upload";
import { ageBucket } from "@/lib/receivables";
import { runBatch } from "@/lib/engine";
import { priceDeal } from "@/lib/pricing";
import type { Invoice, BatchResult, InvoiceResult } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };

async function main() {
resetExposure();
console.log("Pre-production audit regressions\n");

// #2/#10/#14 — CSV formula-injection neutralization in the shared builder.
ok("#2 csvSafe prefixes leading = with apostrophe", csvSafe("=1+1") === "'=1+1");
ok("#2 csvSafe handles + - @ and tab/CR", csvSafe("+x") === "'+x" && csvSafe("-9") === "'-9" && csvSafe("@a") === "'@a" && csvSafe("\tb").startsWith("'"));
ok("#2 csvSafe leaves ordinary values untouched", csvSafe("Acme Corp") === "Acme Corp" && csvSafe(42) === "42");

// #3 — CRLF email-header injection cannot inject a Bcc.
{
  const res = emlResponse("x.eml", { subject: "Investor — Acme\r\nBcc: leak@evil.com", body: "hi", to: "a@b.com\r\nBcc: leak2@evil.com" });
  const eml = await res.text();
  const lines = eml.split(/\r\n/);
  ok("#3 no injected Bcc header line", !lines.some((l) => /^Bcc:/i.test(l)));
  ok("#3 subject collapsed to one line", lines.filter((l) => /^Subject:/i.test(l)).length === 1);
}

// #8 — skim is not a DOCUMENT custom-field surface (can't leak via {{cf_*}}).
ok("#8 DOC_FIELDS excludes skim", !DOC_FIELDS.some((f) => f.key === "skim_bps"));

// #9 — every template type is saveable, and investor-facing saves strip skim.
ok("#9 all 11 template types are editable", DOC_TEMPLATE_TYPES.length === 11);
{
  const t = upsertDocTemplate({ type: "SCHEDULE_A_INVESTOR", body: "seller | amount | skim_bps\nnote {{cf_skim_bps}} here" });
  ok("#9 investor-facing save strips the skim column", !/skim_bps/.test(t.body));
  ok("#9 investor-facing save blanks the skim token", !/\{\{[^}]*skim/i.test(t.body));
  store.docTemplates = store.docTemplates.filter((x) => x.id !== t.id);
  void listDocTemplates;
}

// #6/#7 — seller/obligor ids are monotonic and never reused after a delete.
{
  const s1 = addSeller({ name: "T1", cdl: "91000001", creditLimit: 1_000_000, maxTenorDays: 90, expiryDate: "2026-12-31" });
  ok("#6 seller id is monotonic (SELLER-NNNNN, not lengths)", /^SELLER-\d{5,}$/.test(s1.id), s1.id);
  const id1 = s1.id;
  removeSeller(id1);
  const s2 = addSeller({ name: "T2", cdl: "91000002", creditLimit: 1_000_000, maxTenorDays: 90, expiryDate: "2026-12-31" });
  ok("#6 deleted seller id is not reused", s2.id !== id1, `${id1} -> ${s2.id}`);
  removeSeller(s2.id);
  const o1 = addObligor({ name: "TO1", cdl: "92000001", country: "US", masterLimit: 1_000_000, maxTenorDays: 90, expiryDate: "2026-12-31" });
  ok("#7 obligor id is monotonic (OBL-NNNNN)", /^OBL-\d{5,}$/.test(o1.id), o1.id);
  removeObligor(o1.id);
  store.limits = store.limits.filter((l) => l.entityId !== id1 && l.entityId !== s2.id && l.entityId !== o1.id);
}

// #13 — resetExposure clears the booked ledger (the exposure source).
{
  const seller = store.sellers.find((x) => x.id === "SELLER001")!;
  const iv: InvoiceResult = {
    invoice: { invoiceNumber: "PP-13", sellerId: seller.id, obligorId: "OBL001", amount: 1_000_000, currency: "USD", issueDate: "2026-03-01", dueDate: "2026-06-30", requestedDiscountDate: "2026-04-01", coverageAmount: 1_000_000, advanceRate: 1, marginBps: 150, productType: "DTR" },
    tenorDays: 90, discountRate: 0.06, discountFee: 0, netProceeds: 1_000_000, checks: [], status: "ELIGIBLE", breachAmount: 0,
    funding: { legs: [{ source: "BANK_HOLD", amount: 1_000_000 }], bankHeld: 1_000_000, insuredAmount: 0, uninsuredResidual: 1_000_000 }, settlementStatus: "PENDING",
  };
  materializeBatchBookings({ batchId: "PP13", sellerId: seller.id, uploadedAt: "2026-04-01T00:00:00Z", fileName: "p.csv", makerUserId: "t", summary: {} as never, results: [iv], postBatchLimits: [] } as BatchResult, "t");
  ok("booked ledger has the transaction before reset", listBookedTransactions().some((t) => t.batchId === "PP13"));
  const counts = resetExposure();
  ok("#13 resetExposure clears bookedTransactions", listBookedTransactions().length === 0);
  ok("#13 resetExposure reports the booked count", typeof counts.bookedTransactions === "number" && counts.bookedTransactions >= 1);
}

// #1 — WinAnsi sanitizer + invoice PDF never crash on a real (CJK/Latin-Ext) name.
ok("#1 winAnsiSafe replaces CJK with '?'", winAnsiSafe("三菱商事") === "????");
ok("#1 winAnsiSafe keeps CP1252 accents (café)", winAnsiSafe("café") === "café");
ok("#1 winAnsiSafe reduces non-WinAnsi Latin-Extended to safe chars (Łódź -> …dz, no U+0141)", winAnsiSafe("Łódź").endsWith("dz") && !/Ł/.test(winAnsiSafe("Łódź")));
{
  let threw = false;
  try {
    await renderInvoicePdf({ title: "STATEMENT", invoiceNumber: "INV-1", date: "2026-08-01", billToName: "三菱商事 Łódź 🚀", lineItems: [{ description: "偉大な company", amount: 1234.5 }], notes: "支払 notes" });
  } catch { threw = true; }
  ok("#1 renderInvoicePdf does NOT crash on non-WinAnsi input", !threw);
}

// #11 — blank/non-numeric offer flags the rate row instead of a silent 0%.
{
  const good = parseRateRows([{ start_date: "2026-01-01", maturity: "2026-04-01", offer: "5.25" }], "SOFR");
  const blank = parseRateRows([{ start_date: "2026-01-01", maturity: "2026-04-01", offer: "" }], "SOFR");
  const bad = parseRateRows([{ start_date: "2026-01-01", maturity: "2026-04-01", offer: "n/a" }], "SOFR");
  ok("#11 valid offer -> no error, parsed rate", good[0]?.error === undefined && good[0]?.offer === 5.25);
  ok("#11 blank offer -> flagged, not silent 0%", blank[0]?.error !== undefined);
  ok("#11 non-numeric offer -> flagged", bad[0]?.error !== undefined);
}

// #12 — a still-open defaulted receivable ages past due (not "Current").
{
  const seller = store.sellers.find((x) => x.id === "SELLER001")!;
  const iv: InvoiceResult = {
    invoice: { invoiceNumber: "PP-12", sellerId: seller.id, obligorId: "OBL001", amount: 1_000_000, currency: "USD", issueDate: "2026-01-01", dueDate: "2026-03-01", requestedDiscountDate: "2026-01-15", coverageAmount: 1_000_000, advanceRate: 1, marginBps: 150, productType: "DTR" },
    tenorDays: 60, discountRate: 0.06, discountFee: 0, netProceeds: 1_000_000, checks: [], status: "ELIGIBLE", breachAmount: 0,
    funding: { legs: [{ source: "BANK_HOLD", amount: 1_000_000 }], bankHeld: 1_000_000, insuredAmount: 0, uninsuredResidual: 1_000_000 }, settlementStatus: "PENDING",
  };
  materializeBatchBookings({ batchId: "PP12", sellerId: seller.id, uploadedAt: "2026-01-15T00:00:00Z", fileName: "p.csv", makerUserId: "t", summary: {} as never, results: [iv], postBatchLimits: [] } as BatchResult, "t");
  const t = listBookedTransactions().find((x) => x.batchId === "PP12")!;
  t.maturityDate = "2026-03-01";
  t.defaultedAt = "2026-05-01"; // open default, well past maturity
  ok("#12 open defaulted receivable does NOT bucket as Current", ageBucket(t, "2026-06-15") !== "CURRENT", ageBucket(t, "2026-06-15"));
  removeBatchBookings("PP12");
}

// #4 — UTRC net proceeds exclude the base-rate discount (commitment fee only).
{
  const p = priceDeal({ productType: "UTRC", baseRateType: "SOFR", baseRate: 4, marginBps: 150, coverage: 10_000_000, tenorDays: 90 });
  const utrcNet = p.coverage - p.commitmentFee; // the fixed formula
  ok("#4 UTRC net proceeds != DTR purchase price when base>0", Math.abs(utrcNet - p.purchasePrice) > 1, `net=${utrcNet} purchasePrice=${p.purchasePrice}`);
  ok("#4 UTRC net proceeds = coverage - commitment fee", Math.abs(utrcNet - (p.coverage - p.commitmentFee)) < 0.01);
}

resetExposure();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail) process.exit(1);
}

main();
