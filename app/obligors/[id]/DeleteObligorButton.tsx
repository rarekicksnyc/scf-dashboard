"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Delete an obligor group everywhere — its master and swingline limits, eligible
// entities, every seller's ASR sublimit for it, and its insurance buyer
// sublimits. Two-step confirm; blocked server-side while any seller has an
// active reservation against it.
export default function DeleteObligorButton({ obligorId, obligorName }: { obligorId: string; obligorName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete obligor group "${obligorName}" everywhere — its limits, entities, every seller's ASR sublimit for it, and its insurance buyer sublimits? This cannot be undone.`)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/obligors/${obligorId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "Failed to delete obligor.");
      return;
    }
    router.push("/?tab=obligors");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 18px" }}>
      <button
        className="btn secondary"
        style={{ padding: "6px 14px", fontSize: 13, borderColor: "var(--red)", color: "var(--red)" }}
        onClick={remove}
        disabled={busy}
        type="button"
      >
        {busy ? "Deleting…" : "Delete obligor group"}
      </button>
      {err && <span className="check-pill red" style={{ fontSize: 12 }}>{err}</span>}
    </div>
  );
}
