"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookRow } from "./ForwardBook";

const field = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12 };
const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 13, width: "100%" };

export default function EditReservationForm({
  reservation: r,
  onDone,
}: {
  reservation: BookRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const isSwl = r.kind === "SWINGLINE";
  const [amount, setAmount] = useState(String(r.amount));
  const [valueDate, setValueDate] = useState(r.valueDate);
  const [maturityDate, setMaturityDate] = useState(r.maturityDate);
  const [pricingBps, setPricingBps] = useState(String(r.pricingBps));
  const [direction, setDirection] = useState<"REDUCTION" | "INCREASE">(r.swinglineDirection ?? "REDUCTION");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);
  const [comment, setComment] = useState(r.exceptionComment ?? "");
  const [resolveBy, setResolveBy] = useState(r.resolveByDate ?? "");

  async function save(override: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/reservations/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          valueDate,
          maturityDate,
          pricingBps: isSwl ? undefined : Number(pricingBps),
          swinglineDirection: isSwl ? direction : undefined,
          override,
          comment,
          resolveByDate: resolveBy || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reasons = (data.checks ?? []).map((c: { message: string }) => c.message);
        if (data.canOverride) {
          setBlockedReasons(reasons);
          setMsg(data.error ?? "Does not clear.");
        } else {
          setMsg(`${data.error ?? "Failed."} ${reasons.join(" ")}`);
        }
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: "#fafbfd", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Adjust {r.id}</div>
      {msg && <div className="notice err">{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        <label style={field}>Amount (USD)
          <input style={input} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label style={field}>Value date
          <input style={input} type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)} />
        </label>
        <label style={field}>Maturity date
          <input style={input} type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
        </label>
        {isSwl ? (
          <label style={field}>Direction
            <select style={input} value={direction} onChange={(e) => setDirection(e.target.value as "REDUCTION" | "INCREASE")}>
              <option value="REDUCTION">Reduction (draws down available)</option>
              <option value="INCREASE">Increase (releases available)</option>
            </select>
          </label>
        ) : (
          <label style={field}>Pricing (bps)
            <input style={input} type="number" value={pricingBps} onChange={(e) => setPricingBps(e.target.value)} />
          </label>
        )}
      </div>

      {blockedReasons && (
        <div style={{ marginTop: 12, border: "1px solid var(--orange)", borderRadius: 8, padding: 12, background: "var(--orange-bg)" }}>
          <div style={{ fontWeight: 700, color: "var(--orange)", marginBottom: 6 }}>Does not clear — keep as soft-warning exception</div>
          <ul style={{ margin: "0 0 10px 18px", color: "var(--orange)", fontSize: 13 }}>
            {blockedReasons.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...field, flex: 1, minWidth: 240 }}>Reason for exception (required)
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} style={{ ...input, minHeight: 48, resize: "vertical" }} />
            </label>
            <label style={field}>Resolve by
              <input style={input} type="date" value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {!blockedReasons ? (
          <button className="btn" onClick={() => save(false)} disabled={busy} type="button">
            {busy ? "Checking…" : "Save adjustment"}
          </button>
        ) : (
          <button className="btn" onClick={() => save(true)} disabled={busy || comment.trim().length === 0} type="button">
            {busy ? "Saving…" : "Save with soft-warning exception"}
          </button>
        )}
        <button className="btn secondary" onClick={onDone} type="button">Cancel</button>
      </div>
    </div>
  );
}
