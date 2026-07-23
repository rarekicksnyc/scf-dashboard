"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LimitView } from "@/lib/types";
import { mm, pct } from "@/lib/format";
import { inputBase as cell } from "@/lib/ui";
import { UtilBar } from "../components";

export default function EditLimitRow({
  view,
  entityName,
  canEdit,
}: {
  view: LimitView;
  entityName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [cdl, setCdl] = useState(view.limit.cdl);
  const [approved, setApproved] = useState(String(view.approvedLimit));
  const [tenor, setTenor] = useState(String(view.limit.maxTenorDays));
  const [expiry, setExpiry] = useState(view.limit.expiryDate);
  const [status, setStatus] = useState(view.limit.status);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setSaved(false);
    setErr(null);
    const res = await fetch(`/api/limits/${view.limit.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cdl,
        approvedLimit: Number(approved),
        maxTenorDays: Number(tenor),
        expiryDate: expiry,
        status,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json()).error ?? "Failed");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete limit ${view.limit.id} (${entityName})? This removes the line entirely.`)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/limits/${view.limit.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    router.refresh();
  }

  if (!canEdit) {
    return (
      <tr>
        <td>{view.limit.id}</td>
        <td>{entityName}</td>
        <td><code style={{ fontSize: 12 }}>{view.limit.cdl || "—"}</code></td>
        <td className="num">{mm(view.approvedLimit)}</td>
        <td className="num">{mm(view.outstanding)}</td>
        <td className="num">{mm(view.reserved)}</td>
        <td className="num">{mm(view.available)}</td>
        <td className="num">{pct(view.utilizationPct)}</td>
        <td><UtilBar view={view} /></td>
        <td className="num">{view.limit.maxTenorDays}d</td>
        <td>{view.limit.expiryDate}</td>
        <td><span className={`badge ${view.limit.status === "ACTIVE" ? "green" : "grey"}`}>{view.limit.status}</span></td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{view.limit.id}</td>
      <td>{entityName}</td>
      <td>
        <input style={{ ...cell, minWidth: 120 }} value={cdl} onChange={(e) => setCdl(e.target.value)} placeholder="8-digit" title={err ?? undefined} />
      </td>
      <td><input style={{ ...cell, minWidth: 160 }} type="number" value={approved} onChange={(e) => setApproved(e.target.value)} /></td>
      <td className="num">{mm(view.outstanding)}</td>
      <td className="num">{mm(view.reserved)}</td>
      <td className="num">{mm(view.available)}</td>
      <td className="num">{pct(view.utilizationPct)}</td>
      <td><UtilBar view={view} /></td>
      <td><input style={{ ...cell, minWidth: 90 }} type="number" value={tenor} onChange={(e) => setTenor(e.target.value)} /></td>
      <td><input style={{ ...cell, minWidth: 150 }} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></td>
      <td>
        <select style={{ ...cell, minWidth: 120 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="EXPIRED">EXPIRED</option>
        </select>
      </td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={save} disabled={busy} type="button">
            {busy ? "…" : saved ? "Saved ✓" : "Save"}
          </button>
          <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} onClick={remove} disabled={busy} type="button">
            Delete
          </button>
        </div>
        {err && <div className="check-pill red" style={{ marginTop: 3 }}>{err}</div>}
      </td>
    </tr>
  );
}
