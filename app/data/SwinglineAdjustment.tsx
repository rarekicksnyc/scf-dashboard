"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Opt { id: string; name: string }
type Target = "SELLER" | "OBLIGOR" | "RRL";

const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 14, width: "100%" };
const field = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12 };

// Book a swingline adjustment (reduction / increase) on a seller, obligor, or
// RRL swingline. Recorded as a SWINGLINE reservation; feeds the swingline
// availability the engine and exposure use.
export default function SwinglineAdjustment({
  sellers,
  obligors,
  rrlSwlSellers,
  canBook,
}: {
  sellers: Opt[];
  obligors: Opt[];
  rrlSwlSellers: string[];
  canBook: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Target>("SELLER");
  const [entityId, setEntityId] = useState(sellers[0]?.id ?? "");
  const [direction, setDirection] = useState<"REDUCTION" | "INCREASE">("REDUCTION");
  const [amount, setAmount] = useState("5000000");
  const [valueDate, setValueDate] = useState("2026-08-15");
  const [maturityDate, setMaturityDate] = useState("2026-11-13");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [comment, setComment] = useState("");

  const entities = target === "OBLIGOR" ? obligors : target === "RRL" ? sellers.filter((s) => rrlSwlSellers.includes(s.id)) : sellers;

  function changeTarget(t: Target) {
    setTarget(t);
    const list = t === "OBLIGOR" ? obligors : t === "RRL" ? sellers.filter((s) => rrlSwlSellers.includes(s.id)) : sellers;
    setEntityId(list[0]?.id ?? "");
    setBlocked(null);
    setMsg(null);
  }

  async function submit(override: boolean) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "SWINGLINE",
        swinglineKind: target === "RRL" ? "RRL" : "REGULAR",
        entityType: target === "OBLIGOR" ? "OBLIGOR" : "SELLER",
        entityId,
        swinglineDirection: direction,
        amount: Number(amount),
        valueDate,
        maturityDate,
        override,
        comment,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      const reasons = (data.checks ?? []).filter((c: { severity: string }) => c.severity === "RED" || c.severity === "ORANGE").map((c: { message: string }) => c.message);
      if (data.canOverride) {
        setBlocked(reasons);
        setMsg({ ok: false, text: data.error ?? "Does not clear." });
      } else {
        setMsg({ ok: false, text: `${data.error ?? "Failed."} ${reasons.join(" ")}` });
      }
      return;
    }
    setMsg({ ok: true, text: `Booked ${data.reservation.id}.` });
    setBlocked(null);
    setComment("");
    router.refresh();
  }

  if (!canBook) return null;

  return (
    <div className="panel">
      <h2>Swingline adjustment</h2>
      <div style={{ padding: 18 }}>
        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          <label style={field}>Swingline
            <select style={input} value={target} onChange={(e) => changeTarget(e.target.value as Target)}>
              <option value="SELLER">Seller swingline</option>
              <option value="OBLIGOR">Obligor swingline</option>
              <option value="RRL">RRL swingline</option>
            </select>
          </label>
          <label style={field}>{target === "OBLIGOR" ? "Obligor" : "Seller"}
            <select style={input} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {entities.length === 0 ? <option value="">(none with an RRL swingline)</option> : entities.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label style={field}>Direction
            <select style={input} value={direction} onChange={(e) => setDirection(e.target.value as "REDUCTION" | "INCREASE")}>
              <option value="REDUCTION">Reduction (draws down available)</option>
              <option value="INCREASE">Increase (releases available)</option>
            </select>
          </label>
          <label style={field}>Amount (USD)
            <input style={input} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label style={field}>Value date
            <input style={input} type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)} />
          </label>
          <label style={field}>Maturity date
            <input style={input} type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
          </label>
        </div>

        {!blocked ? (
          <button className="btn" style={{ marginTop: 14 }} type="button" onClick={() => submit(false)} disabled={busy || !entityId}>
            {busy ? "Checking…" : "Book adjustment"}
          </button>
        ) : (
          <div style={{ marginTop: 12, border: "1px solid var(--orange)", borderRadius: 8, padding: 12, background: "var(--orange-bg)" }}>
            <div style={{ fontWeight: 700, color: "var(--orange)", marginBottom: 6 }}>Does not clear — soft-warning exception</div>
            <ul style={{ margin: "0 0 10px 18px", color: "var(--orange)", fontSize: 13 }}>{blocked.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <input style={{ ...input, marginBottom: 8 }} placeholder="Reason for exception" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="button" disabled={busy || !comment.trim()} onClick={() => submit(true)}>Book with exception</button>
              <button className="btn secondary" type="button" onClick={() => { setBlocked(null); setMsg(null); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
