"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BatchActions({
  batchId,
  canPayment,
}: {
  batchId: string;
  canPayment: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/batches/${batchId}/rerun`, {
        method: "POST",
      });
      if (!res.ok) {
        setNote("Re-run failed.");
        return;
      }
      setNote("Eligibility re-run against current limits.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row-actions">
      <a className="btn secondary" href={`/api/batches/${batchId}/export`}>
        Export exception report (CSV)
      </a>
      <button className="btn secondary" onClick={rerun} disabled={busy} type="button">
        {busy ? "Re-running…" : "Re-run eligibility"}
      </button>
      {canPayment && (
        <a className="btn secondary" href={`/api/batches/${batchId}/payment-file`}>
          Generate payment file
        </a>
      )}
      {note && <span className="muted">{note}</span>}
    </div>
  );
}
