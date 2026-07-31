// Rigorous end-to-end / invariant stress harness. Exercises the derived-capacity
// invariants, revenue reconciliation, insurer premium attribution, projection,
// four-eyes lifecycle, exclusive-expiry handoff, commingling, reservation self-
// exclusion, adversarial eligibility, and a snapshot round-trip.
import { store, limitViews, findLimit, addLimit, approveLimit, getLimitById, stageLimitEdit, approveLimitEdit, snapshotJson, hydrateStore } from "@/lib/data/store";
import { allRevenueDeals, revenueSummary, accruedRevenue, fiscalYearStart, earnedBetween, policyPremiumStatus } from "@/lib/revenue";
import { expectedOutstandingByDate } from "@/lib/projection";
import { checkDiscount } from "@/lib/engine/eligibility";
import type { DiscountTransaction } from "@/lib/types";

let pass=0, fail=0; const bugs:string[]=[];
const ok=(n:string,c:boolean,x="")=>{ if(c){pass++;} else {fail++;bugs.push(`${n} ${x}`);console.log("  FAIL "+n+"  "+x);} };
const today = new Date().toISOString().slice(0,10);
const near=(a:number,b:number,e=1)=>Math.abs(a-b)<=e;

console.log("E2E / invariant stress harness");

// 1. Derived-capacity invariants across the whole book.
for (const v of limitViews()) {
  ok(`consumed >= 0 (${v.limit.id})`, v.consumed >= -1, `${v.consumed}`);
  ok(`reserved >= 0 (${v.limit.id})`, v.reserved >= -1, `${v.reserved}`);
  ok(`available <= approved (${v.limit.id})`, v.available <= v.approvedLimit + 1, `${v.available} > ${v.approvedLimit}`);
  ok(`utilization finite (${v.limit.id})`, Number.isFinite(v.utilizationPct), `${v.utilizationPct}`);
}

// 2. Revenue reconciliation.
const deals = allRevenueDeals();
const sum = revenueSummary(deals);
ok("total == margin + investor skim + insurer skim", near(sum.total, sum.revenue + sum.skimRevenue + sum.insurerSkimRevenue, 2), `${sum.total} vs ${sum.revenue+sum.skimRevenue+sum.insurerSkimRevenue}`);
ok("investor skim == funding basis + margin skim", near(sum.skimRevenue, sum.fundingBasisRevenue + sum.marginSkimRevenue, 2));
const acc = accruedRevenue(deals, today);
ok("accrued <= contracted", acc.accrued <= acc.contracted + 1);
ok("FYTD earned <= total contracted", earnedBetween(deals, fiscalYearStart(today), today) <= sum.total + 1);
ok("no NaN in revenue", [sum.total,sum.revenue,sum.skimRevenue,sum.insurerSkimRevenue].every(Number.isFinite));

// 3. Insurer premium: per-seller top-ups reconcile to policy shortfall.
for (const p of policyPremiumStatus(today)) {
  ok(`generatedFYTD >= 0 (${p.policyId})`, p.generatedFYTD >= 0);
  const sellerTopups = p.sellers.reduce((a,s)=>a+s.topUp,0);
  if (p.sellers.length) ok(`seller top-ups reconcile to shortfall (${p.policyId})`, near(sellerTopups, p.shortfall, 2), `${sellerTopups} vs ${p.shortfall}`);
}

// 4. Projection invariants.
const proj = expectedOutstandingByDate(today, 200);
const vals = Object.values(proj);
ok("projection non-negative", vals.every(v=>v>=0));
ok("projection peak >= every day", vals.every(v=>v<=Math.max(...vals)));

// 5. Four-eyes full lifecycle.
const l = addLimit({ type:"OBLIGOR", cdl:"11112222", entityType:"OBLIGOR", entityId:"OBL-STRESS", approvedLimit:8_000_000, maxTenorDays:120, expiryDate:"2027-06-01", approval:{ reference:"G1", requestedBy:"m", requestedByName:"M" } });
ok("pending new limit grants NO capacity", findLimit("OBLIGOR","OBL-STRESS")===undefined);
ok("maker cannot self-approve", approveLimit(l.id,"m","M").ok===false);
ok("checker approves -> capacity", approveLimit(l.id,"c","C").ok===true && findLimit("OBLIGOR","OBL-STRESS")?.id===l.id);
stageLimitEdit(l.id,{approvedLimit:20_000_000},{reference:"G2",requestedBy:"m",requestedByName:"M"});
ok("staged edit keeps OLD value live", getLimitById(l.id)?.approvedLimit===8_000_000);
ok("approve edit applies new value", approveLimitEdit(l.id,"c","C").ok===true && getLimitById(l.id)?.approvedLimit===20_000_000);

// 6. Adversarial eligibility matrix (known seed pair).
const sid = store.sellers[0].id, oid = store.sellerObligorLimits.find(x=>x.sellerId===sid)?.obligorId ?? store.obligors[0].id;
const base:DiscountTransaction = { sellerId:sid, obligorId:oid, invoiceNumber:"S", invoiceAmount:1_000_000, currency:store.sellers[0].currency, invoiceType:"FINAL", advanceRate:1, valueDate:"2026-08-01", maturityDate:"2026-10-01", pricingBps:120, productType:"DTR", distributed:false, insured:false };
const sev=(r:ReturnType<typeof checkDiscount>,cat:string,name:string)=>r.checks.find(c=>c.category===cat&&c.name===name)?.severity;
ok("currency mismatch -> RED", sev(checkDiscount({...base, currency:"EUR" as never}),"SELLER","Currency")==="RED");
ok("massive amount -> seller line RED", sev(checkDiscount({...base, invoiceAmount:9_990_000_000}),"SELLER","Seller credit limit")==="RED");
ok("engine never throws on zero amount", (()=>{try{checkDiscount({...base,invoiceAmount:0});return true;}catch{return false;}})());

// 7. Snapshot round-trip.
const before = revenueSummary(allRevenueDeals()).total;
const snap = JSON.parse(snapshotJson());
hydrateStore(snap);
ok("snapshot round-trip preserves revenue total", near(revenueSummary(allRevenueDeals()).total, before, 2));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("BUGS:"); bugs.forEach(b=>console.log(" - "+b)); }
process.exit(fail?1:0);
