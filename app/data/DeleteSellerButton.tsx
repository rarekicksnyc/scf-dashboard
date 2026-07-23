"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Delete a seller (facility) and everything tied only to it. Two-step confirm;
// blocked server-side while the seller has an active forward book.
export default function DeleteSellerButton({ sellerId, sellerName }: { sellerId: string; sellerName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete seller "${sellerName}" and all of its limits, entities, ASR sublimits, and participation agreements? This cannot be undone.`)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/sellers/${sellerId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "Failed to delete seller.");
      return;
    }
    // Navigate to the base Data Management page (a different seller loads).
    router.push("/data");
    router.refresh();
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        className="btn secondary"
        style={{ padding: "5px 12px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }}
        onClick={remove}
        disabled={busy}
        type="button"
      >
        {busy ? "Deleting…" : "Delete seller"}
      </button>
      {err && <span className="check-pill red" style={{ fontSize: 11 }}>{err}</span>}
    </span>
  );
}
