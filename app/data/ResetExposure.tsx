"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Danger zone: clear every booked and reserved exposure so all limits return to
// full availability. Limits, sellers, and obligors are untouched. Two-step
// confirm so it cannot be triggered by an accidental click.
export default function ResetExposure() {
  const router = useRouter();
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reset() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/reset-exposure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json();
    setBusy(false);
    setArm(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Reset failed." });
      return;
    }
    const c = data.cleared ?? {};
    setMsg({ ok: true, text: `Reset complete — cleared ${c.utilizations ?? 0} booked, ${c.reservations ?? 0} reserved, ${c.batches ?? 0} batch(es). Every limit is at full availability.` });
    router.refresh();
  }

  return (
    <div className="panel" style={{ borderColor: "var(--red)" }}>
      <h2 style={{ color: "var(--red)" }}>Reset exposure to full availability</h2>
      <div style={{ padding: 18 }}>
        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
        <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: "80ch" }}>
          Clears all current booked exposure, the entire forward reservation book,
          and past batch runs, so every seller, obligor, swingline, and RRL limit
          returns to its full approved amount. Limits, sellers, obligors, and their
          configuration are not touched. Use this to start a clean cycle — booking
          works normally from here.
        </p>
        {!arm ? (
          <button className="btn secondary" style={{ borderColor: "var(--red)", color: "var(--red)" }} type="button" onClick={() => setArm(true)}>
            Reset exposure…
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>This clears all booked and reserved exposure. Continue?</span>
            <button className="btn" style={{ background: "var(--red)" }} type="button" onClick={reset} disabled={busy}>
              {busy ? "Resetting…" : "Yes, reset everything"}
            </button>
            <button className="btn secondary" type="button" onClick={() => setArm(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
