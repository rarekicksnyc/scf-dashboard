"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as cell } from "@/lib/ui";
import { usd } from "@/lib/format";
import NumberInput from "../NumberInput";

export interface PolicyRow {
  id: string;
  insurerName: string;
  policyNumber: string;
  coveragePercent: number;
  minimumPremium: number;
  rev: number;
}

// Set each policy's annual minimum premium (insurer-rate side) in-app. A shortfall
// vs. usage becomes the seller's year-end top-up, tracked on Revenue. Gated to
// Change limit; saves are conflict-guarded (the row carries the version it loaded).
export default function InsurancePolicies({ policies, canEdit }: { policies: PolicyRow[]; canEdit: boolean }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Insurer</th>
            <th>Policy</th>
            <th className="num">Coverage</th>
            <th className="num">Minimum premium (annual)</th>
            {canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {policies.length === 0 ? (
            <tr><td colSpan={canEdit ? 5 : 4} className="muted" style={{ padding: 16 }}>No active insurance policies.</td></tr>
          ) : policies.map((p) => <Row key={p.id} p={p} canEdit={canEdit} />)}
        </tbody>
      </table>
    </div>
  );
}

function Row({ p, canEdit }: { p: PolicyRow; canEdit: boolean }) {
  const router = useRouter();
  const [min, setMin] = useState(String(p.minimumPremium));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = Number(min) !== p.minimumPremium;

  async function save() {
    setBusy(true); setSaved(false); setErr(null);
    const res = await fetch(`/api/insurance-policies/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minimumPremium: Number(min), rev: p.rev }),
    });
    setBusy(false);
    if (res.status === 409) { setErr("Changed by another user — reload and re-apply."); return; }
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Save failed."); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{p.insurerName}</td>
      <td><code style={{ fontSize: 12 }}>{p.policyNumber}</code></td>
      <td className="num">{Math.round(p.coveragePercent * 100)}%</td>
      <td className="num">
        {canEdit ? (
          <NumberInput style={{ ...cell, maxWidth: 160, textAlign: "right" }} value={min} ariaLabel={`Minimum premium ${p.insurerName}`} onValue={setMin} />
        ) : (
          usd(p.minimumPremium)
        )}
      </td>
      {canEdit && (
        <td>
          <button className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }} type="button" disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
          </button>
          {err && <div className="notice err" style={{ marginTop: 4, fontSize: 12 }}>{err}</div>}
        </td>
      )}
    </tr>
  );
}
