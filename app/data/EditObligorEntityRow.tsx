"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mm, dateShort } from "@/lib/format";

interface Country { code: string; name: string }
interface Policy { id: string; name: string }

export interface ObligorEntityData {
  id: string;
  name: string;
  cdl: string;
  bookingCdl: string;
  domicile: string;
  borrowerRating: string;
  borrowerRatingExpiry: string;
  insurancePolicyId?: string;
  insuranceExpiry?: string;
  insurerName?: string;
  pcg?: "Y" | "N" | "N/A";
  pcgExpiry?: string;
  pcgLimit?: number;
}

const inp = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" as const };
const stack = { display: "flex", flexDirection: "column" as const, gap: 4 };

export default function EditObligorEntityRow({
  entity,
  countries,
  policies,
  canEdit,
}: {
  entity: ObligorEntityData;
  countries: Country[];
  policies: Policy[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    name: entity.name,
    cdl: entity.cdl,
    bookingCdl: entity.bookingCdl,
    domicile: entity.domicile,
    borrowerRating: entity.borrowerRating,
    borrowerRatingExpiry: entity.borrowerRatingExpiry ?? "",
    insurancePolicyId: entity.insurancePolicyId ?? "",
    insuranceExpiry: entity.insuranceExpiry ?? "",
    pcg: entity.pcg ?? "N/A",
    pcgExpiry: entity.pcgExpiry ?? "",
    pcgLimit: entity.pcgLimit != null ? String(entity.pcgLimit) : "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  if (!canEdit) {
    return (
      <tr>
        <td>{entity.name}</td>
        <td><code style={{ fontSize: 12 }}>{entity.cdl}</code></td>
        <td><code style={{ fontSize: 12 }}>{entity.bookingCdl}</code></td>
        <td className="muted">{entity.domicile}</td>
        <td>{entity.borrowerRating} <span className="muted">exp {dateShort(entity.borrowerRatingExpiry)}</span></td>
        <td className="muted">{entity.insurancePolicyId ? `${entity.insurerName ?? "policy"} exp ${dateShort(entity.insuranceExpiry ?? "")}` : "—"}</td>
        <td>{entity.pcg ?? "N/A"}{entity.pcg === "Y" && entity.pcgLimit ? ` · ${mm(entity.pcgLimit)} exp ${dateShort(entity.pcgExpiry ?? "")}` : ""}</td>
      </tr>
    );
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/entities/obligor/${entity.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.name,
        cdl: f.cdl,
        bookingCdl: f.bookingCdl,
        domicile: f.domicile,
        borrowerRating: f.borrowerRating,
        borrowerRatingExpiry: f.borrowerRatingExpiry,
        insurancePolicyId: f.insurancePolicyId,
        insuranceExpiry: f.insuranceExpiry,
        pcg: f.pcg,
        pcgExpiry: f.pcgExpiry,
        pcgLimit: f.pcgLimit === "" ? undefined : Number(f.pcgLimit),
      }),
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
    if (!confirm(`Remove eligible obligor entity "${entity.name}"?`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/entities/obligor/${entity.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    router.refresh();
  }

  const domOpts = countries.some((c) => c.code === f.domicile) ? countries : [{ code: f.domicile, name: f.domicile }, ...countries];

  return (
    <tr>
      <td style={{ minWidth: 190 }}><input style={inp} value={f.name} onChange={(e) => set("name", e.target.value)} /></td>
      <td style={{ minWidth: 120 }}><input style={inp} value={f.cdl} onChange={(e) => set("cdl", e.target.value)} placeholder="8-digit" /></td>
      <td style={{ minWidth: 120 }}><input style={inp} value={f.bookingCdl} onChange={(e) => set("bookingCdl", e.target.value)} placeholder="8-digit" /></td>
      <td style={{ minWidth: 150 }}>
        <select style={inp} value={f.domicile} onChange={(e) => set("domicile", e.target.value)}>
          {domOpts.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </td>
      <td style={{ minWidth: 150 }}>
        <div style={stack}>
          <input style={inp} value={f.borrowerRating} onChange={(e) => set("borrowerRating", e.target.value)} placeholder="rating" />
          <input style={inp} type="date" value={f.borrowerRatingExpiry} onChange={(e) => set("borrowerRatingExpiry", e.target.value)} />
        </div>
      </td>
      <td style={{ minWidth: 190 }}>
        <div style={stack}>
          <select style={inp} value={f.insurancePolicyId} onChange={(e) => set("insurancePolicyId", e.target.value)}>
            <option value="">— none —</option>
            {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {f.insurancePolicyId && <input style={inp} type="date" value={f.insuranceExpiry} onChange={(e) => set("insuranceExpiry", e.target.value)} />}
        </div>
      </td>
      <td style={{ minWidth: 160 }}>
        <div style={stack}>
          <select style={inp} value={f.pcg} onChange={(e) => set("pcg", e.target.value as typeof f.pcg)}>
            <option value="Y">Y</option>
            <option value="N">N</option>
            <option value="N/A">N/A</option>
          </select>
          {f.pcg === "Y" && (
            <>
              <input style={inp} type="number" value={f.pcgLimit} onChange={(e) => set("pcgLimit", e.target.value)} placeholder="PCG limit (USD)" />
              <input style={inp} type="date" value={f.pcgExpiry} onChange={(e) => set("pcgExpiry", e.target.value)} />
            </>
          )}
        </div>
      </td>
      <td>
        <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={save} disabled={busy} type="button">
          {busy ? "…" : "Save"}
        </button>
        <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12, marginTop: 4, borderColor: "var(--red)", color: "var(--red)" }} onClick={remove} disabled={busy} type="button">
          Delete
        </button>
        {msg && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{msg}</div>}
      </td>
    </tr>
  );
}
