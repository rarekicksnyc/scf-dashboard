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
  padding: "5px 7px",
  fontSize: 12,
  width: "100%",
};

export default function SetupRow(props: SetupRowProps) {
  const router = useRouter();
  const [cdl, setCdl] = useState(props.cdl);
  const [limitAmount, setLimitAmount] = useState(String(props.limitAmount));
  const [swlOn, setSwlOn] = useState(props.swinglineEnabled);
  const [swlAmt, setSwlAmt] = useState(String(props.swinglineAmount || 5_000_000));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
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
    setSaved(true);
    router.refresh();
  }

  return (
    <tr>
      <td>{props.name}</td>
      <td style={{ width: 150 }}>
        <input style={inputStyle} value={cdl} onChange={(e) => setCdl(e.target.value)} />
      </td>
      <td style={{ width: 200 }}>
        <input
          style={inputStyle}
          type="number"
          value={limitAmount}
          onChange={(e) => setLimitAmount(e.target.value)}
        />
      </td>
      <td style={{ width: 90 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={swlOn} onChange={(e) => setSwlOn(e.target.checked)} />
          {swlOn ? "On" : "Off"}
        </label>
      </td>
      <td style={{ width: 200 }}>
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
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </td>
    </tr>
  );
}
