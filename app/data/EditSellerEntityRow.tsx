"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Country { code: string; name: string }

const inp = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" as const };

export default function EditSellerEntityRow({
  entity,
  countries,
  canEdit,
}: {
  entity: { id: string; name: string; cdl: string; domicile: string };
  countries: Country[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(entity.name);
  const [cdl, setCdl] = useState(entity.cdl);
  const [domicile, setDomicile] = useState(entity.domicile);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <tr>
        <td>{entity.name}</td>
        <td><code style={{ fontSize: 12 }}>{entity.cdl}</code></td>
        <td className="muted">{entity.domicile}</td>
      </tr>
    );
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/entities/seller/${entity.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, cdl, domicile }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg((await res.json()).error ?? "Failed");
      return;
    }
    setMsg("Saved ✓");
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove eligible seller entity "${entity.name}"?`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/entities/seller/${entity.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    router.refresh();
  }

  const opts = countries.some((c) => c.code === domicile) ? countries : [{ code: domicile, name: domicile }, ...countries];

  return (
    <tr>
      <td style={{ minWidth: 200 }}><input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></td>
      <td style={{ minWidth: 120 }}><input style={inp} value={cdl} onChange={(e) => setCdl(e.target.value)} placeholder="8-digit" /></td>
      <td style={{ minWidth: 150 }}>
        <select style={inp} value={domicile} onChange={(e) => setDomicile(e.target.value)}>
          {opts.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </td>
      <td>
        <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={save} disabled={busy} type="button">
          {busy ? "…" : "Save"}
        </button>
        <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12, marginLeft: 6, borderColor: "var(--red)", color: "var(--red)" }} onClick={remove} disabled={busy} type="button">
          Delete
        </button>
        {msg && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>{msg}</span>}
      </td>
    </tr>
  );
}
