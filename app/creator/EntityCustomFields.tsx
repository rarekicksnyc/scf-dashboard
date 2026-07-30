"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import type { CustomFieldDef, CustomFieldEntity } from "@/lib/types";

// Renders the custom fields defined for an entity type (Creator Mode) on that
// entity's page, with inline editing for anyone who can change data. Generic —
// one component drives every custom field, so definitions and display never drift.
export default function EntityCustomFields({
  entityType, entityId, defs, values, canEdit,
}: { entityType: CustomFieldEntity; entityId: string; defs: CustomFieldDef[]; values: Record<string, string>; canEdit: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(values);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (defs.length === 0) return null;
  const set = (k: string, v: string) => { setSaved(false); setVals((s) => ({ ...s, [k]: v })); };

  async function save() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/creator", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "fieldValues", entityType, entityId, values: vals }) });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Save failed."); return; }
    setSaved(true); router.refresh();
  }

  return (
    <div className="panel">
      <h2>Custom fields</h2>
      <div style={{ padding: 16, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {defs.map((f) => (
          <label key={f.id} style={field}>{f.label}
            {!canEdit ? (
              <div style={{ padding: "6px 2px", fontSize: 14 }}>{vals[f.key] || <span className="muted">—</span>}</div>
            ) : f.type === "select" ? (
              <select style={input} value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            ) : f.type === "boolean" ? (
              <select style={input} value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option><option value="Yes">Yes</option><option value="No">No</option></select>
            ) : (
              <input style={input} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </label>
        ))}
      </div>
      {canEdit && (
        <div style={{ padding: "0 16px 14px", display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : saved ? "Saved" : "Save custom fields"}</button>
          {err && <span className="notice err">{err}</span>}
        </div>
      )}
    </div>
  );
}
