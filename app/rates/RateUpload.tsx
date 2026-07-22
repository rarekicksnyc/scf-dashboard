"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RateUpload() {
  const router = useRouter();
  const [rateType, setRateType] = useState("SOFR");
  const [csv, setCsv] = useState("");
  const [xlsx, setXlsx] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMsg(null);
    if (/\.xlsx?$/i.test(file.name) && !file.name.toLowerCase().endsWith(".csv")) {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      setXlsx(btoa(bin));
      setCsv(`(Excel: ${file.name})`);
    } else {
      setXlsx(null);
      setCsv(await file.text());
    }
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    const body = xlsx ? { fileBase64: xlsx, rateType } : { csv, rateType };
    const res = await fetch("/api/rates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Upload failed." });
      return;
    }
    setMsg({ ok: true, text: `Loaded ${data.count} ${data.rateType} rate rows.` });
    router.refresh();
  }

  const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 13 };

  return (
    <div className="panel">
      <h2>Upload rate sheet</h2>
      <div style={{ padding: 18 }}>
        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
        <div className="row-actions">
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            Rate type
            <select style={input} value={rateType} onChange={(e) => setRateType(e.target.value)}>
              <option value="SOFR">SOFR</option>
              <option value="COF">COF</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="btn secondary" style={{ cursor: "pointer" }}>
            Choose CSV / Excel…
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} style={{ display: "none" }} />
          </label>
          <button className="btn" onClick={submit} disabled={busy || (!xlsx && csv.trim().length === 0)} type="button">
            {busy ? "Uploading…" : `Upload ${rateType} rates`}
          </button>
          {fileName && <span className="muted" style={{ fontSize: 12 }}>{fileName}</span>}
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Columns: start days / value date, maturity, bid, offer, calcrate, error. Offer is the used rate. Uploading replaces the selected rate type.
        </div>
        <textarea
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setXlsx(null); }}
          placeholder="value_date,maturity,bid,offer,calcrate,error"
          spellCheck={false}
          style={{ width: "100%", minHeight: 100, fontFamily: "ui-monospace, monospace", fontSize: 12, border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}
        />
      </div>
    </div>
  );
}
