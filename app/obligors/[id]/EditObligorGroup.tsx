"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";

export interface ObligorGroupData {
  id: string;
  name: string;
  cdl: string;
  country: string;
  sector: string;
  status: string;
  eligible: boolean;
  expiryDate: string;
  hasGuarantee: boolean;
  guaranteeEligible: boolean;
}

// Edit an obligor group's own fields (name changes, country, sector, status,
// eligibility, group approval expiry, guarantee flags). Gated to PM & Admin.
export default function EditObligorGroup({ obligor, countries }: { obligor: ObligorGroupData; countries: { code: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: obligor.name,
    country: obligor.country,
    sector: obligor.sector ?? "",
    status: obligor.status,
    eligible: obligor.eligible,
    expiryDate: obligor.expiryDate ?? "",
    hasGuarantee: obligor.hasGuarantee,
    guaranteeEligible: obligor.guaranteeEligible,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/obligors/${obligor.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(f),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Failed to save." });
      return;
    }
    setMsg({ ok: true, text: "Saved ✓" });
    router.refresh();
  }

  const opts = countries.some((c) => c.code === f.country) ? countries : [{ code: f.country, name: f.country }, ...countries];

  return (
    <div className="panel">
      <h2>Obligor group details</h2>
      <div style={{ padding: 14 }}>
        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          <label style={field}>Obligor name
            <input style={input} value={f.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label style={field}>Country
            <select style={input} value={f.country} onChange={(e) => set("country", e.target.value)}>
              {opts.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label style={field}>Sector
            <input style={input} value={f.sector} onChange={(e) => set("sector", e.target.value)} />
          </label>
          <label style={field}>Group approval expiry
            <input style={input} type="date" value={f.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
          </label>
          <label style={field}>Status
            <select style={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="WATCHLIST">WATCHLIST</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>
          </label>
          <label style={{ ...field, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={f.eligible} onChange={(e) => set("eligible", e.target.checked)} />
            Eligible
          </label>
          <label style={{ ...field, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={f.hasGuarantee} onChange={(e) => set("hasGuarantee", e.target.checked)} />
            Has obligor guarantee
          </label>
          {f.hasGuarantee && (
            <label style={{ ...field, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={f.guaranteeEligible} onChange={(e) => set("guaranteeEligible", e.target.checked)} />
              Guarantee eligible
            </label>
          )}
        </div>
        <button className="btn" style={{ marginTop: 14 }} onClick={save} disabled={busy} type="button">
          {busy ? "Saving…" : "Save obligor details"}
        </button>
      </div>
    </div>
  );
}
