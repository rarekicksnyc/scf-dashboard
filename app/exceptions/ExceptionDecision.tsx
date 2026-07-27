"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Checker decision on a batch exception. The rejection reason is a required
// control — enforced inline here (Reject is disabled until a reason is typed),
// not left to a native prompt that can be dismissed blank.
export default function ExceptionDecision({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "APPROVE" | "REJECT">(null);
  const [comment, setComment] = useState("");

  async function submit() {
    if (!mode) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/exceptions/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: mode, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Decision failed."); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (mode) {
    const isReject = mode === "REJECT";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
        <textarea
          value={comment}
          autoFocus
          onChange={(e) => setComment(e.target.value)}
          placeholder={isReject ? "Rejection reason (required)" : "Approval note (optional)"}
          style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12, minHeight: 44, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className={isReject ? "btn secondary" : "btn"} style={{ padding: "4px 12px", fontSize: 12, ...(isReject ? { borderColor: "var(--red)", color: "var(--red)" } : {}) }} disabled={busy || (isReject && !comment.trim())} type="button" onClick={submit}>
            {busy ? "…" : isReject ? "Confirm reject" : "Confirm approve"}
          </button>
          <button className="btn secondary" style={{ padding: "4px 12px", fontSize: 12 }} type="button" onClick={() => { setMode(null); setComment(""); setErr(null); }}>Cancel</button>
          {err && <span className="check-pill red">{err}</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button className="btn" style={{ padding: "5px 12px" }} disabled={busy} onClick={() => setMode("APPROVE")} type="button">Approve</button>
      <button className="btn secondary" style={{ padding: "5px 12px" }} disabled={busy} onClick={() => setMode("REJECT")} type="button">Reject</button>
      {err && <span className="check-pill red">{err}</span>}
    </div>
  );
}
