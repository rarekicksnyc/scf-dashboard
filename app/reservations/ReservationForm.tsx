"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usd } from "@/lib/format";
import { clampPct, coverageAmount, inputBase as input, fieldLabel as field } from "@/lib/ui";

interface Opt { id: string; name: string }
interface EntityOpt { groupId: string; id: string; name: string }
type Mode = "DISCOUNT" | "SWINGLINE";

export default function ReservationForm({
  sellers,
  obligors,
  obligorEntities,
  rrlSellers,
  investors,
  policies,
  canBook,
}: {
  sellers: Opt[];
  obligors: Opt[];
  obligorEntities: EntityOpt[];
  rrlSellers: string[];
  investors: Opt[];
  policies: Opt[];
  canBook: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("DISCOUNT");
  const [form, setForm] = useState({
    sellerId: sellers[0]?.id ?? "",
    obligorId: obligors[0]?.id ?? "",
    obligorEntityId: "",
    invoiceNumber: "RSV-9001",
    invoiceAmount: "10000000",
    invoiceType: "FINAL",
    advanceRate: "95",
    valueDate: "2026-08-15",
    maturityDate: "2026-11-13",
    pricingBps: "125",
    productType: "DTR",
    baseRateType: "SOFR",
    baseRate: "0",
    bookRrl: false,
    rrlAmount: "0",
    distributed: false,
    insured: false,
  });
  const [investorAllocs, setInvestorAllocs] = useState<{ investorId: string; amount: string }[]>([
    { investorId: investors[0]?.id ?? "", amount: "4000000" },
  ]);
  const [insurerAllocs, setInsurerAllocs] = useState<{ policyId: string; amount: string }[]>([
    { policyId: policies[0]?.id ?? "", amount: "5000000" },
  ]);
  const [swl, setSwl] = useState({
    entityType: "SELLER" as "SELLER" | "OBLIGOR",
    entityId: sellers[0]?.id ?? "",
    direction: "REDUCTION" as "REDUCTION" | "INCREASE",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);
  const [comment, setComment] = useState("");
  const [resolveBy, setResolveBy] = useState("");

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const coverage = coverageAmount(Number(form.invoiceAmount) || 0, (Number(form.advanceRate) || 0) / 100);

  async function submit(override: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const body =
        mode === "SWINGLINE"
          ? {
              kind: "SWINGLINE",
              entityType: swl.entityType,
              entityId: swl.entityId,
              swinglineDirection: swl.direction,
              amount: Number(form.invoiceAmount),
              valueDate: form.valueDate,
              maturityDate: form.maturityDate,
              override,
              comment,
              resolveByDate: resolveBy || undefined,
            }
          : {
              kind: "DISCOUNT",
              sellerId: form.sellerId,
              obligorId: form.obligorId,
              obligorEntityId: form.obligorEntityId || undefined,
              invoiceNumber: form.invoiceNumber,
              invoiceAmount: Number(form.invoiceAmount),
              invoiceType: form.invoiceType,
              advanceRate: Number(form.advanceRate) / 100,
              pricingBps: Number(form.pricingBps),
              productType: form.productType,
              baseRateType: form.baseRateType,
              baseRate: Number(form.baseRate),
              rrlAmount: form.bookRrl && rrlSellers.includes(form.sellerId) ? Number(form.rrlAmount) : 0,
              valueDate: form.valueDate,
              maturityDate: form.maturityDate,
              distributed: form.distributed,
              investorAllocations: form.distributed
                ? investorAllocs.map((a) => ({ investorId: a.investorId, amount: Number(a.amount) }))
                : undefined,
              insured: form.insured,
              insurerAllocations: form.insured
                ? insurerAllocs.map((a) => ({ policyId: a.policyId, amount: Number(a.amount) }))
                : undefined,
              override,
              comment,
              resolveByDate: resolveBy || undefined,
            };
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const reasons = (data.checks ?? [])
          .filter((c: { severity: string }) => c.severity === "RED" || c.severity === "ORANGE")
          .map((c: { message: string }) => c.message);
        if (data.canOverride) {
          setBlockedReasons(reasons);
          setMsg({ ok: false, text: data.error ?? "Does not clear." });
        } else {
          setMsg({ ok: false, text: `${data.error ?? "Failed."} ${reasons.join(" ")}` });
        }
        return;
      }
      const label = data.decision === "EXCEPTION" ? " with soft-warning exception" : "";
      setMsg({ ok: true, text: `Booked ${data.reservation.id}${label}.` });
      setBlockedReasons(null);
      setComment("");
      setResolveBy("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!canBook) {
    return (
      <div className="notice err">
        Your current role cannot book reservations. Switch to Operations,
        Relationship Manager, Product Manager, or Administrator.
      </div>
    );
  }

  const swlEntities = swl.entityType === "SELLER" ? sellers : obligors;

  return (
    <div className="panel">
      <h2>{mode === "SWINGLINE" ? "Book a swingline adjustment" : "Reserve a future discount"}</h2>
      <div style={{ padding: 18 }}>
        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

        <div className="tabs" style={{ marginBottom: 14 }}>
          {(["DISCOUNT", "SWINGLINE"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`tab ${mode === m ? "on" : ""}`}
              style={{ background: "none", border: "none", cursor: "pointer" }}
              onClick={() => {
                setMode(m);
                setBlockedReasons(null);
                setMsg(null);
              }}
            >
              {m === "DISCOUNT" ? "Discount reservation" : "Swingline adjustment"}
            </button>
          ))}
        </div>

        {mode === "DISCOUNT" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              <label style={field}>Seller
                <select style={input} value={form.sellerId} onChange={(e) => setForm((f) => ({ ...f, sellerId: e.target.value }))}>
                  {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={field}>Obligor
                <select style={input} value={form.obligorId} onChange={(e) => setForm((f) => ({ ...f, obligorId: e.target.value, obligorEntityId: "" }))}>
                  {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              {obligorEntities.some((e) => e.groupId === form.obligorId) && (
                <label style={field}>Obligor legal entity
                  <select style={input} value={form.obligorEntityId} onChange={(e) => set("obligorEntityId", e.target.value)}>
                    <option value="">Group aggregate (no entity)</option>
                    {obligorEntities.filter((e) => e.groupId === form.obligorId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
              )}
              <label style={field}>Invoice #
                <input style={input} value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} />
              </label>
              <label style={field}>Invoice amount (USD)
                <input style={input} type="number" value={form.invoiceAmount} onChange={(e) => set("invoiceAmount", e.target.value)} />
              </label>
              <label style={field}>Invoice type
                <select style={input} value={form.invoiceType} onChange={(e) => set("invoiceType", e.target.value)}>
                  <option value="FINAL">Final</option>
                  <option value="PROVISIONAL">Provisional</option>
                  <option value="PIPELINE">Pipeline</option>
                </select>
              </label>
              <label style={field}>Advance rate (%)
                <input style={input} type="number" min="0" max="100" step="0.5" value={form.advanceRate} onChange={(e) => set("advanceRate", clampPct(e.target.value))} />
              </label>
              <label style={field}>Coverage amount (USD)
                <input style={{ ...input, background: "#f2f4f8", fontWeight: 600 }} value={usd(coverage)} readOnly tabIndex={-1} />
                <span className="muted" style={{ fontSize: 10 }}>invoice amount × advance rate</span>
              </label>
              <label style={field}>Margin (bps)
                <input style={input} type="number" value={form.pricingBps} onChange={(e) => set("pricingBps", e.target.value)} />
              </label>
              <label style={field}>Product type
                <select style={input} value={form.productType} onChange={(e) => set("productType", e.target.value)}>
                  <option value="DTR">DTR (discount)</option>
                  <option value="UTRC">UTRC (commitment)</option>
                </select>
              </label>
              <label style={field}>Expected value date
                <input style={input} type="date" value={form.valueDate} onChange={(e) => set("valueDate", e.target.value)} />
              </label>
              <label style={field}>Expected maturity
                <input style={input} type="date" value={form.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
              </label>
              <label style={field}>Base rate
                <select style={input} value={form.baseRateType} onChange={(e) => set("baseRateType", e.target.value)}>
                  <option value="SOFR">SOFR</option>
                  <option value="COF">COF</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label style={field}>Base rate (%)
                <input style={input} type="number" step="0.01" value={form.baseRate} onChange={(e) => set("baseRate", e.target.value)} />
                <span className="muted" style={{ fontSize: 10 }}>0 = use rate sheet (offer, closest tenor)</span>
              </label>
            </div>

            {rrlSellers.includes(form.sellerId) && (
              <div style={{ marginTop: 16, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "#fafbfd" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={form.bookRrl} onChange={(e) => set("bookRrl", e.target.checked)} />
                  Book part of this reservation against the RRL (Risk Reimbursement Line)
                </label>
                {form.bookRrl && (
                  <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={field}>RRL amount (USD)
                      <input style={input} type="number" min="0" value={form.rrlAmount} onChange={(e) => set("rrlAmount", e.target.value)} />
                    </label>
                    <div className="muted" style={{ fontSize: 12, paddingBottom: 8, flex: 1, minWidth: 260 }}>
                      Of {usd(coverage)} funded, <strong>{usd(Math.min(Number(form.rrlAmount) || 0, coverage))}</strong> books to the RRL and{" "}
                      <strong>{usd(Math.max(coverage - (Number(form.rrlAmount) || 0), 0))}</strong> to the seller line. The obligor books the full {usd(coverage)}.
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 300 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={form.distributed} onChange={(e) => set("distributed", e.target.checked)} />
                  Distributed (one or more investors)
                </label>
                {form.distributed && (
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
                  <input type="checkbox" checked={form.insured} onChange={(e) => set("insured", e.target.checked)} />
                  Insured (one or more insurers)
                </label>
                {form.insured && (
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
          </>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            <label style={field}>Applies to
              <select style={input} value={swl.entityType}
                onChange={(e) => {
                  const et = e.target.value as "SELLER" | "OBLIGOR";
                  const list = et === "SELLER" ? sellers : obligors;
                  setSwl((s) => ({ ...s, entityType: et, entityId: list[0]?.id ?? "" }));
                }}>
                <option value="SELLER">Seller</option>
                <option value="OBLIGOR">Obligor</option>
              </select>
            </label>
            <label style={field}>{swl.entityType === "SELLER" ? "Seller" : "Obligor"}
              <select style={input} value={swl.entityId} onChange={(e) => setSwl((s) => ({ ...s, entityId: e.target.value }))}>
                {swlEntities.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label style={field}>Direction
              <select style={input} value={swl.direction} onChange={(e) => setSwl((s) => ({ ...s, direction: e.target.value as "REDUCTION" | "INCREASE" }))}>
                <option value="REDUCTION">Reduction (draws down available)</option>
                <option value="INCREASE">Increase (releases available)</option>
              </select>
            </label>
            <label style={field}>Amount (USD)
              <input style={input} type="number" value={form.invoiceAmount} onChange={(e) => set("invoiceAmount", e.target.value)} />
            </label>
            <label style={field}>Value date
              <input style={input} type="date" value={form.valueDate} onChange={(e) => set("valueDate", e.target.value)} />
            </label>
            <label style={field}>Maturity date
              <input style={input} type="date" value={form.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
            </label>
          </div>
        )}

        {!blockedReasons && (
          <button className="btn" style={{ marginTop: 16 }} onClick={() => submit(false)} disabled={busy} type="button">
            {busy ? "Running eligibility…" : mode === "SWINGLINE" ? "Book swingline adjustment" : "Reserve"}
          </button>
        )}

        {blockedReasons && (
          <div style={{ marginTop: 6, border: "1px solid var(--orange)", borderRadius: 8, padding: 14, background: "var(--orange-bg)" }}>
            <div style={{ fontWeight: 700, color: "var(--orange)", marginBottom: 6 }}>
              Does not clear — soft-warning exception
            </div>
            <ul style={{ margin: "0 0 10px 18px", color: "var(--orange)", fontSize: 13 }}>
              {blockedReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ ...field, flex: 1, minWidth: 240 }}>
                Reason for exception (required)
                <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g. Seller ASR line up for renewal — approved pending re-execution."
                  style={{ ...input, minHeight: 56, resize: "vertical" }} />
              </label>
              <label style={field}>
                Resolve by
                <input style={input} type="date" value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn" onClick={() => submit(true)} disabled={busy || comment.trim().length === 0} type="button">
                {busy ? "Booking…" : "Submit with soft-warning exception"}
              </button>
              <button className="btn secondary" onClick={() => { setBlockedReasons(null); setMsg(null); }} type="button">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
