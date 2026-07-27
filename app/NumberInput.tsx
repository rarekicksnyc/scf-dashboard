"use client";

import type { CSSProperties } from "react";

// A text input that shows a number with thousands separators as you type, while
// giving the parent back the RAW digits (no commas) via onValue — so existing
// Number(value) parsing keeps working. Use for dollar amounts. Set decimals for
// values that need a fractional part (kept to 2 places). Not for bps / tenor /
// rates — those stay plain <input type="number">.
export default function NumberInput({
  value,
  onValue,
  decimals = false,
  style,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: {
  value: string | number | undefined;
  onValue: (raw: string) => void;
  decimals?: boolean;
  style?: CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const withCommas = (s: string) => {
    if (s === "") return "";
    let cleaned = decimals ? s.replace(/[^\d.]/g, "") : s.replace(/\D/g, "");
    if (decimals) {
      const [i, ...rest] = cleaned.split(".");
      cleaned = rest.length ? `${i}.${rest.join("").slice(0, 2)}` : i;
    }
    const [int, dec] = cleaned.split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec != null ? `${grouped}.${dec}` : grouped;
  };
  return (
    <input
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      value={withCommas(String(value ?? ""))}
      onChange={(e) => onValue(decimals ? e.target.value.replace(/[^\d.]/g, "") : e.target.value.replace(/\D/g, ""))}
      style={style}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
