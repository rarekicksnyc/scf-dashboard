import { store } from "@/lib/data/store";
import { checkDiscount } from "@/lib/engine/eligibility";
import type { DiscountTransaction } from "@/lib/types";

let pass=0,fail=0; const ok=(n:string,c:boolean,x="")=>{c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL "+n+" "+x));};
const seller = store.sellers[0];
const obligorId = store.sellerObligorLimits.find(x=>x.sellerId===seller.id)?.obligorId ?? store.obligors[0].id;
seller.comminglingDays = 5;

const base: DiscountTransaction = { sellerId: seller.id, obligorId, invoiceNumber:"T", invoiceAmount:1_000_000, currency:seller.currency, invoiceType:"FINAL", advanceRate:1, valueDate:"2026-08-01", maturityDate:"2026-10-01", pricingBps:120, productType:"DTR", distributed:false, insured:false };
const cm = (r: ReturnType<typeof checkDiscount>) => r.checks.find(c=>c.name==="Commingling / buffer days");

ok("within approved -> GREEN", cm(checkDiscount({ ...base, bufferDays: 5 }))?.severity === "GREEN");
ok("over approved -> ORANGE (exception)", cm(checkDiscount({ ...base, bufferDays: 8 }))?.severity === "ORANGE");
ok("no bufferDays -> check absent (opt-in)", cm(checkDiscount({ ...base })) === undefined);
seller.comminglingDays = undefined;
ok("no approved days -> check absent even with bufferDays", cm(checkDiscount({ ...base, bufferDays: 8 })) === undefined);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
