// Regression for the audit's engine-parity / control-gate fixes (#1,#2,#4,#7).
import { store, resetExposure, findLimit, getObligor } from "@/lib/data/store";
import { checkDiscount } from "@/lib/engine/eligibility";
import { runBatch } from "@/lib/engine";
import type { DiscountTransaction, Invoice } from "@/lib/types";

let pass=0,fail=0; const ok=(n:string,c:boolean,x="")=>{c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL "+n+" "+x));};
resetExposure();
const sev=(r:ReturnType<typeof checkDiscount>,name:string)=>r.checks.find(c=>c.name===name)?.severity;
const base:DiscountTransaction={sellerId:"SELLER001",obligorId:"OBL001",invoiceNumber:"P",invoiceAmount:10_000_000,currency:"USD",invoiceType:"FINAL",advanceRate:1,valueDate:"2026-08-01",maturityDate:"2026-09-15",pricingBps:200,productType:"DTR",distributed:false,insured:false};

// #1 — interactive engine now checks the seller-level ASR limit.
const asr=findLimit("ASR","SELLER001")!; const origAsr=asr.approvedLimit;
asr.approvedLimit=5_000_000;
ok("#1 interactive engine flags ASR-limit overdraw (was ELIGIBLE)", sev(checkDiscount(base),"ASR limit")==="RED", String(sev(checkDiscount(base),"ASR limit")));
asr.approvedLimit=origAsr;

// #4 — lapsed obligor master limit -> RED.
const ol=findLimit("OBLIGOR","OBL001")!; const origExp=ol.expiryDate;
ol.expiryDate="2026-01-01"; // lapsed before the value date
ok("#4 lapsed obligor limit flagged RED", sev(checkDiscount(base),"Obligor limit expiry")==="RED", String(sev(checkDiscount(base),"Obligor limit expiry")));
ol.expiryDate=origExp;

// #7 — negative funded amount -> RED (interactive + batch).
ok("#7 interactive: negative funded amount RED", sev(checkDiscount({...base,invoiceAmount:-5_000_000}),"Funded amount")==="RED");
const invNeg:Invoice={invoiceNumber:"NEG",sellerId:"SELLER001",obligorId:"OBL001",amount:1_000_000,coverageAmount:-1,currency:"USD",issueDate:"2026-03-01",dueDate:"2026-06-01",requestedDiscountDate:"2026-03-15",advanceRate:1,productType:"DTR"};
const rNeg=runBatch([invNeg],{batchId:"BN",fileName:"n.csv",uploadedAt:"2026-03-15T00:00:00Z",makerUserId:"t"});
ok("#7 batch: negative coverage rejected", rNeg.results[0].status==="REJECTED" && rNeg.results[0].checks.some(c=>c.checkName==="INVOICE_DATA_CHECK"&&c.severity==="RED"));

// #2 — batch enforces the ASR approved-list (OBL004 is NOT on SELLER001's ASR).
const off:Invoice={invoiceNumber:"OFF",sellerId:"SELLER001",obligorId:"OBL004",amount:1_000_000,coverageAmount:1_000_000,currency:"USD",issueDate:"2026-03-01",dueDate:"2026-06-01",requestedDiscountDate:"2026-03-15",advanceRate:1,productType:"DTR"};
const rOff=runBatch([off],{batchId:"BO",fileName:"o.csv",uploadedAt:"2026-03-15T00:00:00Z",makerUserId:"t"});
ok("#2 batch flags obligor not on ASR approved list", rOff.results[0].checks.some(c=>c.checkName==="ASR_SUBLIMIT_CHECK"&&c.severity==="RED"), rOff.results[0].checks.map(c=>c.checkName).join(","));
void getObligor; void store;

resetExposure();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
