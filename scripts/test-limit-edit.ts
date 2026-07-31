import { store, addLimit, getLimitById, findLimit, stageLimitEdit, listPendingLimitEdits, approveLimitEdit, rejectLimitEdit } from "@/lib/data/store";

let pass=0,fail=0; const ok=(n:string,c:boolean,x="")=>{c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL "+n+" "+x));};

// A live, approved limit.
const l = addLimit({ type:"OBLIGOR", cdl:"12345678", entityType:"OBLIGOR", entityId:"OBL-EDIT", approvedLimit:10_000_000, maxTenorDays:90, expiryDate:"2027-01-01" });
ok("limit live (no approval block)", getLimitById(l.id)?.approvedLimit === 10_000_000);

// Stage an increase to 25MM.
stageLimitEdit(l.id, { approvedLimit: 25_000_000 }, { reference:"GCARS-E", requestedBy:"u_maker", requestedByName:"Maker" });
ok("staged edit recorded", getLimitById(l.id)?.pendingEdit?.approvedLimit === 25_000_000);
ok("LIVE value UNCHANGED while pending (old stays live)", getLimitById(l.id)?.approvedLimit === 10_000_000);
ok("engine still finds it at old value", findLimit("OBLIGOR", "OBL-EDIT")?.approvedLimit === 10_000_000);
ok("in pending-edits queue", listPendingLimitEdits().some(x=>x.id===l.id));

// Four-eyes: maker cannot approve own edit.
ok("maker cannot self-approve edit", approveLimitEdit(l.id, "u_maker", "Maker").ok === false);

// Second user approves -> applied.
ok("second user approves edit", approveLimitEdit(l.id, "u_checker", "Checker").ok === true);
ok("new value applied", getLimitById(l.id)?.approvedLimit === 25_000_000);
ok("pendingEdit cleared", !getLimitById(l.id)?.pendingEdit);

// Reject discards a staged edit (live value keeps).
stageLimitEdit(l.id, { approvedLimit: 99_000_000 }, { reference:"GCARS-E2", requestedBy:"u_maker", requestedByName:"Maker" });
ok("reject by other discards", rejectLimitEdit(l.id, "u_checker").ok === true && getLimitById(l.id)?.approvedLimit === 25_000_000 && !getLimitById(l.id)?.pendingEdit);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
