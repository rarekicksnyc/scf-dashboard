"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Opt {
  id: string;
  name: string;
}
type Mode = "DISCOUNT" | "SWINGLINE";

export default function ReservationForm({
  sellers,
  obligors,
  canBook,
}: {
  sellers: Opt[];
  obligors: Opt[];
  canBook: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("DISCOUNT");
  const [form, setForm] = useState({
    sellerId: sellers[0]?.id ?? "",
    obligorId: obligors[0]?.id ?? "",
    amount: "5000000",
    valueDate: "2026-08-15",
    maturityDate: "2026-11-13",
    pricingBps: "125",
  });
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
              amount: Number(form.amount),
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
              amount: Number(form.amount),
              pricingBps: Number(form.pricingBps),
              valueDate: form.valueDate,
              maturityDate: form.maturityDate,
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
        const reasons = (data.checks ?? []).map((c: { message: string }) => c.message);
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

  const field = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12 };
  const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 13, width: "100%" };
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
          {mode === "DISCOUNT" ? (
            <>
              <label style={field}>Seller
                <select style={input} value={form.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
                  {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={field}>Obligor
                <select style={input} value={form.obligorId} onChange={(e) => set("obligorId", e.target.value)}>
                  {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label style={field}>Reservation amount (USD)
                <input style={input} type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </label>
              <label style={field}>Expected value date
                <input style={input} type="date" value={form.valueDate} onChange={(e) => set("valueDate", e.target.value)} />
              </label>
              <label style={field}>Expected maturity
                <input style={input} type="date" value={form.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
              </label>
              <label style={field}>Pricing (bps)
                <input style={input} type="number" value={form.pricingBps} onChange={(e) => set("pricingBps", e.target.value)} />
              </label>
            </>
          ) : (
            <>
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
                <input style={input} type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </label>
              <label style={field}>Value date
                <input style={input} type="date" value={form.valueDate} onChange={(e) => set("valueDate", e.target.value)} />
              </label>
              <label style={field}>Maturity date
                <input style={input} type="date" value={form.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
              </label>
            </>
          )}
        </div>

        {!blockedReasons && (
          <button className="btn" onClick={() => submit(false)} disabled={busy} type="button">
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
