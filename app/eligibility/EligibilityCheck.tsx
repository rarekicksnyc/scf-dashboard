"use client";

import { useState } from "react";
import type { EligibilityReport, EligibilityCategory } from "@/lib/types";
import { usd } from "@/lib/format";
import { clampPct, coverageAmount, inputBase as input, fieldLabel as field } from "@/lib/ui";

interface Opt {
  id: string;
  name: string;
}
interface EntityOpt {
  groupId: string;
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


export default function EligibilityCheck({
  sellers,
  obligors,
  obligorEntities,
  rrlSellers,
  investors,
  policies,
}: {
  sellers: Opt[];
  obligors: Opt[];
  obligorEntities: EntityOpt[];
  rrlSellers: string[];
  investors: Opt[];
  policies: Opt[];
}) {
  const [f, setF] = useState({
    sellerId: sellers[0]?.id ?? "",
    obligorId: obligors[0]?.id ?? "",
    obligorEntityId: "",
    invoiceNumber: "INV-9001",
    invoiceAmount: "10000000",
    invoiceType: "FINAL",
    advanceRate: "95",
    valueDate: "2026-08-01",
    maturityDate: "2026-11-01",
    pricingBps: "125",
    productType: "DTR",
    baseRateType: "SOFR",
    baseRate: "0",
    bookRrl: false,
    rrlAmount: "0",
    distributed: false,
    insured: false,
    // UTRC (unfunded commitment) fields
    committedAmount: "10000000",
    commitmentDueDate: "2027-02-01",
    finalDemandDate: "2027-08-01",
  });
  const isUtrc = f.productType === "UTRC";
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

  // Coverage (funded) amount = invoice amount × advance rate. Derived, read-only.
  const coverage = coverageAmount(Number(f.invoiceAmount) || 0, (Number(f.advanceRate) || 0) / 100);

  async function run() {
    setBusy(true);
    const body = {
      sellerId: f.sellerId,
      obligorId: f.obligorId,
      obligorEntityId: f.obligorEntityId || undefined,
      // RRL, distribution, and insurance apply to DTR discounting only.
      rrlAmount: !isUtrc && f.bookRrl ? Number(f.rrlAmount) || 0 : 0,
      invoiceNumber: f.invoiceNumber,
      invoiceAmount: Number(f.invoiceAmount),
      invoiceType: f.invoiceType,
      advanceRate: isUtrc ? 1 : Number(f.advanceRate) / 100,
      valueDate: f.valueDate,
      maturityDate: f.maturityDate,
      pricingBps: Number(f.pricingBps),
      productType: f.productType,
      committedAmount: isUtrc ? Number(f.committedAmount) || 0 : undefined,
      commitmentDueDate: isUtrc ? f.commitmentDueDate : undefined,
      finalDemandDate: isUtrc ? f.finalDemandDate : undefined,
      baseRateType: f.baseRateType,
      baseRate: Number(f.baseRate),
      distributed: !isUtrc && f.distributed,
      investorAllocations: !isUtrc && f.distributed
        ? investorAllocs.map((a) => ({ investorId: a.investorId, amount: Number(a.amount) }))
        : undefined,
      insured: !isUtrc && f.insured,
      insurerAllocations: !isUtrc && f.insured
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
          {/* Product type drives which input fields are shown below. */}
          <div style={{ marginBottom: 16, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "#fafbfd" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Product type</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([
                ["DTR", "DTR — discounted receivable", "Discount an invoice; computes discount & purchase price."],
                ["UTRC", "UTRC — unfunded commitment", "Commit to purchase; computes a commitment fee."],
              ] as [string, string, string][]).map(([v, label, hint]) => (
                <button key={v} type="button" onClick={() => set("productType", v)}
                  style={{
                    textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: "pointer", flex: "1 1 260px",
                    border: f.productType === v ? "2px solid var(--brand)" : "1px solid var(--border)",
                    background: f.productType === v ? "var(--brand-soft)" : "#fff",
                    color: f.productType === v ? "var(--brand)" : "var(--ink)",
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {/* ---- Common to both product types ---- */}
            <label style={field}>Seller
              <select style={input} value={f.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={field}>Obligor
              <select style={input} value={f.obligorId} onChange={(e) => setF((s) => ({ ...s, obligorId: e.target.value, obligorEntityId: "" }))}>
                {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            {obligorEntities.some((e) => e.groupId === f.obligorId) && (
              <label style={field}>Obligor legal entity
                <select style={input} value={f.obligorEntityId} onChange={(e) => set("obligorEntityId", e.target.value)}>
                  <option value="">Group aggregate (no entity)</option>
                  {obligorEntities.filter((e) => e.groupId === f.obligorId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
            )}
            <label style={field}>{isUtrc ? "Reference #" : "Invoice #"}
              <input style={input} value={f.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} />
            </label>
            <label style={field}>{isUtrc ? "Commitment date" : "Value date"}
              <input style={input} type="date" value={f.valueDate} onChange={(e) => set("valueDate", e.target.value)} />
            </label>
            <label style={field}>Margin (bps)
              <input style={input} type="number" value={f.pricingBps} onChange={(e) => set("pricingBps", e.target.value)} />
            </label>

            {/* ---- UTRC (unfunded commitment) fields ---- */}
            {isUtrc && (
              <>
                <label style={field}>Committed amount (USD)
                  <input style={input} type="number" min="0" value={f.committedAmount} onChange={(e) => set("committedAmount", e.target.value)} />
                  <span className="muted" style={{ fontSize: 10 }}>consumes the same limits as a DTR of this size</span>
                </label>
                <label style={field}>Commitment due date
                  <input style={input} type="date" value={f.commitmentDueDate} onChange={(e) => set("commitmentDueDate", e.target.value)} />
                  <span className="muted" style={{ fontSize: 10 }}>when the commitment falls due</span>
                </label>
                <label style={field}>Final permitted demand date
                  <input style={input} type="date" value={f.finalDemandDate} onChange={(e) => set("finalDemandDate", e.target.value)} />
                  <span className="muted" style={{ fontSize: 10 }}>last date a demand may be made — acts as maturity</span>
                </label>
              </>
            )}

            {/* ---- DTR (discounted receivable) fields ---- */}
            {!isUtrc && (
              <>
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
                  <input style={input} type="number" min="0" max="100" step="0.5" value={f.advanceRate} onChange={(e) => set("advanceRate", clampPct(e.target.value))} />
                </label>
                <label style={field}>Coverage amount (USD)
                  <input style={{ ...input, background: "#f2f4f8", fontWeight: 600 }} value={usd(coverage)} readOnly tabIndex={-1} />
                  <span className="muted" style={{ fontSize: 10 }}>invoice amount × advance rate</span>
                </label>
                <label style={field}>Maturity date
                  <input style={input} type="date" value={f.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
                </label>
                <label style={field}>Base rate
                  <select style={input} value={f.baseRateType} onChange={(e) => set("baseRateType", e.target.value)}>
                    <option value="SOFR">SOFR</option>
                    <option value="COF">COF</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label style={field}>Base rate (%)
                  <input style={input} type="number" step="0.01" value={f.baseRate} onChange={(e) => set("baseRate", e.target.value)} />
                  <span className="muted" style={{ fontSize: 10 }}>0 = use rate sheet (offer, closest tenor)</span>
                </label>
              </>
            )}
          </div>

          {!isUtrc && rrlSellers.includes(f.sellerId) && (
            <div style={{ marginTop: 16, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "#fafbfd" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={f.bookRrl} onChange={(e) => set("bookRrl", e.target.checked)} />
                Book part of this deal against the RRL (Risk Reimbursement Line)
              </label>
              {f.bookRrl && (
                <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <label style={field}>RRL amount (USD)
                    <input style={input} type="number" min="0" value={f.rrlAmount} onChange={(e) => set("rrlAmount", e.target.value)} />
                  </label>
                  <div className="muted" style={{ fontSize: 12, paddingBottom: 8, flex: 1, minWidth: 260 }}>
                    Of {usd(coverage)} funded, <strong>{usd(Math.min(Number(f.rrlAmount) || 0, coverage))}</strong> books to the RRL and{" "}
                    <strong>{usd(Math.max(coverage - (Number(f.rrlAmount) || 0), 0))}</strong> to the seller line. The obligor books the full {usd(coverage)}.
                  </div>
                </div>
              )}
            </div>
          )}

          {!isUtrc && (
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
          )}

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

      <div className="panel">
        <h2>Pricing — {report.pricing.productType}</h2>
        <div className="table-scroll">
          <table>
            <tbody>
              <tr><td>Base rate</td><td className="num">{report.pricing.baseRateType} {report.pricing.baseRatePct.toFixed(2)}%</td>
                  <td>Margin</td><td className="num">{report.pricing.marginBps} bps ({(report.pricing.marginBps / 100).toFixed(2)}%)</td>
                  <td>All-in rate</td><td className="num" style={{ fontWeight: 700 }}>{report.pricing.allInRatePct.toFixed(2)}%</td></tr>
              {report.pricing.productType === "DTR" ? (
                <tr><td>Coverage</td><td className="num">{(report.pricing.coverage / 1e6).toFixed(2)}MM</td>
                    <td>Discount</td><td className="num">{(report.pricing.discount / 1e6).toFixed(3)}MM</td>
                    <td>Purchase price</td><td className="num" style={{ fontWeight: 700 }}>{(report.pricing.purchasePrice / 1e6).toFixed(3)}MM</td></tr>
              ) : (
                <tr><td>Commitment</td><td className="num">{(report.pricing.coverage / 1e6).toFixed(2)}MM</td>
                    <td>Commitment fee</td><td className="num" style={{ fontWeight: 700 }}>{(report.pricing.commitmentFee / 1e6).toFixed(3)}MM</td>
                    <td>&nbsp;</td><td>&nbsp;</td></tr>
              )}
            </tbody>
          </table>
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
