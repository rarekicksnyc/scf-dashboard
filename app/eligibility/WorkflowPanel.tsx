"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usd } from "@/lib/format";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import type { TransactionWorkflow, WorkflowStatus } from "@/lib/types";

interface SellerEntityOpt { sellerId: string; id: string; name: string }
interface SignatoryOpt { sellerId: string; entityId?: string; name: string; title: string }

const STATUS: Record<WorkflowStatus, { cls: string; label: string }> = {
  IN_PROGRESS: { cls: "grey", label: "In progress" },
  CLIENT_EMAILED: { cls: "yellow", label: "Client emailed" },
  EXECUTED: { cls: "yellow", label: "Executed" },
  SIGNATURE_FLAGGED: { cls: "red", label: "Signature flagged" },
  SIGNATURE_VERIFIED: { cls: "green", label: "Signature verified" },
  BOOKING_EMAILED: { cls: "green", label: "Booking emailed" },
  BOOKED: { cls: "green", label: "Booked" },
  CANCELLED: { cls: "grey", label: "Cancelled" },
};

async function downloadEml(url: string) {
  const res = await fetch(url);
  if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed to generate email."); return false; }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (url.split("/").pop() || "email") + ".eml";
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

export default function WorkflowPanel({ workflows, sellerEntities, signatories, canBook, highlightId }: { workflows: TransactionWorkflow[]; sellerEntities: SellerEntityOpt[]; signatories: SignatoryOpt[]; canBook: boolean; highlightId?: string }) {
  const active = workflows.filter((w) => w.status !== "BOOKED" && w.status !== "CANCELLED");
  const done = workflows.filter((w) => w.status === "BOOKED" || w.status === "CANCELLED");
  return (
    <div className="panel">
      <h2>In-progress transactions ({active.length})</h2>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {active.length === 0 && <div className="muted" style={{ fontSize: 13 }}>None yet. Load a reservation above and click Proceed with Transaction.</div>}
        {active.map((w) => <Row key={w.id} w={w} sellerEntities={sellerEntities.filter((e) => e.sellerId === w.sellerId)} signatories={signatories.filter((s) => s.sellerId === w.sellerId)} canBook={canBook} highlight={w.id === highlightId} />)}
        {done.length > 0 && (
          <details>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Booked / cancelled ({done.length})</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {done.map((w) => (
                <div key={w.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
                  <span className={`badge ${STATUS[w.status].cls}`}>{STATUS[w.status].label}</span>
                  <strong>{w.reference}</strong> <span className="muted">{w.sellerName} / {w.obligorName} · {usd(w.coverage)}</span>
                  {w.bookedTransactionId && <span className="muted">→ {w.bookedTransactionId}</span>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Row({ w, sellerEntities, signatories, canBook, highlight }: { w: TransactionWorkflow; sellerEntities: SellerEntityOpt[]; signatories: SignatoryOpt[]; canBook: boolean; highlight?: boolean }) {
  const router = useRouter();
  const rowRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // When this card is the one just created, scroll to it and flash a highlight.
  useEffect(() => {
    if (!highlight) return;
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(t);
  }, [highlight]);
  const [exec, setExec] = useState({ signerName: "", signerTitle: "", sellerEntityId: "", fileName: "", fileBase64: "", contentType: "" });
  const [signerOther, setSignerOther] = useState(false);
  const [bookBlock, setBookBlock] = useState<string[] | null>(null);
  const [bookComment, setBookComment] = useState("");
  const st = STATUS[w.status];

  async function book(override = false) {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/transaction-flow/${w.id}/book`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ override, comment: bookComment }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (data.canOverride) { setBookBlock(data.breachReasons ?? []); setErr(data.error ?? "Does not clear."); }
      else setErr(data.error ?? "Failed to book.");
      return;
    }
    setBookBlock(null); setBookComment("");
    router.refresh();
  }

  async function post(path: string, body?: unknown) {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/transaction-flow/${w.id}${path}`, {
      method: body ? "POST" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed."); return false; }
    router.refresh();
    return true;
  }

  async function emailDraft(kind: "client-email" | "booking-email" | "investor-email") {
    setBusy(true); setErr(null);
    const ok = await downloadEml(`/api/transaction-flow/${w.id}/${kind}`);
    setBusy(false);
    if (ok) router.refresh();
  }

  async function pickFile(file: File) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    setExec((s) => ({ ...s, fileName: file.name, contentType: file.type || "application/octet-stream", fileBase64: btoa(bin) }));
  }

  async function submitExecute() {
    if (!exec.signerName.trim()) { setErr("Enter who signed."); return; }
    await post("/execute", exec);
  }

  async function cancel() {
    if (!confirm(`Cancel transaction ${w.reference}?`)) return;
    setBusy(true); setErr(null);
    const res = await fetch(`/api/transaction-flow/${w.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  const canExecute = w.status === "IN_PROGRESS" || w.status === "CLIENT_EMAILED" || w.status === "SIGNATURE_FLAGGED";

  return (
    <div ref={rowRef} style={{ border: `1px solid ${flash ? "var(--brand)" : "var(--border)"}`, borderRadius: 8, padding: "12px 14px", boxShadow: flash ? "0 0 0 3px var(--brand-soft)" : "none", transition: "box-shadow 0.4s, border-color 0.4s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className={`badge ${st.cls}`}>{st.label}</span>
        <strong>{w.reference}</strong>
        <span className="muted">{w.sellerName} <span style={{ opacity: 0.5 }}>/</span> {w.obligorName} · {w.productType} · {usd(w.coverage)} · {w.valueDate}</span>
        <button type="button" onClick={() => setShowTimeline((s) => !s)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12 }}>
          {showTimeline ? "▾ hide history" : `▸ history (${w.timeline.length})`}
        </button>
        {canBook && <button className="btn secondary" style={{ padding: "3px 8px", fontSize: 11, borderColor: "var(--red)", color: "var(--red)" }} type="button" onClick={cancel} disabled={busy}>Cancel</button>}
      </div>

      {showTimeline && (
        <ul style={{ margin: "8px 0 0 18px", fontSize: 12 }} className="muted">
          {w.timeline.map((t, i) => <li key={i}>{t.at.slice(0, 16).replace("T", " ")} — {t.event} <span style={{ opacity: 0.7 }}>({t.by})</span></li>)}
        </ul>
      )}

      {err && <div className="notice err" style={{ marginTop: 8 }}>{err}</div>}

      {/* Stage actions */}
      {canBook && (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        {(w.status === "IN_PROGRESS" || w.status === "CLIENT_EMAILED") && (
          <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} type="button" disabled={busy} onClick={() => emailDraft("client-email")}>
            {w.status === "CLIENT_EMAILED" ? "Re-draft client email" : "Generate client email draft"}
          </button>
        )}
        {w.investorAmount != null && w.investorAmount > 0 && (
          <button className="btn secondary" style={{ padding: "6px 12px", fontSize: 12 }} type="button" disabled={busy} onClick={() => emailDraft("investor-email")} title="Draft the investor email with the investor Schedule A">
            Email investor
          </button>
        )}
        {w.status === "SIGNATURE_FLAGGED" && (
          <>
            <span className="badge red">Signer &ldquo;{w.signerName}&rdquo; not on the authorized list</span>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} type="button" disabled={busy} onClick={() => post("/review-signature", { valid: true })}>Confirm valid — proceed</button>
            <button className="btn secondary" style={{ padding: "6px 12px", fontSize: 12 }} type="button" disabled={busy} onClick={() => post("/review-signature", { valid: false })}>Reject — advise re-execute</button>
          </>
        )}
        {w.status === "SIGNATURE_VERIFIED" && (
          <>
            <span className="badge green">Signer {w.signerName} verified</span>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} type="button" disabled={busy} onClick={() => emailDraft("booking-email")}>Generate booking-team email</button>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12, background: "var(--green)" }} type="button" disabled={busy} onClick={() => book(false)}>Book transaction in system</button>
          </>
        )}
        {w.status === "BOOKING_EMAILED" && (
          <button className="btn" style={{ padding: "6px 12px", fontSize: 12, background: "var(--green)" }} type="button" disabled={busy} onClick={() => book(false)}>Book transaction in system</button>
        )}
      </div>
      )}

      {canBook && bookBlock && (
        <div style={{ marginTop: 8, border: "1px solid var(--orange)", borderRadius: 8, padding: 12, background: "var(--orange-bg)" }}>
          <div style={{ fontWeight: 700, color: "var(--orange)", marginBottom: 6, fontSize: 13 }}>No longer clears eligibility — book with exception?</div>
          <ul style={{ margin: "0 0 8px 18px", color: "var(--orange)", fontSize: 12 }}>{bookBlock.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...input, flex: 1, minWidth: 220, fontSize: 12 }} value={bookComment} onChange={(e) => setBookComment(e.target.value)} placeholder="Reason for exception (required)" />
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12, background: "var(--green)" }} type="button" disabled={busy || !bookComment.trim()} onClick={() => book(true)}>Book with exception</button>
            <button className="btn secondary" style={{ padding: "6px 12px", fontSize: 12 }} type="button" onClick={() => { setBookBlock(null); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Executed-doc upload + signer check */}
      {canBook && canExecute && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "#fafbfd" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Upload executed document &amp; check signer</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, alignItems: "end" }}>
            {signatories.length > 0 && !signerOther ? (
              <label style={field}>Signatory
                <select
                  style={input}
                  value={exec.signerName ? `${exec.signerName}|${exec.signerTitle}` : ""}
                  onChange={(e) => {
                    if (e.target.value === "__other__") { setSignerOther(true); setExec((s) => ({ ...s, signerName: "", signerTitle: "" })); return; }
                    const [name, title] = e.target.value.split("|");
                    setExec((s) => ({ ...s, signerName: name ?? "", signerTitle: title ?? "" }));
                  }}
                >
                  <option value="">Select who signed…</option>
                  {signatories.map((s, i) => <option key={i} value={`${s.name}|${s.title}`}>{s.name} — {s.title}</option>)}
                  <option value="__other__">Other (not on the authorized list)</option>
                </select>
              </label>
            ) : (
              <>
                <label style={field}>Signer name
                  <input style={input} value={exec.signerName} onChange={(e) => setExec((s) => ({ ...s, signerName: e.target.value }))} placeholder="who signed" />
                </label>
                <label style={field}>Signer title
                  <input style={input} value={exec.signerTitle} onChange={(e) => setExec((s) => ({ ...s, signerTitle: e.target.value }))} />
                </label>
                {signatories.length > 0 && <button type="button" className="btn secondary" style={{ padding: "4px 8px", fontSize: 11, alignSelf: "center" }} onClick={() => setSignerOther(false)}>← pick from list</button>}
              </>
            )}
            {sellerEntities.length > 0 && (
              <label style={field}>Signed for entity
                <select style={input} value={exec.sellerEntityId} onChange={(e) => setExec((s) => ({ ...s, sellerEntityId: e.target.value }))}>
                  <option value="">Group (any)</option>
                  {sellerEntities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
            )}
            <label style={field}>Executed file
              <input type="file" style={{ fontSize: 12 }} onChange={(e) => { const file = e.target.files?.[0]; if (file) pickFile(file); }} />
            </label>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} type="button" disabled={busy} onClick={submitExecute}>Check signer</button>
          </div>
        </div>
      )}
    </div>
  );
}
