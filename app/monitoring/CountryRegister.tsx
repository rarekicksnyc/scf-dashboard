"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import type { Country } from "@/lib/types";

export default function CountryRegister({ countries, canEdit }: { countries: Country[]; canEdit: boolean }) {
  const router = useRouter();
  const [hideIneligible, setHideIneligible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [add, setAdd] = useState({ code: "", name: "", eligible: false });

  async function toggle(code: string, eligible: boolean) {
    setBusy(code);
    setMsg(null);
    await fetch("/api/countries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, eligible }),
    });
    router.refresh();
    setBusy(null);
  }

  async function remove(code: string, name: string) {
    if (!confirm(`Remove ${name} (${code}) from the register? This cannot be done while any entity is domiciled there.`)) return;
    setBusy(code);
    setMsg(null);
    const res = await fetch("/api/countries", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Could not remove country." });
      return;
    }
    router.refresh();
  }

  async function create() {
    setBusy("__add__");
    setMsg(null);
    const res = await fetch("/api/countries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: add.code, name: add.name, eligible: add.eligible }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Could not add country." });
      return;
    }
    setAdd({ code: "", name: "", eligible: false });
    setMsg({ ok: true, text: `Added ${data.country?.name ?? add.name}.` });
    router.refresh();
  }

  const shown = hideIneligible ? countries.filter((c) => c.eligible) : countries;
  const eligibleCount = countries.filter((c) => c.eligible).length;

  return (
    <div className="panel">
      <h2>Country enforceability register ({eligibleCount} eligible)</h2>

      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} style={{ margin: "12px 14px 0" }}>{msg.text}</div>}

      {canEdit && (
        <div style={{ padding: "12px 14px 0", display: "grid", gridTemplateColumns: "110px 1fr auto auto", gap: 10, alignItems: "end" }}>
          <label style={field}>ISO code
            <input style={input} value={add.code} maxLength={2} placeholder="e.g. BR"
              onChange={(e) => setAdd((s) => ({ ...s, code: e.target.value.toUpperCase() }))} />
          </label>
          <label style={field}>Country name
            <input style={input} value={add.name} placeholder="e.g. Brazil"
              onChange={(e) => setAdd((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 8 }}>
            <input type="checkbox" checked={add.eligible} onChange={(e) => setAdd((s) => ({ ...s, eligible: e.target.checked }))} />
            Eligible
          </label>
          <button className="btn" type="button" style={{ marginBottom: 2 }} disabled={busy === "__add__" || !add.code || !add.name} onClick={create}>
            {busy === "__add__" ? "Adding…" : "Add country"}
          </button>
        </div>
      )}

      <div style={{ padding: "10px 14px 0", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Only eligible countries (enforceability opinion on file) may be selected as an entity domicile.
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={hideIneligible} onChange={(e) => setHideIneligible(e.target.checked)} />
          Hide ineligible
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Country</th>
              <th>Enforceability</th>
              {canEdit && <th>&nbsp;</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.code}>
                <td><code style={{ fontSize: 12 }}>{c.code}</code></td>
                <td>{c.name}</td>
                <td>
                  <span className={`badge ${c.eligible ? "green" : "grey"}`}>
                    {c.eligible ? "Eligible" : "Not eligible"}
                  </span>
                </td>
                {canEdit && (
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn secondary"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={busy === c.code}
                      type="button"
                      onClick={() => toggle(c.code, !c.eligible)}
                    >
                      {busy === c.code ? "…" : c.eligible ? "Mark ineligible" : "Mark eligible"}
                    </button>
                    <button
                      className="btn secondary"
                      style={{ padding: "4px 10px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }}
                      disabled={busy === c.code}
                      type="button"
                      onClick={() => remove(c.code, c.name)}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
