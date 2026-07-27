"use client";

import { useRef, type CSSProperties } from "react";

// A text input that shows a number with thousands separators as you type, while
// giving the parent back the RAW digits (no commas) via onValue — so existing
// Number(value) parsing keeps working. Use for dollar amounts. Set decimals for
// values that need a fractional part (kept to 2 places). Not for bps / tenor /
// rates — those stay plain <input type="number">.
//
// Parsing is careful: a pasted spreadsheet value like "25,000,000.00" becomes
// 25000000 (whole-dollar) — the fractional part is dropped, never appended as
// digits (which would ×100 the amount). In decimals mode a single dot and two
// places are enforced so the emitted value can never be NaN. The caret is
// preserved across re-formatting so editing mid-number doesn't jump the cursor.
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
  const ref = useRef<HTMLInputElement>(null);

  // Canonical raw value (no commas) the parent stores and parses.
  const toRaw = (s: string): string => {
    if (!decimals) {
      // Whole dollars: keep only the integer part's digits. Dropping anything
      // from the first "." prevents a pasted ".00" from becoming "00".
      return s.split(".")[0].replace(/\D/g, "");
    }
    const cleaned = s.replace(/[^\d.]/g, "");
    const dot = cleaned.indexOf(".");
    if (dot < 0) return cleaned;
    const int = cleaned.slice(0, dot).replace(/\./g, "");
    const dec = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    return `${int}.${dec}`;
  };

  // Display: group the integer part with commas.
  const withCommas = (raw: string): string => {
    if (raw === "") return "";
    const [int, dec] = raw.split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec != null ? `${grouped}.${dec}` : grouped;
  };

  const display = withCommas(toRaw(String(value ?? "")));

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    // Count non-comma characters left of the caret so we can restore it after
    // the value re-formats (commas are the only inserted characters).
    const caret = el.selectionStart ?? el.value.length;
    const nonCommaBefore = el.value.slice(0, caret).replace(/,/g, "").length;

    onValue(toRaw(el.value));

    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node || document.activeElement !== node) return;
      const f = node.value;
      let count = 0, pos = 0;
      while (pos < f.length && count < nonCommaBefore) {
        if (f[pos] !== ",") count++;
        pos++;
      }
      while (pos < f.length && f[pos] === ",") pos++; // sit after a comma group
      node.setSelectionRange(pos, pos);
    });
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      value={display}
      onChange={handleChange}
      style={style}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
