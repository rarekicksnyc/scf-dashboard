"use client";

import { useState } from "react";
import { inputBase as input, fieldLabel as field } from "@/lib/ui";

// Interpolate short-tenor SOFR between the 1-day and 30-day points. Used for
// investor deals (the investor takes the interpolated SOFR + margin − skim).
export default function SofrInterpolator({ one, thirty }: { one?: number; thirty?: number }) {
  const [tenor, setTenor] = useState("15");
  const have = one != null && thirty != null;
  const t = Math.max(1, Math.min(30, Number(tenor) || 0));
  const rate = have ? one! + ((t - 1) / (30 - 1)) * (thirty! - one!) : undefined;
  const over30 = (Number(tenor) || 0) > 30;

  return (
    <div className="panel">
      <h2>SOFR interpolator</h2>
      <div style={{ padding: 14 }}>
        {!have ? (
          <div className="muted" style={{ fontSize: 13 }}>Add a 1-day and a 30-day SOFR row to interpolate.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="muted" style={{ fontSize: 13 }}>
                1-day <strong>{one!.toFixed(3)}%</strong> · 30-day <strong>{thirty!.toFixed(3)}%</strong>
              </div>
              <label style={field}>Tenor (days, 1–30)
                <input style={{ ...input, maxWidth: 140 }} type="number" min={1} max={30} value={tenor} onChange={(e) => setTenor(e.target.value)} />
              </label>
              <div style={{ fontSize: 15 }}>
                Interpolated SOFR: <strong style={{ fontSize: 18, color: "var(--brand)" }}>{rate!.toFixed(3)}%</strong> <span className="muted">at {t}d</span>
              </div>
            </div>
            {over30 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Over 30 days uses the closest curve point, not this interpolation.</div>}
          </>
        )}
      </div>
    </div>
  );
}
