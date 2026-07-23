"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";

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
}

// Read-only summary strings for the limit-backed lines (amounts + their expiries
// are edited in the limit register below — single source).
export interface FacilityLimits {
  sellerLine: string;
  swingline: string;
  rrl: string;
  rrlSwingline: string;
}

export default function EditSellerFacility({
  seller,
  limits,
  canEdit,
}: {
  seller: SellerFacilityData;
  limits: FacilityLimits;
  canEdit: boolean;
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
      }),
    });
    setBusy(false);
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

  if (!canEdit) {
    return (
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, fontSize: 13 }}>
        {ro("Seller line", limits.sellerLine)}
        {ro("ASR rating", `${seller.asrRating} (exp ${seller.asrExpiry || "—"})`)}
        {ro("Swingline", limits.swingline)}
        {ro("RRL", limits.rrl)}
        {ro("RRL swingline", limits.rrlSwingline)}
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

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, fontSize: 13, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        {ro("Seller line", limits.sellerLine)}
        {ro("Swingline", limits.swingline)}
        {ro("RRL", limits.rrl)}
        {ro("RRL swingline", limits.rrlSwingline)}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        Line amounts and their expiry dates are edited in the limit register below (single source).
      </div>

      <button className="btn" style={{ marginTop: 14 }} onClick={save} disabled={busy} type="button">
        {busy ? "Saving…" : "Save facility details"}
      </button>
    </div>
  );
}
