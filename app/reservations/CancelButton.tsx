"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn secondary"
        style={{ padding: "4px 10px", fontSize: 12 }}
        disabled={busy}
        type="button"
        onClick={async () => {
          if (!confirm(`Cancel reservation ${id}? Its held capacity is released.`)) return;
          setBusy(true);
          setErr(null);
          const res = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
          setBusy(false);
          if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Could not cancel."); return; }
          router.refresh();
        }}
      >
        {busy ? "…" : "Cancel"}
      </button>
      {err && <span className="check-pill red" style={{ marginLeft: 4 }}>{err}</span>}
    </>
  );
}
