"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";

interface Opt { id: string; name: string }

// Add an obligor to THIS seller's facility (its ASR approved list) — either link
// an existing obligor or create a new one, with the ASR sublimit, max tenor, and
// group approval expiry, all linked in one step.
export default function AddObligorToFacility({
  sellerId,
  sellerName,
  availableObligors,
  everyObligor,
}: {
  sellerId: string;
  sellerName: string;
  availableObligors: Opt[]; // obligors not yet on this seller's ASR
  everyObligor: Opt[]; // all obligors (used when adding to all sellers)
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"EXISTING" | "NEW">(availableObligors.length ? "EXISTING" : "NEW");
  const [f, setF] = useState({
    obligorId: availableObligors[0]?.id ?? everyObligor[0]?.id ?? "",
    name: "",
    cdl: "",
    country: "US",
    masterLimit: "50000000",
    asrSublimit: "25000000",
    maxTenorDays: "150",
    groupExpiry: "2026-12-31",
  });
  const [busy, setBusy] = useState(false);
  const [allSellers, setAllSellers] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/facility/add-obligor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sellerId,
        allSellers,
        mode,
        obligorId: mode === "EXISTING" ? f.obligorId : undefined,
        name: f.name,
        cdl: f.cdl,
        country: f.country,
        masterLimit: Number(f.masterLimit),
        asrSublimit: Number(f.asrSublimit),
        maxTenorDays: Number(f.maxTenorDays),
        groupExpiry: f.groupExpiry,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Failed to add obligor." });
      return;
    }
    const skip = Array.isArray(data.skipped) && data.skipped.length ? ` (already on ${data.skipped.length})` : "";
    setMsg({ ok: true, text: `Obligor added to ${data.linked} facility ASR list(s)${skip}.` });
    setF((s) => ({ ...s, name: "", cdl: "" }));
    router.refresh();
  }

  return (
    <div style={{ padding: 14, borderBottom: "1px solid var(--border)", background: "#fafbfd" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Add an obligor to {allSellers ? "every seller's" : `${sellerName}’s`} ASR
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={allSellers} onChange={(e) => setAllSellers(e.target.checked)} />
          Add to all sellers
        </label>
      </div>
      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 10 }}>{msg.text}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {(["EXISTING", "NEW"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: mode === m ? "2px solid var(--brand)" : "1px solid var(--border)",
              background: mode === m ? "var(--brand-soft)" : "#fff",
              color: mode === m ? "var(--brand)" : "var(--ink)",
            }}>
            {m === "EXISTING" ? "Link existing obligor" : "New obligor"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
        {mode === "EXISTING" ? (
          <label style={{ ...field, gridColumn: "span 2" }}>Obligor
            {(allSellers ? everyObligor : availableObligors).length ? (
              <select style={input} value={f.obligorId} onChange={(e) => set("obligorId", e.target.value)}>
                {(allSellers ? everyObligor : availableObligors).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>Every obligor is already on this ASR — use “New obligor”.</span>
            )}
          </label>
        ) : (
          <>
            <label style={field}>Obligor name
              <input style={input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Global Buyer Co" />
            </label>
            <label style={field}>CDL (8-digit)
              <input style={input} value={f.cdl} onChange={(e) => set("cdl", e.target.value)} placeholder="e.g. 10048201" />
            </label>
            <label style={field}>Country
              <input style={input} value={f.country} onChange={(e) => set("country", e.target.value)} />
            </label>
            <label style={field}>Master limit (USD)
              <input style={input} type="number" value={f.masterLimit} onChange={(e) => set("masterLimit", e.target.value)} />
            </label>
          </>
        )}

        <label style={field}>ASR sublimit (USD)
          <input style={input} type="number" value={f.asrSublimit} onChange={(e) => set("asrSublimit", e.target.value)} />
        </label>
        <label style={field}>Max tenor (days)
          <input style={input} type="number" value={f.maxTenorDays} onChange={(e) => set("maxTenorDays", e.target.value)} />
        </label>
        <label style={field}>Group approval expiry
          <input style={input} type="date" value={f.groupExpiry} onChange={(e) => set("groupExpiry", e.target.value)} />
        </label>

        <button className="btn" type="button" disabled={busy || (mode === "EXISTING" && !f.obligorId)} onClick={submit}>
          {busy ? "Adding…" : "Add to facility"}
        </button>
      </div>
    </div>
  );
}
