import { store, addSellerObligorLimit, sellerObligorLimit, sublimitApproved, listPendingSublimits, approveSublimit, rejectSublimit } from "@/lib/data/store";
import { checkDiscount } from "@/lib/engine/eligibility";
import type { DiscountTransaction } from "@/lib/types";

let pass=0,fail=0; const ok=(n:string,c:boolean,x="")=>{c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL "+n+" "+x));};
const sellerId = store.sellers[0].id;
const obligorId = store.obligors.find(o=>!store.sellerObligorLimits.some(x=>x.sellerId===sellerId&&x.obligorId===o.id))?.id ?? "OBL-NEW";

// Add a pending ASR sublimit for a new pair.
addSellerObligorLimit(sellerId, obligorId, 10_000_000, 120, { reference:"GCARS-SL", requestedBy:"u_maker", requestedByName:"Maker" });
const sol = sellerObligorLimit(sellerId, obligorId)!;
ok("sublimit created PENDING", sol.approval?.status === "PENDING");
ok("pending sublimit not approved", !sublimitApproved(sol));
ok("in pending queue", listPendingSublimits().some(s=>s.sellerId===sellerId&&s.obligorId===obligorId));

// Eligibility ASR check should be RED while pending.
const txn: DiscountTransaction = { sellerId, obligorId, invoiceNumber:"T", invoiceAmount:1_000_000, currency:store.sellers[0].currency, invoiceType:"FINAL", advanceRate:1, valueDate:"2026-08-01", maturityDate:"2026-10-01", pricingBps:120, productType:"DTR", distributed:false, insured:false };
const asr = (r:ReturnType<typeof checkDiscount>) => r.checks.find(c=>c.category==="ASR" && c.name==="ASR approved obligor");
ok("pending sublimit -> ASR check RED", asr(checkDiscount(txn))?.severity === "RED");

ok("maker cannot self-approve", approveSublimit(sellerId, obligorId, "u_maker", "Maker").ok === false);
ok("second user approves", approveSublimit(sellerId, obligorId, "u_checker", "Checker").ok === true);
ok("now approved -> ASR check not RED", asr(checkDiscount(txn))?.severity !== "RED");
ok("no longer pending", !listPendingSublimits().some(s=>s.sellerId===sellerId&&s.obligorId===obligorId));

// Reject removes a pending one.
addSellerObligorLimit(sellerId, "OBL-REJ2", 5_000_000, 90, { reference:"GCARS-SL2", requestedBy:"u_maker", requestedByName:"Maker" });
ok("reject by other removes it", rejectSublimit(sellerId, "OBL-REJ2", "u_checker").ok === true && !sellerObligorLimit(sellerId, "OBL-REJ2"));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
