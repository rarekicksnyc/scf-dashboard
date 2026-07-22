"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Country } from "@/lib/types";

export default function CountryRegister({ countries, canEdit }: { countries: Country[]; canEdit: boolean }) {
  const router = useRouter();
  const [hideIneligible, setHideIneligible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(code: string, eligible: boolean) {
    setBusy(code);
    await fetch("/api/countries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, eligible }),
    });
    router.refresh();
    setBusy(null);
  }

  const shown = hideIneligible ? countries.filter((c) => c.eligible) : countries;
  const eligibleCount = countries.filter((c) => c.eligible).length;

  return (
    <div className="panel">
      <h2>Country enforceability register ({eligibleCount} eligible)</h2>
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
                  <td>
                    <button
                      className="btn secondary"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={busy === c.code}
                      type="button"
                      onClick={() => toggle(c.code, !c.eligible)}
                    >
                      {busy === c.code ? "…" : c.eligible ? "Mark ineligible" : "Mark eligible"}
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
