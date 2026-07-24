"use client";

import { useMemo, useState } from "react";
import { usd } from "@/lib/format";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import { buildDocSet, fillTemplate, wordDocument, type DocTokens, type GeneratedDoc } from "@/lib/docgen";
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
  reservations,
  templates,
}: {
  sellers: Opt[];
  reservations: ResvOpt[];
  templates: DocTemplate[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    reservationId: "",
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
  });
  const [docs, setDocs] = useState<GeneratedDoc[] | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const isUtrc = f.productType === "UTRC";

  function loadReservation(rid: string) {
    const rv = reservations.find((r) => r.id === rid);
    if (!rv) { set("reservationId", ""); return; }
    setF((s) => ({
      ...s,
      reservationId: rid,
      sellerId: rv.sellerId,
      obligor: rv.obligorName,
      amount: String(rv.amount),
      advanceRate: "100",
      valueDate: rv.valueDate,
      maturityDate: rv.maturityDate,
      pricingBps: String(rv.pricingBps),
    }));
    setDocs(null);
  }

  const sellerName = sellers.find((s) => s.id === f.sellerId)?.name ?? f.sellerId;
  const amount = Number(f.amount) || 0;
  const coverage = isUtrc ? amount : Math.round(amount * (Number(f.advanceRate) || 0) / 100);

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
  }), [sellerName, f, amount, coverage, isUtrc, today]);

  function resolveTemplate(type: DocTemplate["type"]): string {
    const override = templates.find((t) => t.type === type && t.sellerId === f.sellerId);
    const def = templates.find((t) => t.type === type && !t.sellerId);
    return (override ?? def)?.body ?? "";
  }

  function generate() {
    const reqType = isUtrc ? "COMMITMENT_REQUEST" : "PURCHASE_REQUEST";
    const requestBody = fillTemplate(resolveTemplate(reqType), tokens);
    setDocs(buildDocSet({ isUtrc, tokens, requestBody }));
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
          <label style={{ ...field, gridColumn: "span 2" }}>Autofill from reservation
            <select style={input} value={f.reservationId} onChange={(e) => loadReservation(e.target.value)}>
              <option value="">Select an open reservation…</option>
              {reservations.map((r) => <option key={r.id} value={r.id}>{r.obligorName} | {usd(r.amount)} | {r.valueDate}</option>)}
            </select>
          </label>
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
        </div>

        <button className="btn" type="button" onClick={generate}>Generate documents</button>

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
