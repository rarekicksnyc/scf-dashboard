"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import { mm, dateShort } from "@/lib/format";
import type { ParentCompanyGuarantee } from "@/lib/types";

interface Opt { id: string; name: string }

const cell = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" as const };

function name(list: Opt[], id?: string) {
  if (!id) return "—";
  return list.find((o) => o.id === id)?.name ?? id;
}

export default function PcgRegister({
  pcgs,
  sellers,
  obligors,
  canEdit,
}: {
  pcgs: ParentCompanyGuarantee[];
  sellers: Opt[];
  obligors: Opt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const blank = { parentName: "", sellerId: "", obligorId: "", coveredObligorId: "", continuing: false, expiryDate: "", limitAmount: "" };
  const [add, setAdd] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setA = <K extends keyof typeof add>(k: K, v: (typeof add)[K]) => setAdd((s) => ({ ...s, [k]: v }));

  async function create() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/pcg", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parentName: add.parentName,
        sellerId: add.sellerId || undefined,
        obligorId: add.obligorId || undefined,
        coveredObligorId: add.coveredObligorId || undefined,
        continuing: add.continuing,
        expiryDate: add.continuing ? undefined : add.expiryDate,
        limitAmount: add.limitAmount === "" ? undefined : Number(add.limitAmount),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Could not add guarantee." });
      return;
    }
    setAdd(blank);
    setMsg({ ok: true, text: "Guarantee added." });
    router.refresh();
  }

  return (
    <div className="panel">
      <h2>Parent Company Guarantees ({pcgs.length})</h2>
      <div style={{ padding: 14 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: "90ch" }}>
          A parent company guarantee (PCG) can support a seller and/or an obligor. Set an expiry date, or mark it a
          continuing unconditional guarantee (indefinite — no expiry). Non-continuing PCGs appear in the Expirations tab.
        </p>

        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

        {canEdit && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, alignItems: "end", marginBottom: 14, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "#fafbfd" }}>
            <label style={field}>Parent company name
              <input style={input} value={add.parentName} onChange={(e) => setA("parentName", e.target.value)} placeholder="e.g. Meridian Holdings Plc" />
            </label>
            <label style={field}>Associated seller
              <select style={input} value={add.sellerId} onChange={(e) => setA("sellerId", e.target.value)}>
                <option value="">— none —</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={field}>Associated obligor
              <select style={input} value={add.obligorId} onChange={(e) => setA("obligorId", e.target.value)}>
                <option value="">— none —</option>
                {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label style={field}>Obligor covered
              <select style={input} value={add.coveredObligorId} onChange={(e) => setA("coveredObligorId", e.target.value)}>
                <option value="">— none —</option>
                {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label style={field}>Guarantee limit (USD)
              <input style={input} type="number" value={add.limitAmount} onChange={(e) => setA("limitAmount", e.target.value)} placeholder="optional" />
            </label>
            <label style={field}>Expiry date
              <input style={input} type="date" value={add.expiryDate} disabled={add.continuing} onChange={(e) => setA("expiryDate", e.target.value)} />
            </label>
            <label style={{ ...field, flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 8 }}>
              <input type="checkbox" checked={add.continuing} onChange={(e) => setA("continuing", e.target.checked)} />
              Continuing unconditional (indefinite)
            </label>
            <button className="btn" type="button" disabled={busy || !add.parentName} onClick={create}>
              {busy ? "Adding…" : "Add guarantee"}
            </button>
          </div>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Parent company</th>
                <th>Seller</th>
                <th>Obligor</th>
                <th>Obligor covered</th>
                <th className="num">Limit</th>
                <th>Expiry</th>
                {canEdit && <th>&nbsp;</th>}
              </tr>
            </thead>
            <tbody>
              {pcgs.length === 0 ? (
                <tr><td colSpan={canEdit ? 7 : 6} className="muted" style={{ padding: 14 }}>No parent company guarantees on file.</td></tr>
              ) : (
                pcgs.map((p) => (
                  <PcgRow key={p.id} pcg={p} sellers={sellers} obligors={obligors} canEdit={canEdit} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PcgRow({ pcg, sellers, obligors, canEdit }: { pcg: ParentCompanyGuarantee; sellers: Opt[]; obligors: Opt[]; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    parentName: pcg.parentName,
    sellerId: pcg.sellerId ?? "",
    obligorId: pcg.obligorId ?? "",
    coveredObligorId: pcg.coveredObligorId ?? "",
    continuing: pcg.continuing,
    expiryDate: pcg.expiryDate ?? "",
    limitAmount: pcg.limitAmount != null ? String(pcg.limitAmount) : "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    const res = await fetch("/api/pcg", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: pcg.id,
        parentName: f.parentName,
        sellerId: f.sellerId || undefined,
        obligorId: f.obligorId || undefined,
        coveredObligorId: f.coveredObligorId || undefined,
        continuing: f.continuing,
        expiryDate: f.continuing ? undefined : f.expiryDate,
        limitAmount: f.limitAmount === "" ? undefined : Number(f.limitAmount),
      }),
    });
    setBusy(false);
    if (res.ok) { setEdit(false); router.refresh(); }
  }

  async function remove() {
    if (!confirm(`Remove the parent company guarantee from ${pcg.parentName}?`)) return;
    setBusy(true);
    const res = await fetch("/api/pcg", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: pcg.id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (!edit) {
    return (
      <tr>
        <td style={{ fontWeight: 600 }}>{pcg.parentName}</td>
        <td>{name(sellers, pcg.sellerId)}</td>
        <td>{name(obligors, pcg.obligorId)}</td>
        <td>{name(obligors, pcg.coveredObligorId)}</td>
        <td className="num">{pcg.limitAmount != null ? mm(pcg.limitAmount) : "—"}</td>
        <td>
          {pcg.continuing
            ? <span className="badge green">Continuing unconditional</span>
            : (pcg.expiryDate ? dateShort(pcg.expiryDate) : "—")}
        </td>
        {canEdit && (
          <td>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} type="button" onClick={() => setEdit(true)}>Edit</button>
              <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} type="button" disabled={busy} onClick={remove}>Delete</button>
            </div>
          </td>
        )}
      </tr>
    );
  }

  return (
    <tr>
      <td><input style={cell} value={f.parentName} onChange={(e) => set("parentName", e.target.value)} /></td>
      <td>
        <select style={cell} value={f.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
          <option value="">— none —</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td>
        <select style={cell} value={f.obligorId} onChange={(e) => set("obligorId", e.target.value)}>
          <option value="">— none —</option>
          {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </td>
      <td>
        <select style={cell} value={f.coveredObligorId} onChange={(e) => set("coveredObligorId", e.target.value)}>
          <option value="">— none —</option>
          {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </td>
      <td><input style={cell} type="number" value={f.limitAmount} onChange={(e) => set("limitAmount", e.target.value)} /></td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input style={cell} type="date" value={f.expiryDate} disabled={f.continuing} onChange={(e) => set("expiryDate", e.target.value)} />
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <input type="checkbox" checked={f.continuing} onChange={(e) => set("continuing", e.target.checked)} />
            continuing (indefinite)
          </label>
        </div>
      </td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} type="button" disabled={busy} onClick={save}>{busy ? "…" : "Save"}</button>
          <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} type="button" onClick={() => setEdit(false)}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}
