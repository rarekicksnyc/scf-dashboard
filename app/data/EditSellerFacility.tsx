"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";
import { mm, dateShort } from "@/lib/format";

export interface SellerFacilityData {
  id: string;
  name: string;
  asrRating: string;
  asrExpiry: string;
  borrowerRating: string;
  borrowerRatingExpiry: string;
  gcarsNumber: string;
  guarantor: string;
  minPricingBps: number;
  rrlEnabled: boolean;
  status: string;
  contactEmail: string;
}

// One limit-backed line (seller line / swingline / RRL / RRL swingline). The
// amount and expiry are editable inline here and PATCH the same limit record the
// limit register edits (single source), with the same edit-conflict guard. An
// absent line (id undefined) shows a note instead ("none" / "N/A").
export interface FacilityLimitLine {
  key: string; // display label
  id?: string; // limit id (undefined = not configured)
  approvedLimit?: number;
  expiryDate?: string;
  rev?: number;
  note?: string; // shown when absent
}

export default function EditSellerFacility({
  seller,
  limits,
  canEdit,
  rev,
}: {
  seller: SellerFacilityData;
  limits: FacilityLimitLine[];
  canEdit: boolean;
  rev?: number;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    name: seller.name,
    asrRating: seller.asrRating,
    asrExpiry: seller.asrExpiry ?? "",
    borrowerRating: seller.borrowerRating,
    borrowerRatingExpiry: seller.borrowerRatingExpiry ?? "",
    gcarsNumber: seller.gcarsNumber ?? "",
    guarantor: seller.guarantor ?? "",
    minPricingBps: String(seller.minPricingBps ?? 0),
    rrlEnabled: seller.rrlEnabled,
    status: seller.status,
    contactEmail: seller.contactEmail ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/sellers/${seller.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.name,
        asrRating: f.asrRating,
        asrExpiry: f.asrExpiry,
        borrowerRating: f.borrowerRating,
        borrowerRatingExpiry: f.borrowerRatingExpiry,
        gcarsNumber: f.gcarsNumber,
        guarantor: f.guarantor,
        minPricingBps: Number(f.minPricingBps),
        rrlEnabled: f.rrlEnabled,
        status: f.status,
        contactEmail: f.contactEmail,
        rev, // edit-conflict guard: the version this facility was loaded at
      }),
    });
    setBusy(false);
    if (res.status === 409) {
      setMsg({ ok: false, text: "Another user changed this facility since you opened it. Refresh to load the latest, then re-apply your change." });
      return;
    }
    if (!res.ok) {
      setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Failed to save." });
      return;
    }
    setMsg({ ok: true, text: "Saved ✓" });
    router.refresh();
  }

  const ro = (label: string, value: string) => (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );

  const lineDisplay = (l: FacilityLimitLine) => (l.id ? `${mm(l.approvedLimit ?? 0)} (exp ${dateShort(l.expiryDate ?? "")})` : (l.note ?? "N/A"));

  if (!canEdit) {
    return (
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, fontSize: 13 }}>
        {limits.map((l) => <div key={l.key}>{ro(l.key, lineDisplay(l))}</div>)}
        {ro("ASR rating", `${seller.asrRating} (exp ${seller.asrExpiry || "—"})`)}
        {ro("Borrower rating", `${seller.borrowerRating} (exp ${seller.borrowerRatingExpiry || "—"})`)}
        {ro("GCARS #", seller.gcarsNumber || "—")}
      </div>
    );
  }

  return (
    <div style={{ padding: 14 }}>
      {msg && <div className={`notice ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <label style={field}>Seller name
          <input style={input} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label style={field}>ASR rating
          <input style={input} value={f.asrRating} onChange={(e) => set("asrRating", e.target.value)} />
        </label>
        <label style={field}>ASR rating expiry
          <input style={input} type="date" value={f.asrExpiry} onChange={(e) => set("asrExpiry", e.target.value)} />
        </label>
        <label style={field}>Borrower rating
          <input style={input} value={f.borrowerRating} onChange={(e) => set("borrowerRating", e.target.value)} />
        </label>
        <label style={field}>Borrower rating expiry
          <input style={input} type="date" value={f.borrowerRatingExpiry} onChange={(e) => set("borrowerRatingExpiry", e.target.value)} />
        </label>
        <label style={field}>GCARS #
          <input style={input} value={f.gcarsNumber} onChange={(e) => set("gcarsNumber", e.target.value)} />
        </label>
        <label style={field}>Guarantor
          <input style={input} value={f.guarantor} onChange={(e) => set("guarantor", e.target.value)} placeholder="None" />
        </label>
        <label style={field}>Client contact email(s)
          <input style={input} value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="one or more, separated by commas" />
        </label>
        <label style={field}>Min pricing (bps)
          <input style={input} type="number" value={f.minPricingBps} onChange={(e) => set("minPricingBps", e.target.value)} />
        </label>
        <label style={field}>Status
          <select style={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
        </label>
        <label style={{ ...field, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={f.rrlEnabled} onChange={(e) => set("rrlEnabled", e.target.checked)} />
          RRL enabled
        </label>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Credit lines — amount &amp; expiry</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
          {limits.map((l) => <LimitLineEdit key={l.key} line={l} />)}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          These edit the same limit records as the limit register below (single source). Add a new line in &ldquo;Add to register.&rdquo;
        </div>
      </div>

      <button className="btn" style={{ marginTop: 14 }} onClick={save} disabled={busy} type="button">
        {busy ? "Saving…" : "Save facility details"}
      </button>
    </div>
  );
}

// Inline edit of one credit line's amount + expiry — PATCHes the same limit
// record (and edit-conflict guard) as the limit register. An absent line shows a
// note instead of inputs.
function LimitLineEdit({ line }: { line: FacilityLimitLine }) {
  const router = useRouter();
  const [amount, setAmount] = useState(line.approvedLimit != null ? String(line.approvedLimit) : "");
  const [expiry, setExpiry] = useState(line.expiryDate ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = line.id != null && (Number(amount) !== line.approvedLimit || expiry !== (line.expiryDate ?? ""));

  async function save() {
    if (!line.id) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/limits/${line.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvedLimit: Number(amount), expiryDate: expiry, rev: line.rev }),
    });
    setBusy(false);
    if (res.status === 409) { setMsg({ ok: false, text: "Changed by another user — refresh." }); return; }
    if (!res.ok) { setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Failed." }); return; }
    setMsg({ ok: true, text: "Saved ✓" });
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" }}>{line.key}</span>
      {line.id ? (
        <>
          <input style={{ ...input, fontSize: 13 }} value={amount} inputMode="numeric" placeholder="amount (USD)" onChange={(e) => setAmount(e.target.value)} />
          <input style={{ ...input, fontSize: 13 }} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn secondary" style={{ padding: "3px 10px", fontSize: 12 }} type="button" disabled={busy || !dirty} onClick={save}>{busy ? "…" : "Save"}</button>
            {amount && <span className="muted" style={{ fontSize: 11 }}>{mm(Number(amount) || 0)}</span>}
            {msg && <span style={{ fontSize: 11, color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
          </div>
        </>
      ) : (
        <span className="muted" style={{ fontSize: 13 }}>{line.note ?? "N/A"}</span>
      )}
    </div>
  );
}
