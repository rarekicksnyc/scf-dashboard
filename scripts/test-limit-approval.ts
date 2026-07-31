import { store, addLimit, findLimit, limitApproved, listPendingLimits, approveLimit, rejectLimit } from "@/lib/data/store";

let pass=0,fail=0; const ok=(n:string,c:boolean,x="")=>{c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL "+n+" "+x));};

// A brand-new obligor limit created pending four-eyes.
const eid = "OBL-APPROVAL-TEST";
const l = addLimit({ type:"OBLIGOR", cdl:"99887766", entityType:"OBLIGOR", entityId:eid, approvedLimit:20_000_000, maxTenorDays:120, expiryDate:"2027-01-01", approval:{ reference:"GCARS-1", requestedBy:"u_maker", requestedByName:"Maker" } });

ok("created PENDING", l.approval?.status === "PENDING");
ok("pending limit is NOT approved", !limitApproved(l));
ok("engine does NOT find a pending limit (no capacity)", findLimit("OBLIGOR", eid) === undefined);
ok("appears in the approvals queue", listPendingLimits().some(x=>x.id===l.id));

// Four-eyes: maker cannot approve own limit.
ok("maker cannot self-approve", approveLimit(l.id, "u_maker", "Maker").ok === false);
ok("maker cannot self-reject", rejectLimit(l.id, "u_maker").ok === false);

// A different user approves -> limit goes live.
ok("second user approves", approveLimit(l.id, "u_checker", "Checker").ok === true);
ok("now approved", limitApproved(findLimit("OBLIGOR", eid)!));
ok("engine now finds it (grants capacity)", findLimit("OBLIGOR", eid)?.id === l.id);
ok("no longer in the queue", !listPendingLimits().some(x=>x.id===l.id));

// Reject removes a pending limit.
const l2 = addLimit({ type:"OBLIGOR", cdl:"99887766", entityType:"OBLIGOR", entityId:"OBL-REJ", approvedLimit:5_000_000, maxTenorDays:90, expiryDate:"2027-01-01", approval:{ reference:"GCARS-2", requestedBy:"u_maker", requestedByName:"Maker" } });
ok("reject by other user removes it", rejectLimit(l2.id, "u_checker").ok === true && !store.limits.some(x=>x.id===l2.id));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
