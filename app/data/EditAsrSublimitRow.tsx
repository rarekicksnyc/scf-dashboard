"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mm } from "@/lib/format";
import NumberInput from "../NumberInput";

const inp = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" as const, textAlign: "right" as const };

export default function EditAsrSublimitRow({
  sellerId,
  group,
  globalLimit,
  groupExpiry,
  groupSwingline,
  approvedLimit,
  maxTenorDays,
  selected,
  canEdit,
  subRev,
  groupRev,
}: {
  sellerId: string;
  group: { id: string; name: string };
  globalLimit: string;
  groupExpiry: string;
  groupSwingline: string;
  approvedLimit: number;
  maxTenorDays: number;
  selected: boolean;
  canEdit: boolean;
  subRev?: number;
  groupRev?: number;
}) {
  const router = useRouter();
  const [sub, setSub] = useState(String(approvedLimit));
  const [tenor, setTenor] = useState(String(maxTenorDays));
  const [expiry, setExpiry] = useState(groupExpiry);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // A change to a live sublimit's amount/tenor is staged for a second approver and
  // needs a GCARS reference (the expiry edit is a separate obligor-group record).
  const amountOrTenorChanged = Number(sub) !== approvedLimit || Number(tenor) !== maxTenorDays;

  async function save() {
    if (amountOrTenorChanged && !reference.trim()) {
      setMsg("A GCARS reference is required — the change is staged for a second approver.");
      return;
    }
    setBusy(true);
    setMsg(null);
    // Sublimit amount/tenor and the obligor-group expiry are separate records.
    const [subRes, grpRes] = await Promise.all([
      fetch("/api/asr-sublimit", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellerId, obligorId: group.id, approvedLimit: Number(sub), maxTenorDays: Number(tenor), reference: reference.trim(), rev: subRev }),
      }),
      expiry !== groupExpiry
        ? fetch(`/api/obligors/${group.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expiryDate: expiry, rev: groupRev }),
          })
        : Promise.resolve(null),
    ]);
    setBusy(false);
    if (subRes.status === 409 || (grpRes && grpRes.status === 409)) {
      setMsg("Changed by another user — refresh and re-apply.");
      return;
    }
    if (!subRes.ok || (grpRes && !grpRes.ok)) {
      setMsg((await subRes.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    const body = await subRes.json().catch(() => ({}));
    if (body.pending) { setMsg("Staged for approval ✓"); setReference(""); router.refresh(); return; }
    setMsg("Saved ✓");
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${group.name} from this seller's ASR approved list?`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/asr-sublimit", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sellerId, obligorId: group.id }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <tr style={{ background: selected ? "var(--brand-soft)" : undefined }}>
      <td>{group.name}</td>
      <td className="num">{globalLimit}</td>
      <td className="num" style={{ minWidth: canEdit ? 150 : undefined }}>
        {canEdit ? <NumberInput style={inp} value={sub} onValue={setSub} ariaLabel="ASR sublimit" /> : mm(approvedLimit)}
      </td>
      <td className="num" style={{ minWidth: canEdit ? 100 : undefined }}>
        {canEdit ? <input style={inp} type="number" value={tenor} onChange={(e) => setTenor(e.target.value)} /> : `${maxTenorDays}d`}
      </td>
      <td style={{ minWidth: canEdit ? 150 : undefined }}>
        {canEdit
          ? <input style={{ ...inp, textAlign: "left" }} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          : (groupExpiry || "—")}
      </td>
      <td className="num" style={{ fontWeight: groupSwingline === "none" ? 400 : 600 }}>
        {groupSwingline === "none" ? <span className="muted">none</span> : groupSwingline}
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/data?seller=${sellerId}&group=${group.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
            view entities →
          </Link>
          {canEdit && amountOrTenorChanged && (
            <input
              style={{ ...inp, width: 150, textAlign: "left" }}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="GCARS ref (staged)"
              aria-label="GCARS reference"
            />
          )}
          {canEdit && (
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={save} disabled={busy} type="button">
              {busy ? "…" : amountOrTenorChanged ? "Request change" : "Save"}
            </button>
          )}
          {canEdit && (
            <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} onClick={remove} disabled={busy} type="button">
              Delete
            </button>
          )}
          {msg && <span className="muted" style={{ fontSize: 11 }}>{msg}</span>}
        </div>
      </td>
    </tr>
  );
}
