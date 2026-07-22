"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SofrRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/rates/refresh-sofr", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Refresh failed." });
      return;
    }
    setMsg({ ok: true, text: `SOFR ${data.rate}% as of ${data.effectiveDate} loaded across ${data.count} tenors.` });
    router.refresh();
  }

  return (
    <div className="panel">
      <h2>Live SOFR (NY Fed)</h2>
      <div style={{ padding: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={refresh} disabled={busy}>
          {busy ? "Fetching…" : "Refresh SOFR from NY Fed"}
        </button>
        <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 280 }}>
          Pulls the official overnight SOFR fixing from the New York Fed public feed and applies it across the
          standard tenor buckets. The tenor-specific Term SOFR curve needs a licensed feed.
        </span>
        {msg && <span className={`badge ${msg.ok ? "green" : "red"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
