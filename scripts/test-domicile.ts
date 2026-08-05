// Regressions for assignable per-seller / per-obligor domicile + engine enforceability
// + insurance country limit keyed to the booking entity's domicile.
import { store, resetExposure, addCountry, removeCountry, getObligor, getObligorEntity, runMigrations, domicileExceptions, reservedInsurance, materializeBatchBookings, listBookedTransactions, removeBatchBookings } from "@/lib/data/store";
import { checkDiscount } from "@/lib/engine/eligibility";
import { runBatch } from "@/lib/engine";
import { effectiveObligorDomicile, sellerDomicileFinding } from "@/lib/engine/domicile";
import type { DiscountTransaction, Invoice, BatchResult, InvoiceResult } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n + "  " + x)); };
resetExposure();
console.log("Domicile enforceability + booking-entity country regressions\n");

const sev = (r: ReturnType<typeof checkDiscount>, name: string) => r.checks.find((c) => c.name === name)?.severity;
const base: DiscountTransaction = { sellerId: "SELLER001", obligorId: "OBL001", invoiceNumber: "D", invoiceAmount: 5_000_000, currency: "USD", invoiceType: "FINAL", advanceRate: 1, valueDate: "2026-08-01", maturityDate: "2026-09-15", pricingBps: 200, productType: "DTR", distributed: false, insured: false };

// A jurisdiction with no enforceability opinion (not on the eligible register).
addCountry("ZZ", "Testland", false);
const seller = store.sellers.find((s) => s.id === "SELLER001")!;
const origDom = seller.domicile;

// --- Seller domicile: enforceable vs not ---------------------------------------
seller.domicile = "US"; // on the eligible register
ok("seller domicile on eligible register -> GREEN", sev(checkDiscount(base), "Seller domicile") === "GREEN", String(sev(checkDiscount(base), "Seller domicile")));
seller.domicile = "ZZ"; // no enforceability opinion
ok("seller domicile without enforceability opinion -> ORANGE", sev(checkDiscount(base), "Seller domicile") === "ORANGE", String(sev(checkDiscount(base), "Seller domicile")));

// Batch parity: the same non-enforceable seller domicile is an EXCEPTION in batch.
const inv: Invoice = { invoiceNumber: "DB", sellerId: "SELLER001", obligorId: "OBL001", amount: 1_000_000, coverageAmount: 1_000_000, currency: "USD", issueDate: "2026-03-01", requestedDiscountDate: "2026-03-15", dueDate: "2026-05-01", advanceRate: 1, productType: "DTR" };
const rb = runBatch([inv], { batchId: "BD", fileName: "d.csv", uploadedAt: "2026-03-15T00:00:00Z", makerUserId: "t" });
const sd = rb.results[0].checks.find((c) => c.checkName === "SELLER_DOMICILE");
ok("batch flags the same seller domicile as EXCEPTION (parity)", sd?.severity === "ORANGE" && sd?.status === "EXCEPTION", `${sd?.severity}/${sd?.status}`);
seller.domicile = origDom;

// helper unit: sellerDomicileFinding severity tracks the register
seller.domicile = "ZZ";
ok("sellerDomicileFinding ORANGE for non-enforceable", sellerDomicileFinding(seller).severity === "ORANGE");
seller.domicile = origDom;

// --- Obligor GROUP domicile (no entity named) ----------------------------------
const obligor = getObligor("OBL001")!;
const origCountry = obligor.country;
obligor.country = "ZZ";
ok("obligor group domicile without opinion -> ORANGE (no entity named)", sev(checkDiscount(base), "Obligor domicile") === "ORANGE", String(sev(checkDiscount(base), "Obligor domicile")));
obligor.country = origCountry;
// When a specific entity IS named, the group-level check is suppressed (the entity
// domicile is checked instead) — no duplicate "Obligor domicile" row.
ok("group domicile check suppressed when an entity is named", sev(checkDiscount({ ...base, obligorEntityId: "OE-001A" }), "Obligor domicile") === undefined);

// --- Insurance country limit keys off the BOOKING entity's domicile ------------
const oe = getObligorEntity("OE-001A")!;
const origOeDom = oe.domicile;
oe.domicile = "NL"; // entity sits in a different jurisdiction than the group (US)
ok("effectiveObligorDomicile uses the named entity's domicile", effectiveObligorDomicile(obligor.id, "OE-001A") === "NL", effectiveObligorDomicile(obligor.id, "OE-001A"));
ok("effectiveObligorDomicile falls back to group country when no entity", effectiveObligorDomicile(obligor.id) === origCountry, effectiveObligorDomicile(obligor.id));
oe.domicile = origOeDom;

// --- A. Monitoring parity: domicileExceptions covers the seller FACILITY and the
// obligor GROUP (not just legal entities), matching what the engine flags. --------
{
  const s = store.sellers.find((x) => x.id === "SELLER001")!;
  const o = getObligor("OBL001")!;
  const sDom = s.domicile, oCountry = o.country;
  s.domicile = "ZZ"; o.country = "ZZ";
  const ex = domicileExceptions();
  ok("domicileExceptions surfaces a non-enforceable SELLER facility", ex.some((e) => e.kind === "Seller" && e.name === s.name));
  ok("domicileExceptions surfaces a non-enforceable OBLIGOR group", ex.some((e) => e.kind === "Obligor" && e.name === o.name));
  s.domicile = sDom; o.country = oCountry;
  ok("no domicile exceptions once jurisdictions are enforceable again", !domicileExceptions().some((e) => (e.kind === "Seller" || e.kind === "Obligor") && (e.name === s.name || e.name === o.name)));
}

// --- C. reservedInsurance keys off the BOOKING entity's domicile, not the group
// country — so it offsets the same country limit the engine checks. ---------------
{
  const oe = getObligorEntity("OE-001A")!;
  const origOeDom = oe.domicile;
  oe.domicile = "NL"; // entity in a different jurisdiction than the OBL001 group (US)
  const seller = store.sellers.find((x) => x.id === "SELLER001")!;
  const iv: InvoiceResult = {
    invoice: { invoiceNumber: "DOM-C", sellerId: seller.id, obligorId: "OBL001", obligorEntityId: "OE-001A", amount: 3_000_000, currency: seller.currency, issueDate: "2026-03-01", dueDate: "2026-06-30", requestedDiscountDate: "2026-04-01", coverageAmount: 3_000_000, advanceRate: 1, marginBps: 150, productType: "DTR" },
    tenorDays: 90, discountRate: 0.06, discountFee: 0, netProceeds: 3_000_000, checks: [], status: "ELIGIBLE", breachAmount: 0,
    funding: { legs: [{ source: "BANK_HOLD", amount: 3_000_000 }], bankHeld: 3_000_000, insuredAmount: 0, uninsuredResidual: 3_000_000 }, settlementStatus: "PENDING",
  };
  const batch: BatchResult = { batchId: "BDOMC", sellerId: seller.id, uploadedAt: "2026-04-01T00:00:00Z", fileName: "c.csv", makerUserId: "test", summary: {} as never, results: [iv], postBatchLimits: [] };
  materializeBatchBookings(batch, "test");
  const t = listBookedTransactions().find((x) => x.batchId === "BDOMC")!;
  t.obligorEntityId = "OE-001A";
  t.insurerAllocations = [{ policyId: "POL-1", insurerName: "Test", amount: 2_000_000 } as never];
  const win = { from: "2026-04-01", to: "2026-06-30" };
  ok("reservedInsurance matches the booking under its ENTITY domicile (NL)", Math.round(reservedInsurance("POL-1", { country: "NL" }, win)) === 2_000_000, String(reservedInsurance("POL-1", { country: "NL" }, win)));
  ok("reservedInsurance does NOT count it under the GROUP country (US)", reservedInsurance("POL-1", { country: "US" }, win) === 0, String(reservedInsurance("POL-1", { country: "US" }, win)));
  removeBatchBookings("BDOMC");
  oe.domicile = origOeDom;
}

removeCountry("ZZ");

// --- Backfill migration: a seller persisted before facility-domicile existed ----
// (the real-world bug: engine flagged "no domicile" while the UI showed a default).
const s001 = store.sellers.find((x) => x.id === "SELLER001")!;
const savedDom = s001.domicile;
s001.domicile = undefined; // simulate legacy persisted seller with no facility domicile
ok("legacy seller (no domicile) is flagged 'no domicile on file'", sellerDomicileFinding(s001).message.includes("No domicile on file"));
store.migrations = (store.migrations ?? []).filter((m) => m !== "seller-domicile-backfill-2026-08");
runMigrations();
ok("backfill migration restores a real seller domicile (US entity -> GREEN)", !!s001.domicile && sellerDomicileFinding(s001).severity === "GREEN", String(s001.domicile));
ok("every seller has a domicile after migrations", store.sellers.every((x) => !!x.domicile && x.domicile.trim().length > 0));
s001.domicile = savedDom;

resetExposure();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
if (fail) process.exit(1);
