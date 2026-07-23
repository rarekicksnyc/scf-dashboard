"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mm } from "@/lib/format";

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
}) {
  const router = useRouter();
  const [sub, setSub] = useState(String(approvedLimit));
  const [tenor, setTenor] = useState(String(maxTenorDays));
  const [expiry, setExpiry] = useState(groupExpiry);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    // Sublimit amount/tenor and the obligor-group expiry are separate records.
    const [subRes, grpRes] = await Promise.all([
      fetch("/api/asr-sublimit", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sellerId, obligorId: group.id, approvedLimit: Number(sub), maxTenorDays: Number(tenor) }),
      }),
      expiry !== groupExpiry
        ? fetch(`/api/obligors/${group.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expiryDate: expiry }),
          })
        : Promise.resolve(null),
    ]);
    setBusy(false);
    if (!subRes.ok || (grpRes && !grpRes.ok)) {
      setMsg("Failed");
      return;
    }
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
        {canEdit ? <input style={inp} type="number" value={sub} onChange={(e) => setSub(e.target.value)} /> : mm(approvedLimit)}
      </td>
      <td className="num" style={{ minWidth: canEdit ? 100 : undefined }}>
        {canEdit ? <input style={inp} type="number" value={tenor} onChange={(e) => setTenor(e.target.value)} /> : `${maxTenorDays}d`}
      </td>
      <td style={{ minWidth: canEdit ? 150 : undefined }}>
        {canEdit
          ? <input style={{ ...inp, textAlign: "left" }} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          : (groupExpiry || "—")}
      </td>
      <td className="muted">{groupSwingline}</td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/data?seller=${sellerId}&group=${group.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
            view entities →
          </Link>
          {canEdit && (
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={save} disabled={busy} type="button">
              {busy ? "…" : "Save"}
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
