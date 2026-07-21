"use client";

import { useState } from "react";
import type { EligibilityReport, EligibilityCategory } from "@/lib/types";

interface Opt {
  id: string;
  name: string;
}

const CATEGORIES: EligibilityCategory[] = [
  "SELLER",
  "OBLIGOR",
  "ASR",
  "TRANSACTION",
  "DISTRIBUTION",
  "INSURANCE",
];
const CAT_LABEL: Record<EligibilityCategory, string> = {
  SELLER: "Seller facility",
  OBLIGOR: "Obligor",
  ASR: "ASR approved obligor",
  TRANSACTION: "Transaction terms",
  DISTRIBUTION: "Distribution",
  INSURANCE: "Insurance",
};

const SEV_BADGE: Record<string, string> = {
  GREEN: "green",
  YELLOW: "yellow",
  ORANGE: "orange",
  RED: "red",
  GREY: "grey",
};

const DECISION_BADGE: Record<string, { cls: string; label: string }> = {
  ELIGIBLE: { cls: "green", label: "ELIGIBLE" },
  ELIGIBLE_WITH_WARNING: { cls: "yellow", label: "ELIGIBLE (WARNING)" },
  EXCEPTION_REQUIRED: { cls: "orange", label: "EXCEPTION REQUIRED" },
  REJECTED: { cls: "red", label: "REJECTED" },
};

const field = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12 };
const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 13 };

export default function EligibilityCheck({
  sellers,
  obligors,
  investors,
  policies,
}: {
  sellers: Opt[];
  obligors: Opt[];
  investors: Opt[];
  policies: Opt[];
}) {
  const [f, setF] = useState({
    sellerId: sellers[0]?.id ?? "",
    obligorId: obligors[0]?.id ?? "",
    invoiceNumber: "INV-9001",
    invoiceAmount: "10000000",
    invoiceType: "FINAL",
    advanceRate: "95",
    valueDate: "2026-08-01",
    maturityDate: "2026-11-01",
    pricingBps: "125",
    usesSwingline: false,
    distributed: false,
    investorId: investors[0]?.id ?? "",
    participationAmount: "4000000",
    insured: false,
    policyId: policies[0]?.id ?? "",
    insuredAmount: "5000000",
  });
  const [report, setReport] = useState<EligibilityReport | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function run() {
    setBusy(true);
    const body = {
      sellerId: f.sellerId,
      obligorId: f.obligorId,
      invoiceNumber: f.invoiceNumber,
      invoiceAmount: Number(f.invoiceAmount),
      invoiceType: f.invoiceType,
      advanceRate: Number(f.advanceRate) / 100,
      valueDate: f.valueDate,
      maturityDate: f.maturityDate,
      pricingBps: Number(f.pricingBps),
      usesSwingline: f.usesSwingline,
      distributed: f.distributed,
      investorId: f.investorId,
      participationAmount: Number(f.participationAmount),
      insured: f.insured,
      insurerAllocations: f.insured
        ? [{ policyId: f.policyId, amount: Number(f.insuredAmount) }]
        : undefined,
    };
    const res = await fetch("/api/eligibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setReport(await res.json());
    setBusy(false);
  }

  return (
    <>
      <div className="panel">
        <h2>Transaction</h2>
        <div style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            <label style={field}>Seller
              <select style={input} value={f.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={field}>Obligor
              <select style={input} value={f.obligorId} onChange={(e) => set("obligorId", e.target.value)}>
                {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label style={field}>Invoice #
              <input style={input} value={f.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} />
            </label>
            <label style={field}>Invoice amount (USD)
              <input style={input} type="number" value={f.invoiceAmount} onChange={(e) => set("invoiceAmount", e.target.value)} />
            </label>
            <label style={field}>Invoice type
              <select style={input} value={f.invoiceType} onChange={(e) => set("invoiceType", e.target.value)}>
                <option value="FINAL">Final</option>
                <option value="PROVISIONAL">Provisional</option>
                <option value="PIPELINE">Pipeline</option>
              </select>
            </label>
            <label style={field}>Advance rate (%)
              <input style={input} type="number" value={f.advanceRate} onChange={(e) => set("advanceRate", e.target.value)} />
            </label>
            <label style={field}>Value date
              <input style={input} type="date" value={f.valueDate} onChange={(e) => set("valueDate", e.target.value)} />
            </label>
            <label style={field}>Maturity date
              <input style={input} type="date" value={f.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
            </label>
            <label style={field}>Pricing (bps)
              <input style={input} type="number" value={f.pricingBps} onChange={(e) => set("pricingBps", e.target.value)} />
            </label>
            <label style={{ ...field, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 }}>
              <input type="checkbox" checked={f.usesSwingline} onChange={(e) => set("usesSwingline", e.target.checked)} />
              Draws swingline
            </label>
          </div>

          <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={f.distributed} onChange={(e) => set("distributed", e.target.checked)} />
                Distributed
              </label>
              {f.distributed && (
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <label style={field}>Investor
                    <select style={input} value={f.investorId} onChange={(e) => set("investorId", e.target.value)}>
                      {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </label>
                  <label style={field}>Participation (USD)
                    <input style={input} type="number" value={f.participationAmount} onChange={(e) => set("participationAmount", e.target.value)} />
                  </label>
                </div>
              )}
            </div>
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={f.insured} onChange={(e) => set("insured", e.target.checked)} />
                Insured
              </label>
              {f.insured && (
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <label style={field}>Policy
                    <select style={input} value={f.policyId} onChange={(e) => set("policyId", e.target.value)}>
                      {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label style={field}>Insured amount (USD)
                    <input style={input} type="number" value={f.insuredAmount} onChange={(e) => set("insuredAmount", e.target.value)} />
                  </label>
                </div>
              )}
            </div>
          </div>

          <button className="btn" style={{ marginTop: 16 }} onClick={run} disabled={busy} type="button">
            {busy ? "Checking eligibility…" : "Run eligibility check"}
          </button>
        </div>
      </div>

      {report && <Report report={report} />}
    </>
  );
}

function Report({ report }: { report: EligibilityReport }) {
  const d = DECISION_BADGE[report.decision];
  const counts = {
    fail: report.checks.filter((c) => c.status === "FAIL").length,
    warn: report.checks.filter((c) => c.status === "WARN").length,
    pass: report.checks.filter((c) => c.status === "PASS").length,
  };
  return (
    <>
      <div className="panel">
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span className={`badge ${d.cls}`} style={{ fontSize: 14, padding: "5px 14px" }}>{d.label}</span>
          <span className="muted">
            Funded {(report.advanceAmount / 1_000_000).toFixed(2)}MM · tenor {report.tenorDays}d ·
            {" "}{counts.pass} pass · {counts.warn} warn · {counts.fail} fail
          </span>
        </div>
      </div>

      {CATEGORIES.map((cat) => {
        const rows = report.checks.filter((c) => c.category === cat);
        if (rows.length === 0) return null;
        return (
          <div className="panel" key={cat}>
            <h2>{CAT_LABEL[cat]}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Checked against</th>
                    <th>Transaction</th>
                    <th>Result</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td className="muted">{c.checkedAgainst}</td>
                      <td>{c.txnValue}</td>
                      <td><span className={`badge ${SEV_BADGE[c.severity]}`}>{c.status}</span></td>
                      <td className="muted" style={{ whiteSpace: "normal", minWidth: 220 }}>{c.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
