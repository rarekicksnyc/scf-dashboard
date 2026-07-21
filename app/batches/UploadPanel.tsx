"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPanel() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("upload.csv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSample() {
    setError(null);
    const res = await fetch("/api/sample");
    const text = await res.text();
    setCsv(text);
    setFileName("sample_batch.csv");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, fileName }),
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
            Choose CSV…
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </label>
          <button
            className="btn"
            onClick={submit}
            disabled={busy || csv.trim().length === 0}
            type="button"
          >
            {busy ? "Running eligibility…" : "Run eligibility"}
          </button>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="Paste CSV here, load the sample, or choose a file. Columns: invoice_number, seller_id, obligor_id, invoice_amount, currency, issue_date, due_date, requested_discount_date"
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: 180,
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
