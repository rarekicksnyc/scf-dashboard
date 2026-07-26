"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usd, daysBetween } from "@/lib/format";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import { buildDocSet, fillTemplate, pricingTokens, investorTokens, wordDocument, type DocTokens, type GeneratedDoc } from "@/lib/docgen";
import type { DocTemplate } from "@/lib/types";
import type { ResvOpt } from "./MultiTransactionCheck";

interface Opt { id: string; name: string }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const slug = (s: string) => s.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

// The persistent Purchase Docs / Commitment Docs section. Select a reservation
// (or type the details) and a seller, choose the product type, and generate the
// Purchase Request + Schedule A (DTR) or Commitment Request + Schedule A (UTRC)
// from the seller's template (or the default). Preview on-platform; export each
// to Word and Excel.
export default function DocsSection({
  sellers,
  selected,
  templates,
  canBook,
  sofr1,
  sofr30,
  cofCurve,
}: {
  sellers: Opt[];
  selected: ResvOpt | null;
  templates: DocTemplate[];
  canBook: boolean;
  sofr1?: number;
  sofr30?: number;
  cofCurve: { tenorDays: number; offer: number }[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [proceedMsg, setProceedMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [proceedBlock, setProceedBlock] = useState<string[] | null>(null);
  const [proceedComment, setProceedComment] = useState("");
  const [f, setF] = useState({
    reservationId: "",
    obligorId: "",
    sellerId: sellers[0]?.id ?? "",
    productType: "DTR",
    obligor: "",
    reference: "TXN-0001",
    currency: "USD",
    amount: "10000000", // invoice (DTR) or committed (UTRC)
    advanceRate: "95",
    valueDate: "2026-08-01",
    maturityDate: "2026-11-01",
    commitmentDueDate: "2027-02-01",
    finalDemandDate: "2027-08-01",
    pricingBps: "125",
    baseRate: "4.50", // input & confirmed by the PM before sending to the client
    investorOn: false,
    investorName: "",
    investorAmount: "0",
    skimBps: "25",
  });
  const [docs, setDocs] = useState<GeneratedDoc[] | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const isUtrc = f.productType === "UTRC";

  // Closest COF offer to a tenor, to preload the base rate the PM confirms.
  function closestCof(days: number): number | undefined {
    if (cofCurve.length === 0) return undefined;
    return cofCurve.reduce((best, r) => (Math.abs(r.tenorDays - days) < Math.abs(best.tenorDays - days) ? r : best)).offer;
  }

  // Autofill from the shared reservation selection — and preload the reference
  // and the base rate (closest COF) so the PM confirms rather than re-enters.
  useEffect(() => {
    if (!selected) return;
    const tenor = daysBetween(selected.valueDate, selected.maturityDate);
    const cof = closestCof(tenor);
    setF((s) => ({
      ...s,
      reservationId: selected.id,
      obligorId: selected.obligorId,
      sellerId: selected.sellerId,
      obligor: selected.obligorName,
      reference: selected.id,
      amount: String(selected.amount),
      advanceRate: "100",
      valueDate: selected.valueDate,
      maturityDate: selected.maturityDate,
      pricingBps: String(selected.pricingBps),
      baseRate: cof != null ? cof.toFixed(2) : s.baseRate,
    }));
    setDocs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const sellerName = sellers.find((s) => s.id === f.sellerId)?.name ?? f.sellerId;
  const amount = Number(f.amount) || 0;
  const coverage = isUtrc ? amount : Math.round(amount * (Number(f.advanceRate) || 0) / 100);
  const tenorDays = daysBetween(f.valueDate, isUtrc ? f.finalDemandDate : f.maturityDate);
  // Interpolated SOFR for the investor portion (linear between 1-day and 30-day).
  const haveSofr = sofr1 != null && sofr30 != null;
  const interpSofr = !haveSofr ? 0 : tenorDays > 30 ? sofr30! : sofr1! + ((Math.max(1, tenorDays) - 1) / 29) * (sofr30! - sofr1!);

  const tokens: DocTokens = useMemo(() => ({
    seller: sellerName,
    obligor: f.obligor,
    reference: f.reference,
    currency: f.currency,
    product_type: f.productType,
    invoice_amount: usd(amount),
    advance_rate: `${f.advanceRate}%`,
    coverage: usd(coverage),
    committed_amount: usd(amount),
    value_date: f.valueDate,
    maturity_date: f.maturityDate,
    commitment_due_date: f.commitmentDueDate,
    final_demand_date: f.finalDemandDate,
    pricing_bps: String(f.pricingBps),
    today,
    primary_amount: isUtrc ? usd(amount) : usd(coverage),
    document_name: isUtrc ? "Commitment Request" : "Purchase Request",
    // Derived pricing (discount / purchase price / fee / revenue).
    ...pricingTokens({ coverage, pricingBps: Number(f.pricingBps) || 0, baseRatePct: Number(f.baseRate) || 0, tenorDays }),
  }), [sellerName, f, amount, coverage, isUtrc, today, tenorDays]);

  function resolveTemplate(type: DocTemplate["type"]): string {
    const override = templates.find((t) => t.type === type && t.sellerId === f.sellerId);
    const def = templates.find((t) => t.type === type && !t.sellerId);
    return (override ?? def)?.body ?? "";
  }

  const investorEnabled = f.investorOn && !isUtrc && (Number(f.investorAmount) || 0) > 0;

  function generate() {
    const reqType = isUtrc ? "COMMITMENT_REQUEST" : "PURCHASE_REQUEST";
    const requestBody = fillTemplate(resolveTemplate(reqType), tokens);
    const scheduleSpec = resolveTemplate(isUtrc ? "SCHEDULE_A_UTRC" : "SCHEDULE_A_DTR");
    const investor = investorEnabled
      ? {
          spec: resolveTemplate("SCHEDULE_A_INVESTOR"),
          tokens: { ...tokens, ...investorTokens({ investorName: f.investorName, investorAmount: Number(f.investorAmount) || 0, skimBps: Number(f.skimBps) || 0, marginBps: Number(f.pricingBps) || 0, interpSofrPct: interpSofr, tenorDays }) },
        }
      : undefined;
    setDocs(buildDocSet({ isUtrc, tokens, requestBody, scheduleSpec, investor }));
  }

  async function proceed(override = false) {
    setProceedMsg(null);
    const res = await fetch("/api/transaction-flow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reservationId: f.reservationId,
        sellerId: f.sellerId,
        obligorId: f.obligorId,
        productType: f.productType,
        reference: f.reference,
        currency: f.currency,
        amount,
        advanceRate: (Number(f.advanceRate) || 0) / 100,
        valueDate: f.valueDate,
        maturityDate: f.maturityDate,
        commitmentDueDate: isUtrc ? f.commitmentDueDate : undefined,
        finalDemandDate: isUtrc ? f.finalDemandDate : undefined,
        pricingBps: Number(f.pricingBps),
        baseRate: isUtrc ? undefined : Number(f.baseRate) || 0,
        investorName: investorEnabled ? f.investorName : undefined,
        investorAmount: investorEnabled ? Number(f.investorAmount) || 0 : undefined,
        skimBps: investorEnabled ? Number(f.skimBps) || 0 : undefined,
        override,
        comment: proceedComment,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.canOverride) { setProceedBlock(data.breachReasons ?? []); setProceedMsg({ ok: false, text: data.error ?? "Does not clear." }); }
      else setProceedMsg({ ok: false, text: data.error ?? "Could not proceed." });
      return;
    }
    setProceedBlock(null);
    setProceedComment("");
    setProceedMsg({ ok: true, text: `Transaction ${data.workflow.id} is now in progress — jumping to it below.` });
    // Navigate with the new id so the panel scrolls to and highlights the card.
    router.push(`/eligibility?highlight=${encodeURIComponent(data.workflow.id)}`);
    router.refresh();
  }

  function exportWord(doc: GeneratedDoc) {
    const blob = new Blob([wordDocument(doc.html)], { type: "application/msword" });
    download(blob, `${slug(doc.title)}-${slug(f.reference)}.doc`);
  }

  async function exportExcel(doc: GeneratedDoc) {
    let columns: string[];
    let rows: string[][];
    if (doc.kind === "SCHEDULE_A" && doc.table) {
      columns = doc.table.columns;
      rows = [doc.table.row];
    } else {
      // Request doc → its key fields as a Field/Value sheet.
      columns = ["Field", "Value"];
      const keys: [string, string][] = isUtrc
        ? [["Seller", tokens.seller], ["Obligor", tokens.obligor], ["Reference", tokens.reference], ["Currency", tokens.currency], ["Committed amount", tokens.committed_amount], ["Commitment date", tokens.value_date], ["Commitment due date", tokens.commitment_due_date], ["Final demand date", tokens.final_demand_date], ["Fee margin (bps)", tokens.pricing_bps]]
        : [["Seller", tokens.seller], ["Obligor", tokens.obligor], ["Reference", tokens.reference], ["Currency", tokens.currency], ["Invoice amount", tokens.invoice_amount], ["Advance rate", tokens.advance_rate], ["Coverage amount", tokens.coverage], ["Value date", tokens.value_date], ["Maturity date", tokens.maturity_date], ["Margin (bps)", tokens.pricing_bps]];
      rows = keys.map(([k, v]) => [k, v]);
    }
    const res = await fetch("/api/docs/xlsx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sheetName: doc.title.slice(0, 31), columns, rows, filename: `${slug(doc.title)}-${slug(f.reference)}.xlsx` }),
    });
    if (!res.ok) return;
    download(await res.blob(), `${slug(doc.title)}-${slug(f.reference)}.xlsx`);
  }

  return (
    <div className="panel">
      <h2>Purchase Docs / Commitment Docs</h2>
      <div style={{ padding: 14 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: "90ch" }}>
          Generate the transaction paperwork from the seller&rsquo;s template (or the default). DTR produces a
          Purchase Request + Schedule A; UTRC produces a Commitment Request + Schedule A. Preview here, then
          export each to Word or Excel to view / edit. The request document is the one that gets signed.
        </p>

        {f.reservationId && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Loaded from reservation <span className="badge grey">{f.reservationId}</span></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
          <label style={field}>Seller (template)
            <select style={input} value={f.sellerId} onChange={(e) => { set("sellerId", e.target.value); setDocs(null); }}>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={field}>Product type
            <select style={input} value={f.productType} onChange={(e) => { set("productType", e.target.value); setDocs(null); }}>
              <option value="DTR">DTR (Purchase Request)</option>
              <option value="UTRC">UTRC (Commitment Request)</option>
            </select>
          </label>
          <label style={field}>Obligor
            <input style={input} value={f.obligor} onChange={(e) => set("obligor", e.target.value)} />
          </label>
          <label style={field}>Reference #
            <input style={input} value={f.reference} onChange={(e) => set("reference", e.target.value)} />
          </label>
          <label style={field}>Currency
            <input style={input} value={f.currency} onChange={(e) => set("currency", e.target.value)} />
          </label>
          <label style={field}>{isUtrc ? "Committed amount (USD)" : "Invoice amount (USD)"}
            <input style={input} type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
          </label>
          {!isUtrc && (
            <label style={field}>Advance rate (%)
              <input style={input} type="number" value={f.advanceRate} onChange={(e) => set("advanceRate", e.target.value)} />
            </label>
          )}
          <label style={field}>{isUtrc ? "Commitment date" : "Value date"}
            <input style={input} type="date" value={f.valueDate} onChange={(e) => set("valueDate", e.target.value)} />
          </label>
          {isUtrc ? (
            <>
              <label style={field}>Commitment due date
                <input style={input} type="date" value={f.commitmentDueDate} onChange={(e) => set("commitmentDueDate", e.target.value)} />
              </label>
              <label style={field}>Final demand date
                <input style={input} type="date" value={f.finalDemandDate} onChange={(e) => set("finalDemandDate", e.target.value)} />
              </label>
            </>
          ) : (
            <label style={field}>Maturity date
              <input style={input} type="date" value={f.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
            </label>
          )}
          <label style={field}>Margin (bps)
            <input style={input} type="number" value={f.pricingBps} onChange={(e) => set("pricingBps", e.target.value)} />
          </label>
          {!isUtrc && (
            <label style={field}>Base rate (%)
              <input style={input} type="number" step="0.01" value={f.baseRate} onChange={(e) => set("baseRate", e.target.value)} />
              <span className="muted" style={{ fontSize: 10 }}>PM-confirmed before the client executes</span>
            </label>
          )}
        </div>
        {!isUtrc && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Discount rate {tokens.discount_rate} · Discount {tokens.discount} · Purchase price {tokens.purchase_price} · MUFG revenue (margin only) {tokens.revenue}
          </div>
        )}

        {!isUtrc && (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "#fafbfd" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={f.investorOn} onChange={(e) => { set("investorOn", e.target.checked); setDocs(null); }} />
              Investor participation (client funded at COF + margin; investor takes SOFR + margin − skim)
            </label>
            {f.investorOn && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginTop: 10 }}>
                  <label style={field}>Investor name
                    <input style={input} value={f.investorName} onChange={(e) => set("investorName", e.target.value)} />
                  </label>
                  <label style={field}>Investor amount (USD)
                    <input style={input} type="number" value={f.investorAmount} onChange={(e) => set("investorAmount", e.target.value)} />
                  </label>
                  <label style={field}>Skim fee (bps)
                    <input style={input} type="number" value={f.skimBps} onChange={(e) => set("skimBps", e.target.value)} />
                  </label>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {haveSofr
                    ? <>Interpolated SOFR {interpSofr.toFixed(3)}% · investor rate {(interpSofr + (Number(f.pricingBps) - Number(f.skimBps)) / 100).toFixed(3)}% (SOFR + {(Number(f.pricingBps) - Number(f.skimBps))} bps) · a separate investor Schedule A is generated.</>
                    : <>Add a 1-day and 30-day SOFR on the rate sheet to interpolate the investor rate.</>}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={generate}>Generate documents</button>
          {canBook && (
            <button className="btn secondary" type="button" onClick={() => proceed(false)} disabled={!f.reservationId} title={f.reservationId ? "" : "Load a reservation first"}>
              Proceed with Transaction
            </button>
          )}
          {canBook && !f.reservationId && <span className="muted" style={{ fontSize: 11 }}>Load a reservation to proceed.</span>}
        </div>
        {proceedMsg && <div className={`notice ${proceedMsg.ok ? "ok" : "err"}`} style={{ marginTop: 10 }}>{proceedMsg.text}</div>}
        {proceedBlock && (
          <div style={{ marginTop: 10, border: "1px solid var(--orange)", borderRadius: 8, padding: 12, background: "var(--orange-bg)" }}>
            <div style={{ fontWeight: 700, color: "var(--orange)", marginBottom: 6 }}>Does not clear — proceed with exception?</div>
            <ul style={{ margin: "0 0 8px 18px", color: "var(--orange)", fontSize: 13 }}>{proceedBlock.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ ...field, flex: 1, minWidth: 240 }}>Reason for exception (required)
                <input style={input} value={proceedComment} onChange={(e) => setProceedComment(e.target.value)} placeholder="e.g. credit approved pending renewal" />
              </label>
              <button className="btn" type="button" disabled={!proceedComment.trim()} onClick={() => proceed(true)}>Proceed with exception</button>
              <button className="btn secondary" type="button" onClick={() => { setProceedBlock(null); setProceedMsg(null); }}>Cancel</button>
            </div>
          </div>
        )}

        {docs && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {docs.map((doc) => (
              <div key={doc.key} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: "#fafbfd", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <strong>{doc.title}{doc.kind === "REQUEST" ? " (to be signed)" : ""}</strong>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn secondary" style={{ padding: "5px 12px", fontSize: 12 }} type="button" onClick={() => exportWord(doc)}>Export Word</button>
                    <button className="btn secondary" style={{ padding: "5px 12px", fontSize: 12 }} type="button" onClick={() => exportExcel(doc)}>Export Excel</button>
                  </div>
                </div>
                <div style={{ padding: 16, background: "#fff", overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: doc.html }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
