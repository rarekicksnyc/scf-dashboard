"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import type { CustomFieldDef, CustomRegister, KpiTile, WatchRule, CustomFieldType, KpiFormat, WatchScope, WatchSeverity } from "@/lib/types";
import type { KpiResult, WatchResult } from "@/lib/creator/run";

interface FieldSpec { key: string; label: string }
type WithRev<T> = T & { rev: number };

interface Props {
  fields: WithRev<CustomFieldDef>[];
  registers: WithRev<CustomRegister>[];
  kpis: { tile: WithRev<KpiTile>; result: KpiResult }[];
  rules: { rule: WithRev<WatchRule>; result: WatchResult }[];
  catalog: { kpi: FieldSpec[]; DEAL: FieldSpec[]; SELLER: FieldSpec[]; OBLIGOR: FieldSpec[] };
}

async function api(method: "POST" | "PATCH" | "DELETE", body: object): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/creator", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return { ok: true };
  const j = await res.json().catch(() => ({}));
  return { ok: false, error: j.error ?? "Request failed." };
}

const TABS = ["Custom fields", "Registers", "KPI tiles", "Watch rules"] as const;

export default function CreatorConsole(props: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Custom fields");
  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tab ${tab === t ? "on" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "Custom fields" && <FieldsPanel fields={props.fields} />}
      {tab === "Registers" && <RegistersPanel registers={props.registers} />}
      {tab === "KPI tiles" && <KpisPanel kpis={props.kpis} catalog={props.catalog.kpi} />}
      {tab === "Watch rules" && <WatchPanel rules={props.rules} catalog={props.catalog} />}
    </>
  );
}

function Err({ msg }: { msg?: string | null }) { return msg ? <div className="notice err" style={{ marginTop: 8 }}>{msg}</div> : null; }

// --- Custom fields ---------------------------------------------------------
function FieldsPanel({ fields }: { fields: WithRev<CustomFieldDef>[] }) {
  const router = useRouter();
  const [entityType, setEntityType] = useState<"SELLER" | "OBLIGOR">("SELLER");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setErr(null);
    const r = await api("POST", { resource: "field", entityType, key: key.trim(), label: label.trim(), type, options: type === "select" ? options.split(",").map((s) => s.trim()).filter(Boolean) : undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error!); return; }
    setKey(""); setLabel(""); setOptions(""); router.refresh();
  }
  async function del(id: string) { if (!confirm("Remove this field? Existing values stay stored but stop showing.")) return; await api("DELETE", { resource: "field", id }); router.refresh(); }

  return (
    <div className="panel">
      <h2>Custom fields</h2>
      <div style={{ padding: 16 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Add an attribute to a seller or obligor. It appears on that entity&rsquo;s page for anyone with edit rights. Purely additive — it changes no calculation.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={field}>On<select style={input} value={entityType} onChange={(e) => setEntityType(e.target.value as "SELLER" | "OBLIGOR")}><option value="SELLER">Seller</option><option value="OBLIGOR">Obligor</option></select></label>
          <label style={field}>Key<input style={input} value={key} onChange={(e) => setKey(e.target.value)} placeholder="kyc_tier" /></label>
          <label style={field}>Label<input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="KYC tier" /></label>
          <label style={field}>Type<select style={input} value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Select</option><option value="boolean">Yes/No</option></select></label>
          {type === "select" && <label style={{ ...field, flex: 1, minWidth: 200 }}>Options (comma-separated)<input style={input} value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Low, Medium, High" /></label>}
          <button className="btn" type="button" disabled={busy || !key.trim()} onClick={create}>Add field</button>
        </div>
        <Err msg={err} />
        <div className="table-scroll" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Entity</th><th>Key</th><th>Label</th><th>Type</th><th>Options</th><th></th></tr></thead>
            <tbody>
              {fields.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>No custom fields yet.</td></tr> :
                fields.map((f) => (
                  <tr key={f.id}>
                    <td>{f.entityType === "SELLER" ? "Seller" : "Obligor"}</td>
                    <td><code style={{ fontSize: 12 }}>{f.key}</code></td>
                    <td>{f.label}</td>
                    <td>{f.type}</td>
                    <td className="muted">{f.options?.join(", ") ?? "—"}</td>
                    <td><button className="btn secondary" style={{ padding: "4px 9px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} type="button" onClick={() => del(f.id)}>Remove</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Registers -------------------------------------------------------------
function RegistersPanel({ registers }: { registers: WithRev<CustomRegister>[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cols, setCols] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    const columns = cols.split(",").map((s) => s.trim()).filter(Boolean);
    const r = await api("POST", { resource: "register", name: name.trim(), columns });
    if (!r.ok) { setErr(r.error!); return; }
    setName(""); setCols(""); router.refresh();
  }

  return (
    <div className="panel">
      <h2>Custom registers</h2>
      <div style={{ padding: 16 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>A reference list you maintain by hand — like the country register. Define the columns, then add and edit rows.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={field}>Name<input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Approved auditors" /></label>
          <label style={{ ...field, flex: 1, minWidth: 240 }}>Columns (comma-separated)<input style={input} value={cols} onChange={(e) => setCols(e.target.value)} placeholder="Firm, Country, Approved until" /></label>
          <button className="btn" type="button" disabled={!name.trim() || !cols.trim()} onClick={create}>Create register</button>
        </div>
        <Err msg={err} />
        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          {registers.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No registers yet.</div> : registers.map((r) => <RegisterEditor key={r.id} reg={r} />)}
        </div>
      </div>
    </div>
  );
}

function RegisterEditor({ reg }: { reg: WithRev<CustomRegister> }) {
  const router = useRouter();
  const [rows, setRows] = useState<string[][]>(reg.rows.map((r) => [...r]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const setCell = (ri: number, ci: number, v: string) => { setSaved(false); setRows((rs) => rs.map((row, i) => i === ri ? row.map((c, j) => (j === ci ? v : c)) : row)); };
  const addRow = () => { setSaved(false); setRows((rs) => [...rs, reg.columns.map(() => "")]); };
  const delRow = (ri: number) => { setSaved(false); setRows((rs) => rs.filter((_, i) => i !== ri)); };

  async function save() {
    setBusy(true); setErr(null);
    const r = await api("PATCH", { resource: "register", id: reg.id, rows, rev: reg.rev });
    setBusy(false);
    if (!r.ok) { setErr(r.error!); return; }
    setSaved(true); router.refresh();
  }
  async function del() { if (!confirm(`Delete register "${reg.name}"?`)) return; await api("DELETE", { resource: "register", id: reg.id }); router.refresh(); }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <strong>{reg.name}</strong>
        <button className="btn secondary" style={{ marginLeft: "auto", padding: "4px 9px", fontSize: 12 }} type="button" onClick={addRow}>+ Row</button>
        <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : saved ? "Saved" : "Save rows"}</button>
        <button className="btn secondary" style={{ padding: "4px 9px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} type="button" onClick={del}>Delete</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr>{reg.columns.map((c) => <th key={c}>{c}</th>)}<th></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={reg.columns.length + 1} className="muted" style={{ padding: 10 }}>No rows — add one.</td></tr> :
              rows.map((row, ri) => (
                <tr key={ri}>
                  {reg.columns.map((_, ci) => <td key={ci}><input style={{ ...input, minWidth: 120 }} value={row[ci] ?? ""} onChange={(e) => setCell(ri, ci, e.target.value)} /></td>)}
                  <td><button className="btn secondary" style={{ padding: "3px 8px", fontSize: 12 }} type="button" onClick={() => delRow(ri)}>✕</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Err msg={err} />
    </div>
  );
}

// --- KPI tiles -------------------------------------------------------------
function KpisPanel({ kpis, catalog }: { kpis: { tile: WithRev<KpiTile>; result: KpiResult }[]; catalog: FieldSpec[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [formula, setFormula] = useState("");
  const [format, setFormat] = useState<KpiFormat>("currency");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setErr(null);
    const r = await api("POST", { resource: "kpi", label: label.trim(), formula: formula.trim(), format });
    setBusy(false);
    if (!r.ok) { setErr(r.error!); return; }
    setLabel(""); setFormula(""); router.refresh();
  }
  async function del(id: string) { if (!confirm("Delete this KPI tile?")) return; await api("DELETE", { resource: "kpi", id }); router.refresh(); }

  return (
    <div className="panel">
      <h2>KPI tiles</h2>
      <div style={{ padding: 16 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>A figure computed from a safe formula over book-level totals. Read-only. Percent multiplies the result by 100.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={field}>Label<input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Skim share" /></label>
          <label style={{ ...field, flex: 1, minWidth: 260 }}>Formula<input style={input} value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="investor_skim / total_revenue" /></label>
          <label style={field}>Format<select style={input} value={format} onChange={(e) => setFormat(e.target.value as KpiFormat)}><option value="currency">Currency</option><option value="number">Number</option><option value="percent">Percent</option><option value="bps">Bps</option></select></label>
          <button className="btn" type="button" disabled={busy || !label.trim() || !formula.trim()} onClick={create}>Add tile</button>
        </div>
        <FieldChips fields={catalog} onPick={(k) => setFormula((f) => (f ? `${f} ${k}` : k))} />
        <Err msg={err} />
        <div className="cards" style={{ marginTop: 14 }}>
          {kpis.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No KPI tiles yet.</div> : kpis.map(({ tile, result }) => (
            <div className="card" key={tile.id}>
              <div className="label">{tile.label}</div>
              <div className="value small" style={result.error ? { color: "var(--red)", fontSize: 14 } : undefined}>{result.error ? "Error" : result.formatted}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}><code>{tile.formula}</code></div>
              {result.error && <div className="muted" style={{ fontSize: 11, color: "var(--red)" }}>{result.error}</div>}
              <button className="btn secondary" style={{ padding: "3px 8px", fontSize: 11, marginTop: 6 }} type="button" onClick={() => del(tile.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Watch rules -----------------------------------------------------------
function WatchPanel({ rules, catalog }: { rules: { rule: WithRev<WatchRule>; result: WatchResult }[]; catalog: Props["catalog"] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<WatchScope>("DEAL");
  const [expression, setExpression] = useState("");
  const [severity, setSeverity] = useState<WatchSeverity>("WARN");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function create() {
    setBusy(true); setErr(null);
    const r = await api("POST", { resource: "watchRule", label: label.trim(), scope, expression: expression.trim(), severity, message: message.trim() || undefined, enabled: true });
    setBusy(false);
    if (!r.ok) { setErr(r.error!); return; }
    setLabel(""); setExpression(""); setMessage(""); router.refresh();
  }
  async function toggle(rule: WithRev<WatchRule>) { await api("PATCH", { resource: "watchRule", id: rule.id, enabled: !rule.enabled, rev: rule.rev }); router.refresh(); }
  async function del(id: string) { if (!confirm("Delete this watch rule?")) return; await api("DELETE", { resource: "watchRule", id }); router.refresh(); }

  const scopeFields = scope === "DEAL" ? catalog.DEAL : scope === "SELLER" ? catalog.SELLER : catalog.OBLIGOR;

  return (
    <div className="panel">
      <h2>Watch rules <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· advisory only</span></h2>
      <div style={{ padding: 16 }}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Flag any deal, seller, or obligor that matches a condition. Advisory — these surface a watch list and never block a booking or change a control.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={field}>Label<input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Large uninsured non-recourse" /></label>
          <label style={field}>Over<select style={input} value={scope} onChange={(e) => setScope(e.target.value as WatchScope)}><option value="DEAL">Each deal</option><option value="SELLER">Each seller</option><option value="OBLIGOR">Each obligor</option></select></label>
          <label style={{ ...field, flex: 1, minWidth: 260 }}>Condition<input style={input} value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="uninsured_residual > 3000000" /></label>
          <label style={field}>Severity<select style={input} value={severity} onChange={(e) => setSeverity(e.target.value as WatchSeverity)}><option value="WARN">Warn</option><option value="INFO">Info</option></select></label>
          <button className="btn" type="button" disabled={busy || !label.trim() || !expression.trim()} onClick={create}>Add rule</button>
        </div>
        <label style={{ ...field, marginTop: 8 }}>Message (optional)<input style={{ ...input, maxWidth: 480 }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escalate to credit for review" /></label>
        <FieldChips fields={scopeFields} onPick={(k) => setExpression((f) => (f ? `${f} ${k}` : k))} />
        <Err msg={err} />
        <div className="table-scroll" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Rule</th><th>Over</th><th>Severity</th><th className="num">Matches</th><th>Enabled</th><th></th></tr></thead>
            <tbody>
              {rules.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>No watch rules yet.</td></tr> :
                rules.map(({ rule, result }) => (
                  <Fragment key={rule.id}>
                    <tr>
                      <td><strong>{rule.label}</strong><div className="muted" style={{ fontSize: 11 }}><code>{rule.expression}</code></div></td>
                      <td>{rule.scope === "DEAL" ? "Deals" : rule.scope === "SELLER" ? "Sellers" : "Obligors"}</td>
                      <td><span className={`badge ${rule.severity === "WARN" ? "orange" : "grey"}`}>{rule.severity}</span></td>
                      <td className="num">
                        {result.error ? <span className="badge red">Error</span> :
                          result.matches.length > 0 ? <button type="button" style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontWeight: 700 }} onClick={() => setOpen(open === rule.id ? null : rule.id)}>{result.matches.length}</button> : "0"}
                      </td>
                      <td><button type="button" className="btn secondary" style={{ padding: "3px 9px", fontSize: 12 }} onClick={() => toggle(rule)}>{rule.enabled ? "On" : "Off"}</button></td>
                      <td><button className="btn secondary" style={{ padding: "3px 8px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} type="button" onClick={() => del(rule.id)}>Remove</button></td>
                    </tr>
                    {open === rule.id && !result.error && (
                      <tr><td colSpan={6} style={{ background: "var(--bg)" }}>
                        <div style={{ padding: "6px 10px", fontSize: 12 }} className="muted">
                          {rule.message && <div style={{ marginBottom: 4 }}>{rule.message}</div>}
                          {result.matches.map((m) => <div key={m.id}>↳ {m.label}</div>)}
                        </div>
                      </td></tr>
                    )}
                    {result.error && <tr><td colSpan={6} className="muted" style={{ fontSize: 12, color: "var(--red)", paddingLeft: 14 }}>{result.error}</td></tr>}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FieldChips({ fields, onPick }: { fields: FieldSpec[]; onPick: (key: string) => void }) {
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
      <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>Fields:</span>
      {fields.map((f) => (
        <button key={f.key} type="button" title={f.label} onClick={() => onPick(f.key)} style={{ fontSize: 11, padding: "2px 7px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", cursor: "pointer" }}>
          <code>{f.key}</code>
        </button>
      ))}
    </div>
  );
}
