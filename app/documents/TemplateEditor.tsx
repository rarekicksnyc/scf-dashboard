"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import type { DocTemplate, DocTemplateType } from "@/lib/types";

interface Opt { id: string; name: string }

const TYPE_LABEL: Record<DocTemplateType, string> = {
  PURCHASE_REQUEST: "Purchase Request (DTR, signed)",
  COMMITMENT_REQUEST: "Commitment Request (UTRC, signed)",
  CLIENT_EMAIL: "Client email (execution request)",
  BOOKING_EMAIL: "Booking / funding team email",
};
const TYPES: DocTemplateType[] = ["PURCHASE_REQUEST", "COMMITMENT_REQUEST", "CLIENT_EMAIL", "BOOKING_EMAIL"];

const TOKENS = "seller · obligor · reference · currency · invoice_amount · advance_rate · coverage · committed_amount · value_date · maturity_date · commitment_due_date · final_demand_date · pricing_bps · product_type · primary_amount · document_name · today";

// Edit the document/email templates that feed Word/Excel/email generation.
// Sorted by doc type; edit the default or a per-seller override. Gated to PM & Admin.
export default function TemplateEditor({ templates, sellers, canEdit }: { templates: DocTemplate[]; sellers: Opt[]; canEdit: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<DocTemplateType>("PURCHASE_REQUEST");
  const [sellerId, setSellerId] = useState(""); // "" = default
  const isEmail = type === "CLIENT_EMAIL" || type === "BOOKING_EMAIL";

  // The effective template for the current (type, seller) selection.
  const effective = useMemo(() => {
    const override = sellerId ? templates.find((t) => t.type === type && t.sellerId === sellerId) : undefined;
    const def = templates.find((t) => t.type === type && !t.sellerId);
    return override ?? def;
  }, [templates, type, sellerId]);
  const overrideExists = Boolean(sellerId && templates.find((t) => t.type === type && t.sellerId === sellerId));

  const [body, setBody] = useState(effective?.body ?? "");
  const [subject, setSubject] = useState(effective?.subject ?? "");
  const [loadedKey, setLoadedKey] = useState(`${type}|${sellerId}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Reload the textarea when the selection changes.
  const key = `${type}|${sellerId}`;
  if (key !== loadedKey) {
    setLoadedKey(key);
    setBody(effective?.body ?? "");
    setSubject(effective?.subject ?? "");
    setMsg(null);
  }

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/doc-templates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, sellerId: sellerId || undefined, subject: isEmail ? subject : undefined, body }),
    });
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Failed." }); return; }
    setMsg({ ok: true, text: sellerId ? "Seller override saved." : "Default template saved." });
    router.refresh();
  }

  async function removeOverride() {
    const t = templates.find((x) => x.type === type && x.sellerId === sellerId);
    if (!t || !confirm("Remove this seller override and fall back to the default?")) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/doc-templates", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: t.id }) });
    setBusy(false);
    if (res.ok) { router.refresh(); }
  }

  return (
    <div className="panel">
      <h2>Document &amp; email templates</h2>
      <div style={{ padding: 14 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: "90ch" }}>
          These feed the Word doc, Excel, and email generation in the Transaction Flow. Edit the default, or
          save a per-seller override that only applies to that seller. Use {"{{placeholders}}"} for the fields
          that change each transaction.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <label style={field}>Template
            <select style={input} value={type} onChange={(e) => setType(e.target.value as DocTemplateType)}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label style={field}>Applies to
            <select style={input} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
              <option value="">Default (all sellers)</option>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}{templates.some((t) => t.type === type && t.sellerId === s.id) ? " ✎" : ""}</option>)}
            </select>
          </label>
        </div>

        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 10 }}>{msg.text}</div>}
        {sellerId && !overrideExists && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>No override yet — this shows the default; saving creates a {sellers.find((s) => s.id === sellerId)?.name} override.</div>}

        {isEmail && (
          <label style={{ ...field, display: "block", marginBottom: 10 }}>Subject
            <input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} />
          </label>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={!canEdit}
          style={{ width: "100%", minHeight: 320, boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5, lineHeight: 1.55 }}
        />
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Tokens: {TOKENS}</div>

        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : sellerId ? "Save seller override" : "Save default"}</button>
            {overrideExists && <button className="btn secondary" type="button" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={removeOverride}>Remove override</button>}
          </div>
        )}
      </div>
    </div>
  );
}
