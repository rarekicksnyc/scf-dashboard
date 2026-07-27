"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NumberInput from "../NumberInput";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import { mm } from "@/lib/format";

interface Sig { id: string; entityId?: string; name: string; title: string; signingLimit?: number }
interface Ent { id: string; name: string }

// Authorized signatories for a seller — group-wide or scoped to a specific seller
// entity. Used by the executed-document signature check in the Transaction Flow.
export default function SignatoryManager({ sellerId, sellerName, entities, signatories, canEdit }: {
  sellerId: string; sellerName: string; entities: Ent[]; signatories: Sig[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", title: "", entityId: "", signingLimit: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const entName = (id?: string) => (id ? entities.find((e) => e.id === id)?.name ?? id : "Group-wide");

  async function add() {
    if (!f.name.trim() || !f.title.trim()) { setMsg({ ok: false, text: "Name and title are required." }); return; }
    setBusy(true); setMsg(null);
    const res = await fetch("/api/signatories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sellerId, name: f.name, title: f.title, entityId: f.entityId || undefined, signingLimit: f.signingLimit || undefined }),
    });
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Failed." }); return; }
    const added = f.name.trim();
    setF({ name: "", title: "", entityId: "", signingLimit: "" });
    setMsg({ ok: true, text: `Added ${added}.` });
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove authorized signatory "${name}"? They will no longer clear the signature check.`)) return;
    setBusy(true);
    const res = await fetch("/api/signatories", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="panel">
      <h2>Authorized signatories — {sellerName}</h2>
      <div style={{ padding: 14 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: "90ch" }}>
          The people authorized to sign for this seller. When an executed document is uploaded in the
          Transaction Flow, the named signer is matched against this list — anyone not on it is flagged for
          review. A signatory can be group-wide or scoped to one seller entity.
        </p>
        {msg && (
          <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13, ...(msg.ok ? { background: "#e8f5ec", color: "var(--green)", border: "1px solid var(--green)" } : { background: "#fdecea", color: "var(--red)", border: "1px solid var(--red)" }) }}>{msg.text}</div>
        )}

        {canEdit && (
          <div onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); add(); } }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, alignItems: "end", marginBottom: 12 }}>
            <label style={field}>Name<input style={input} value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Jane Smith" /></label>
            <label style={field}>Title<input style={input} value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="e.g. CFO" /></label>
            <label style={field}>Scope
              <select style={input} value={f.entityId} onChange={(e) => setF((s) => ({ ...s, entityId: e.target.value }))}>
                <option value="">Group-wide</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label style={field}>Signing limit (USD, optional)<NumberInput style={input} value={f.signingLimit} onValue={(v) => setF((s) => ({ ...s, signingLimit: v }))} ariaLabel="Signing limit" /></label>
            <button className="btn" type="button" disabled={busy} onClick={add}>Add signatory</button>
          </div>
        )}

        <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Title</th><th>Scope</th><th className="num">Signing limit</th>{canEdit && <th>&nbsp;</th>}</tr></thead>
            <tbody>
              {signatories.length === 0 ? (
                <tr><td colSpan={canEdit ? 5 : 4} className="muted" style={{ padding: 12 }}>No authorized signatories on file yet.</td></tr>
              ) : signatories.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.title}</td>
                  <td>{s.entityId ? entName(s.entityId) : <span className="muted">Group-wide</span>}</td>
                  <td className="num">{s.signingLimit != null ? mm(s.signingLimit) : "—"}</td>
                  {canEdit && <td><button className="btn secondary" style={{ padding: "3px 10px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} type="button" disabled={busy} onClick={() => remove(s.id, s.name)}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
