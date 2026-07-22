"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LimitType } from "@/lib/types";

interface Opt {
  id: string;
  name: string;
  cdl?: string;
}
type Mode = "LIMIT" | "SELLER" | "OBLIGOR" | "ASR_SUBLIMIT" | "BULK";

const input = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
};
const field = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12 };

const LIMIT_TYPES: LimitType[] = [
  "SELLER",
  "ASR",
  "OBLIGOR",
  "SWINGLINE",
  "RRL_SWINGLINE",
  "RRL",
  "INVESTOR",
  "INSURANCE",
];

export default function AddToRegistry({
  sellers,
  obligors,
  investors,
  policies,
}: {
  sellers: Opt[];
  obligors: Opt[];
  investors: Opt[];
  policies: Opt[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("SELLER");
  const [limitType, setLimitType] = useState<LimitType>("ASR");
  const [f, setF] = useState({
    entityId: "",
    name: "",
    cdl: "",
    country: "US",
    sellerId: sellers[0]?.id ?? "",
    obligorId: obligors[0]?.id ?? "",
    approvedLimit: "25000000",
    maxTenorDays: "150",
    expiryDate: "2026-12-31",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function bulkUpload(file: File) {
    setBusy(true);
    setBulkMsg(null);
    const isXlsx = /\.xlsx?$/i.test(file.name) && !file.name.toLowerCase().endsWith(".csv");
    let body: Record<string, string>;
    if (isXlsx) {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      body = { fileBase64: btoa(bin) };
    } else {
      body = { csv: await file.text() };
    }
    const res = await fetch("/api/registry/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setBulkMsg({ ok: false, text: data.error ?? "Upload failed." });
      return;
    }
    const errNote = data.errors?.length ? ` ${data.errors.length} row(s) had errors: ${data.errors.slice(0, 3).map((e: { row: number; error: string }) => `row ${e.row} (${e.error})`).join("; ")}${data.errors.length > 3 ? "…" : ""}` : "";
    setBulkMsg({ ok: data.errors?.length === 0, text: `Added ${data.added} record(s).${errNote}` });
    router.refresh();
  }

  // Which entities are valid for the chosen limit type, with their entityType.
  const entityOptions = useMemo(() => {
    const S = (o: Opt) => ({ ...o, entityType: "SELLER" as const });
    const O = (o: Opt) => ({ ...o, entityType: "OBLIGOR" as const });
    switch (limitType) {
      case "SELLER":
      case "ASR":
        return sellers.map(S);
      case "OBLIGOR":
        return obligors.map(O);
      case "SWINGLINE":
        return [...sellers.map(S), ...obligors.map(O)];
      case "INVESTOR":
        return investors.map((o) => ({ ...o, entityType: "INVESTOR" as const }));
      case "INSURANCE":
        return policies.map((o) => ({ ...o, entityType: "INSURER_POLICY" as const }));
      default:
        return [];
    }
  }, [limitType, sellers, obligors, investors, policies]);

  // In New-limit mode, prefill the CDL from the selected entity (sellers and
  // obligors carry one; investor/insurance lines need a fresh CDL input).
  useEffect(() => {
    if (mode !== "LIMIT") return;
    const first = entityOptions[0];
    setF((s) => ({ ...s, entityId: first?.id ?? "", cdl: first?.cdl ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, limitType]);

  async function submit() {
    setBusy(true);
    setMsg(null);
    let body: Record<string, unknown> = { kind: mode };
    if (mode === "LIMIT") {
      const ent = entityOptions.find((e) => e.id === f.entityId) ?? entityOptions[0];
      if (!ent) {
        setMsg({ ok: false, text: "No entity available for this limit type." });
        setBusy(false);
        return;
      }
      body = {
        kind: "LIMIT",
        type: limitType,
        cdl: f.cdl,
        entityType: ent.entityType,
        entityId: ent.id,
        approvedLimit: Number(f.approvedLimit),
        maxTenorDays: Number(f.maxTenorDays),
        expiryDate: f.expiryDate,
      };
    } else if (mode === "SELLER" || mode === "OBLIGOR") {
      body = {
        kind: mode,
        name: f.name,
        cdl: f.cdl,
        country: f.country,
        approvedLimit: Number(f.approvedLimit),
        maxTenorDays: Number(f.maxTenorDays),
        expiryDate: f.expiryDate,
      };
    } else {
      body = {
        kind: "ASR_SUBLIMIT",
        sellerId: f.sellerId,
        obligorId: f.obligorId,
        approvedLimit: Number(f.approvedLimit),
        maxTenorDays: Number(f.maxTenorDays),
      };
    }
    const res = await fetch("/api/registry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Failed." });
      return;
    }
    setMsg({ ok: true, text: "Added to the register." });
    router.refresh();
  }

  const amountLabel =
    mode === "SELLER"
      ? "Credit limit (USD)"
      : mode === "OBLIGOR"
        ? "Master limit (USD)"
        : mode === "ASR_SUBLIMIT"
          ? "Sublimit (USD)"
          : "Approved limit (USD)";

  return (
    <div className="panel">
      <h2>Add to register</h2>
      <div style={{ padding: 18 }}>
        {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>What would you like to add?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              ["SELLER", "New seller"],
              ["OBLIGOR", "New obligor"],
              ["LIMIT", "New limit"],
              ["ASR_SUBLIMIT", "ASR sublimit"],
              ["BULK", "Bulk upload (Excel)"],
            ] as [Mode, string][]).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: mode === m ? "2px solid var(--brand)" : "1px solid var(--border)",
                  background: mode === m ? "var(--brand-soft)" : "#fff",
                  color: mode === m ? "var(--brand)" : "var(--ink)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "BULK" && (
          <div>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Add many records at once. Download the template, fill in one row per seller, obligor, or
              limit (record_type = SELLER / OBLIGOR / LIMIT), and re-upload. Only the immediate fields
              are needed — the rest can be filled in per-seller afterwards.
            </p>
            {bulkMsg && <div className={`notice ${bulkMsg.ok ? "ok" : "err"}`} style={{ marginBottom: 12 }}>{bulkMsg.text}</div>}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <a className="btn secondary" href="/api/registry/template">Download template</a>
              <label className="btn" style={{ cursor: "pointer" }}>
                {busy ? "Uploading…" : "Upload filled template"}
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} disabled={busy}
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) bulkUpload(file); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        )}

        {mode !== "BULK" && (
        <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {mode === "LIMIT" && (
            <>
              <label style={field}>Limit type
                <select style={input} value={limitType} onChange={(e) => setLimitType(e.target.value as LimitType)}>
                  {LIMIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={field}>Entity
                <select
                  style={input}
                  value={f.entityId}
                  onChange={(e) => {
                    const opt = entityOptions.find((o) => o.id === e.target.value);
                    setF((s) => ({ ...s, entityId: e.target.value, cdl: opt?.cdl ?? s.cdl }));
                  }}
                >
                  {entityOptions.map((e) => (
                    <option key={`${e.entityType}-${e.id}`} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label style={field}>CDL (8-digit)
                <input style={input} value={f.cdl} onChange={(e) => set("cdl", e.target.value)} placeholder="e.g. 10048201" />
              </label>
            </>
          )}

          {(mode === "SELLER" || mode === "OBLIGOR") && (
            <>
              <label style={field}>{mode === "SELLER" ? "New seller name" : "New obligor name"}
                <input style={input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={mode === "SELLER" ? "e.g. Acme Components Inc" : "e.g. Global Buyer Co"} />
              </label>
              <label style={field}>CDL (8-digit)
                <input style={input} value={f.cdl} onChange={(e) => set("cdl", e.target.value)} placeholder="e.g. 10048201" />
              </label>
              {mode === "OBLIGOR" && (
                <label style={field}>Country
                  <input style={input} value={f.country} onChange={(e) => set("country", e.target.value)} />
                </label>
              )}
            </>
          )}

          {mode === "ASR_SUBLIMIT" && (
            <>
              <label style={field}>Seller
                <select style={input} value={f.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
                  {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={field}>Obligor
                <select style={input} value={f.obligorId} onChange={(e) => set("obligorId", e.target.value)}>
                  {obligors.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
            </>
          )}

          <label style={field}>{amountLabel}
            <input style={input} type="number" value={f.approvedLimit} onChange={(e) => set("approvedLimit", e.target.value)} />
          </label>
          <label style={field}>Max tenor (days)
            <input style={input} type="number" value={f.maxTenorDays} onChange={(e) => set("maxTenorDays", e.target.value)} />
          </label>
          {mode !== "ASR_SUBLIMIT" && (
            <label style={field}>Expiry date
              <input style={input} type="date" value={f.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
            </label>
          )}
        </div>

        <button className="btn" style={{ marginTop: 14 }} onClick={submit} disabled={busy} type="button">
          {busy ? "Adding…" : "Add to register"}
        </button>
        </>
        )}
      </div>
    </div>
  );
}
