"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn secondary"
      style={{ padding: "4px 10px", fontSize: 12 }}
      disabled={busy}
      type="button"
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/reservations/${id}`, { method: "DELETE" });
        router.refresh();
        setBusy(false);
      }}
    >
      Cancel
    </button>
  );
}
