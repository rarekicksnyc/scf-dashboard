import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Shared form / table input styling and small input helpers. Every screen
// imports these so the look and behaviour are defined in exactly one place —
// there is no per-file copy of the input box style to drift out of sync.
// ---------------------------------------------------------------------------

// Standard text/number/select/date input. width:100% means the enclosing cell
// or grid column controls the visible width.
export const inputBase: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

// Right-aligned variant for amounts / rates.
export const numInput: CSSProperties = { ...inputBase, textAlign: "right" };

// Smaller variant for dense filter bars / secondary forms.
export const inputCompact: CSSProperties = { ...inputBase, padding: "7px 8px", fontSize: 13 };

// Column layout for a stacked "label over input" form field.
export const fieldLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };

// A table cell input with a real pixel min-width. The global table is
// width:100% with auto layout, where a <td> width is only a hint the browser
// can shrink — so a min-width on the input itself is what actually keeps boxes
// readable and lets the .table-scroll container scroll instead of collapsing.
export function cellInput(minWidth: number, numeric = false): CSSProperties {
  return { ...(numeric ? numInput : inputBase), minWidth };
}

// Clamp a percent entered as a string to the 0..100 range.
export function clampPct(v: string): string {
  if (v === "") return v;
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return String(Math.max(0, Math.min(100, n)));
}

// Coverage (funded) amount = invoice face amount × advance rate (0..1).
export function coverageAmount(invoiceAmount: number, advanceRate: number): number {
  return invoiceAmount * advanceRate;
}
