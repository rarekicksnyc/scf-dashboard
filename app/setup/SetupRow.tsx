"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SetupRowProps {
  entityType: "SELLER" | "OBLIGOR";
  entityId: string;
  name: string;
  cdl: string;
  limitId?: string;
  limitAmount: number;
  swinglineEnabled: boolean;
  swinglineAmount: number;
}

const inputStyle = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
};

export default function SetupRow(props: SetupRowProps) {
  const router = useRouter();
  const [cdl, setCdl] = useState(props.cdl);
  const [limitAmount, setLimitAmount] = useState(String(props.limitAmount));
  const [swlOn, setSwlOn] = useState(props.swinglineEnabled);
  const [swlAmt, setSwlAmt] = useState(String(props.swinglineAmount || 5_000_000));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function dirty() {
    return (
      cdl !== props.cdl ||
      Number(limitAmount) !== props.limitAmount ||
      swlOn !== props.swinglineEnabled ||
      (swlOn && Number(swlAmt) !== props.swinglineAmount)
    );
  }

  async function save() {
    if (!dirty()) {
      setMsg("No changes made");
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    setBusy(true);
    setMsg(null);
    await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityType: props.entityType,
        entityId: props.entityId,
        cdl,
        limitId: props.limitId,
        limitAmount: Number(limitAmount),
        swinglineEnabled: swlOn,
        swinglineAmount: Number(swlAmt),
      }),
    });
    setBusy(false);
    setMsg("Changes saved ✓");
    setTimeout(() => setMsg(null), 2000);
    router.refresh();
  }

  return (
    <tr>
      <td>{props.name}</td>
      <td style={{ width: 180 }}>
        <input style={inputStyle} value={cdl} onChange={(e) => setCdl(e.target.value)} />
      </td>
      <td style={{ width: 240 }}>
        <input
          style={inputStyle}
          type="number"
          value={limitAmount}
          onChange={(e) => setLimitAmount(e.target.value)}
        />
      </td>
      <td style={{ width: 110 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={swlOn} onChange={(e) => setSwlOn(e.target.checked)} />
          {swlOn ? "On" : "Off"}
        </label>
      </td>
      <td style={{ width: 240 }}>
        <input
          style={{ ...inputStyle, opacity: swlOn ? 1 : 0.5 }}
          type="number"
          value={swlAmt}
          disabled={!swlOn}
          onChange={(e) => setSwlAmt(e.target.value)}
        />
      </td>
      <td>
        <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} onClick={save} disabled={busy} type="button">
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>{msg}</span>}
      </td>
    </tr>
  );
}
