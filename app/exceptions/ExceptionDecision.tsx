"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ExceptionDecision({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    setErr(null);
    const comment =
      decision === "APPROVE"
        ? window.prompt("Approval note (optional):") ?? undefined
        : window.prompt("Rejection reason:") ?? undefined;
    try {
      const res = await fetch(`/api/exceptions/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Decision failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        className="btn"
        style={{ padding: "5px 12px" }}
        disabled={busy}
        onClick={() => decide("APPROVE")}
        type="button"
      >
        Approve
      </button>
      <button
        className="btn secondary"
        style={{ padding: "5px 12px" }}
        disabled={busy}
        onClick={() => decide("REJECT")}
        type="button"
      >
        Reject
      </button>
      {err && <span className="check-pill red">{err}</span>}
    </div>
  );
}
