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
const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 13, width: "100%" };

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
    distributed: false,
    insured: false,
  });
  // Multiple investors / insurers can share one deal.
  const [investorAllocs, setInvestorAllocs] = useState<{ investorId: string; amount: string }[]>([
    { investorId: investors[0]?.id ?? "", amount: "4000000" },
  ]);
  const [insurerAllocs, setInsurerAllocs] = useState<{ policyId: string; amount: string }[]>([
    { policyId: policies[0]?.id ?? "", amount: "5000000" },
  ]);
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
      distributed: f.distributed,
      investorAllocations: f.distributed
        ? investorAllocs.map((a) => ({ investorId: a.investorId, amount: Number(a.amount) }))
        : undefined,
      insured: f.insured,
      insurerAllocations: f.insured
        ? insurerAllocs.map((a) => ({ policyId: a.policyId, amount: Number(a.amount) }))
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
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
          </div>

          <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={f.distributed} onChange={(e) => set("distributed", e.target.checked)} />
                Distributed (one or more investors)
              </label>
              {f.distributed && (
                <div style={{ marginTop: 8 }}>
                  {investorAllocs.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-end" }}>
                      <label style={{ ...field, flex: 1 }}>Investor
                        <select style={input} value={a.investorId}
                          onChange={(e) => setInvestorAllocs((rows) => rows.map((r, j) => j === i ? { ...r, investorId: e.target.value } : r))}>
                          {investors.map((iv) => <option key={iv.id} value={iv.id}>{iv.name}</option>)}
                        </select>
                      </label>
                      <label style={field}>Participation (USD)
                        <input style={input} type="number" value={a.amount}
                          onChange={(e) => setInvestorAllocs((rows) => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))} />
                      </label>
                      {investorAllocs.length > 1 && (
                        <button className="btn secondary" style={{ padding: "6px 9px" }} type="button"
                          onClick={() => setInvestorAllocs((rows) => rows.filter((_, j) => j !== i))}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }} type="button"
                    onClick={() => setInvestorAllocs((rows) => [...rows, { investorId: investors[0]?.id ?? "", amount: "1000000" }])}>
                    + Add investor
                  </button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 300 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={f.insured} onChange={(e) => set("insured", e.target.checked)} />
                Insured (one or more insurers)
              </label>
              {f.insured && (
                <div style={{ marginTop: 8 }}>
                  {insurerAllocs.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-end" }}>
                      <label style={{ ...field, flex: 1 }}>Policy
                        <select style={input} value={a.policyId}
                          onChange={(e) => setInsurerAllocs((rows) => rows.map((r, j) => j === i ? { ...r, policyId: e.target.value } : r))}>
                          {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label style={field}>Insured amount (USD)
                        <input style={input} type="number" value={a.amount}
                          onChange={(e) => setInsurerAllocs((rows) => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))} />
                      </label>
                      {insurerAllocs.length > 1 && (
                        <button className="btn secondary" style={{ padding: "6px 9px" }} type="button"
                          onClick={() => setInsurerAllocs((rows) => rows.filter((_, j) => j !== i))}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }} type="button"
                    onClick={() => setInsurerAllocs((rows) => [...rows, { policyId: policies[0]?.id ?? "", amount: "1000000" }])}>
                    + Add insurer
                  </button>
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
