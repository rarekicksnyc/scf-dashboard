"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPanel() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("upload.csv");
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSample() {
    setError(null);
    setXlsxBase64(null);
    const res = await fetch("/api/sample");
    const text = await res.text();
    setCsv(text);
    setFileName("sample_batch.csv");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name) && !file.name.toLowerCase().endsWith(".csv")) {
      // Excel: read binary → base64.
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      setXlsxBase64(btoa(bin));
      setCsv(`(Excel file loaded: ${file.name} — ${bytes.length.toLocaleString()} bytes)`);
    } else {
      setXlsxBase64(null);
      setCsv(await file.text());
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = xlsxBase64
        ? { fileBase64: xlsxBase64, fileName }
        : { csv, fileName };
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      router.push(`/batches/${data.batchId}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = xlsxBase64 !== null || csv.trim().length > 0;

  return (
    <div className="panel">
      <h2>Upload invoice batch</h2>
      <div style={{ padding: 18 }}>
        {error && <div className="notice err">{error}</div>}
        <div className="row-actions">
          <button className="btn secondary" onClick={loadSample} type="button">
            Load sample batch
          </button>
          <label className="btn secondary" style={{ cursor: "pointer" }}>
            Choose CSV / Excel…
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </label>
          <button className="btn" onClick={submit} disabled={busy || !canSubmit} type="button">
            {busy ? "Running eligibility…" : "Run eligibility"}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Accepts CSV or Excel (.xlsx), one row per invoice (a single invoice is
          fine). Recognized columns: seller, seller PCG, obligor, obligor PCG,
          invoice amount, invoice number (optional), plus currency / dates if
          present. Seller and obligor match by id, name, or CDL.
        </div>
        <textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setXlsxBase64(null);
          }}
          placeholder="Paste CSV here, load the sample, or choose a CSV/Excel file."
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: 160,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}
