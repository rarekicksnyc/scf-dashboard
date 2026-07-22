"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocMeta } from "@/lib/documents";

interface Opt { id: string; name: string }

const DOC_TYPES = [
  "MASTER_RECEIVABLES_PURCHASE_AGREEMENT",
  "PARTICIPATION_AGREEMENT",
  "INSURANCE_POLICY",
  "GUARANTEE",
  "INCUMBENCY",
  "PRF",
  "SCHEDULE_A",
  "UTRC_COMMITMENT_REQUEST",
  "OTHER",
];
const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const field = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12 };

export default function DocumentsClient({
  documents,
  sellers,
  obligors,
  canEdit,
}: {
  documents: DocMeta[];
  sellers: Opt[];
  obligors: Opt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [attachType, setAttachType] = useState<"SELLER" | "OBLIGOR" | "TRANSACTION">("SELLER");
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? "");
  const [obligorId, setObligorId] = useState(obligors[0]?.id ?? "");
  const [txnId, setTxnId] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function attachChoice() {
    if (attachType === "SELLER") return { id: sellerId, label: sellers.find((s) => s.id === sellerId)?.name ?? sellerId };
    if (attachType === "OBLIGOR") return { id: obligorId, label: obligors.find((o) => o.id === obligorId)?.name ?? obligorId };
    return { id: txnId.trim(), label: txnId.trim() };
  }

  async function upload() {
    const choice = attachChoice();
    if (!file || !choice.id) {
      setMsg({ ok: false, text: !file ? "Choose a file." : "Enter the transaction/reservation id." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("attachType", attachType);
    fd.set("attachId", choice.id);
    fd.set("attachLabel", choice.label);
    fd.set("docType", docType);
    const res = await fetch("/api/documents", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: (await res.json()).error ?? "Upload failed." });
      return;
    }
    setMsg({ ok: true, text: "Uploaded." });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function replace(id: string, f: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set("file", f);
    const res = await fetch(`/api/documents/${id}`, { method: "PATCH", body: fd });
    setBusy(false);
    if (!res.ok) setMsg({ ok: false, text: (await res.json()).error ?? "Replace failed." });
    else { setMsg({ ok: true, text: "Replaced." }); router.refresh(); }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) setMsg({ ok: false, text: (await res.json()).error ?? "Delete failed." });
    else { setMsg({ ok: true, text: "Deleted." }); router.refresh(); }
  }

  return (
    <>
      {canEdit && (
        <div className="panel">
          <h2>Upload a document</h2>
          <div style={{ padding: 18 }}>
            {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              <label style={field}>Attach to
                <select style={input} value={attachType} onChange={(e) => setAttachType(e.target.value as typeof attachType)}>
                  <option value="SELLER">Seller / program</option>
                  <option value="OBLIGOR">Obligor</option>
                  <option value="TRANSACTION">Transaction / reservation</option>
                </select>
              </label>
              {attachType === "SELLER" && (
                <label style={field}>Seller
                  <select style={input} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                    {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              )}
              {attachType === "OBLIGOR" && (
                <label style={field}>Obligor
                  <select style={input} value={obligorId} onChange={(e) => setObligorId(e.target.value)}>
                    {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              )}
              {attachType === "TRANSACTION" && (
                <label style={field}>Transaction / reservation id
                  <input style={input} value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="e.g. RSV-00003 or a batch id" />
                </label>
              )}
              <label style={field}>Document type
                <select style={input} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                </select>
              </label>
              <label style={field}>File
                <input ref={fileRef} style={{ ...input, padding: "6px 8px" }} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <span className="muted" style={{ fontSize: 10 }}>Up to 15 MB.</span>
              </label>
            </div>
            <button className="btn" style={{ marginTop: 14 }} type="button" onClick={upload} disabled={busy}>
              {busy ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Repository ({documents.length})</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Attached to</th>
                <th className="num">Size</th>
                <th>Uploaded by</th>
                <th>Uploaded</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>No documents yet.</td></tr>
              ) : (
                documents.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.fileName}</td>
                    <td><span className="badge grey">{label(d.docType)}</span></td>
                    <td>
                      <span className="muted" style={{ fontSize: 11 }}>{d.attachType === "SELLER" ? "Seller" : d.attachType === "OBLIGOR" ? "Obligor" : "Txn"}</span>{" "}
                      {d.attachLabel || d.attachId}
                    </td>
                    <td className="num">{kb(d.sizeBytes)}</td>
                    <td className="muted">{d.uploadedByName || "—"}</td>
                    <td className="muted">{d.uploadedAt.slice(0, 10)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <a className="btn secondary" style={{ padding: "3px 9px", fontSize: 12 }} href={`/api/documents/${d.id}`}>Download</a>
                        {canEdit && (
                          <>
                            <button className="btn secondary" style={{ padding: "3px 9px", fontSize: 12 }} type="button" disabled={busy}
                              onClick={() => replaceRefs.current[d.id]?.click()}>Replace</button>
                            <input ref={(el) => { replaceRefs.current[d.id] = el; }} type="file" style={{ display: "none" }}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) replace(d.id, f); e.target.value = ""; }} />
                            <button className="btn secondary" style={{ padding: "3px 9px", fontSize: 12, color: "var(--red)" }} type="button" disabled={busy}
                              onClick={() => remove(d.id, d.fileName)}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
