"use client";

import { useState, type ReactNode } from "react";

// Client-controlled disclosure. Replaces a native <details>, whose `open`
// attribute can be toggled (by the user or a browser extension) before React
// hydrates and cause a hydration mismatch. Here both server and client render
// closed, and opening happens purely in React state after hydration.
export default function Collapsible({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", fontSize: 13, color: "var(--ink-soft)", background: "none", border: "none", padding: "0 0 12px 2px" }}
      >
        {open ? "▾" : "▸"} {summary}
      </button>
      {open && children}
    </div>
  );
}
