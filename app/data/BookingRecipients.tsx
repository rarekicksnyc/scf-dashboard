"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input } from "@/lib/ui";

// Desk-wide booking / funding-team distribution list — one or more addresses,
// pre-filled as the To on every booking-team email draft. Edited by PM & Admin.
export default function BookingRecipients({ value, canEdit }: { value: string; canEdit: boolean }) {
  const router = useRouter();
  const [emails, setEmails] = useState(value);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null); setSaved(false);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingTeamEmails: emails }) });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
    setSaved(true); router.refresh();
  }

  return (
    <div style={{ padding: 14, display: "grid", gap: 8, maxWidth: 640 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        The booking / funding team that receives every booking-instruction email. Separate multiple addresses with commas.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          style={{ ...input, flex: 1, minWidth: 260 }}
          value={emails}
          onChange={(e) => { setEmails(e.target.value); setSaved(false); }}
          onKeyDown={(e) => { if (e.key === "Enter" && canEdit && emails !== value) { e.preventDefault(); save(); } }}
          placeholder="funding-desk@mufg.com, ops@mufg.com"
          disabled={!canEdit}
        />
        {canEdit && <button className="btn" style={{ fontSize: 12 }} type="button" disabled={busy || emails === value} onClick={save}>{busy ? "Saving…" : "Save"}</button>}
        {saved && <span className="badge green">Saved</span>}
      </div>
      {err && <div style={{ color: "var(--red)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}
