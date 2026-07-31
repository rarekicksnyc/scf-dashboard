"use client";

import { useMemo, useState } from "react";
import { mm, pct, usd } from "@/lib/format";
import { evaluateExpression, toNumber } from "@/lib/creator/expr";
import type { EntityExposure } from "@/lib/exposure";
import type { TemplateFieldDef } from "@/lib/types";

type SortKey = "name" | "approved" | "outstanding" | "reserved" | "available" | "utilizationPct";

// A custom exposure-report column's value for one row (same pure evaluator).
function exposureCell(f: TemplateFieldDef, r: EntityExposure): string {
  if (f.kind === "text") return f.text ?? "";
  if (f.kind === "dropdown") return f.options?.[0] ?? "";
  const ctx = { approved: r.approved, outstanding: r.outstanding, reserved: r.reserved, available: r.available, utilization_pct: r.utilizationPct };
  const { value, error } = evaluateExpression(f.formula ?? "", ctx);
  if (error !== undefined || value === undefined) return "—";
  const n = toNumber(value);
  switch (f.format) {
    case "currency": return usd(n);
    case "percent": return `${(n * 100).toFixed(1)}%`;
    case "bps": return `${Math.round(n)} bps`;
    case "text": return String(value);
    default: return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

export default function ExposureSummary({ rows, templateFields = [], hiddenColumns = [] }: { rows: EntityExposure[]; templateFields?: TemplateFieldDef[]; hiddenColumns?: string[] }) {
  const hidden = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const show = (k: string) => !hidden.has(k);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<"ALL" | "SELLER" | "OBLIGOR">("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState(false);

  const key = (r: EntityExposure) => `${r.kind}:${r.id}`;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (kindFilter !== "ALL" && r.kind !== kindFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.cdl.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp: number;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, kindFilter, query, sortKey, sortDir]);

  const chosen = useMemo(
    () => (selected.size === 0 ? visible : visible.filter((r) => selected.has(key(r)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, selected],
  );

  const totals = useMemo(() => {
    const t = { approved: 0, outstanding: 0, reserved: 0, available: 0 };
    for (const r of chosen) {
      t.approved += r.approved;
      t.outstanding += r.outstanding;
      t.reserved += r.reserved;
      t.available += r.available;
    }
    const consumed = t.outstanding + t.reserved;
    return { ...t, util: t.approved > 0 ? consumed / t.approved : 0 };
  }, [chosen]);

  function toggle(r: EntityExposure) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(r);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map(key)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const exportQuery = () => {
    const ids = chosen.map(key).join(",");
    return ids ? `?ids=${encodeURIComponent(ids)}` : "";
  };

  async function copyAsEmail() {
    const header = ["Type", "Name", "CDL", "Approved", "Outstanding", "Reserved", "Available", "Utilization"];
    const cells = (r: EntityExposure) => [
      r.kind === "SELLER" ? "Seller" : "Obligor",
      r.name,
      r.cdl || "—",
      usd(r.approved),
      usd(r.outstanding),
      usd(r.reserved),
      usd(r.available),
      pct(r.utilizationPct),
    ];
    const totalRow = [
      `Total (${chosen.length})`,
      "",
      "",
      usd(totals.approved),
      usd(totals.outstanding),
      usd(totals.reserved),
      usd(totals.available),
      pct(totals.util),
    ];

    const plain = [header, ...chosen.map(cells), totalRow].map((r) => r.join("\t")).join("\n");

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const th = header.map((h) => `<th style="text-align:left;border:1px solid #ccc;padding:4px 8px;background:#f2f4f8">${esc(h)}</th>`).join("");
    const bodyRows = chosen
      .map((r) => `<tr>${cells(r).map((c, i) => `<td style="border:1px solid #ccc;padding:4px 8px;${i >= 3 ? "text-align:right" : ""}">${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    const totHtml = `<tr>${totalRow.map((c, i) => `<td style="border:1px solid #ccc;padding:4px 8px;font-weight:600;${i >= 3 ? "text-align:right" : ""}">${esc(c)}</td>`).join("")}</tr>`;
    const html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr>${th}</tr></thead><tbody>${bodyRows}${totHtml}</tbody></table>`;

    try {
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  const input = { border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px", fontSize: 13 };
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const th = (k: SortKey, label: string, num?: boolean) => (
    <th className={num ? "num" : undefined} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(k)}>
      {label}
      {arrow(k)}
    </th>
  );

  return (
    <div className="panel">
      <h2>Exposure summary</h2>
      <div style={{ padding: 18 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          Pick any set of sellers and obligors, then copy the table straight into an email or download it as Excel.
          With nothing ticked, every visible name is included.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <select style={input} value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
            <option value="ALL">Sellers &amp; obligors</option>
            <option value="SELLER">Sellers only</option>
            <option value="OBLIGOR">Obligors only</option>
          </select>
          <input style={{ ...input, width: 240 }} placeholder="Search name or CDL…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn secondary" type="button" onClick={selectAllVisible}>Select all shown</button>
          <button className="btn secondary" type="button" onClick={clearSelection} disabled={selected.size === 0}>Clear</button>
          <span className="muted" style={{ marginLeft: "auto" }}>
            {selected.size > 0 ? `${selected.size} selected` : `${visible.length} names`}
          </span>
        </div>

        <div className="row-actions" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="muted">
            {chosen.length} name{chosen.length === 1 ? "" : "s"} · approved {mm(totals.approved)} · outstanding {mm(totals.outstanding)} · available {mm(totals.available)}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" onClick={copyAsEmail} disabled={chosen.length === 0}>
              {copied ? "Copied ✓" : "Copy as email"}
            </button>
            <a
              className="btn secondary"
              href={`/api/reports/exposure-xlsx${exportQuery()}`}
              aria-disabled={chosen.length === 0}
              style={chosen.length === 0 ? { pointerEvents: "none", opacity: 0.5 } : undefined}
            >
              Download Excel
            </a>
          </span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                {show("kind") && <th>Type</th>}
                {show("name") && th("name", "Name")}
                {show("cdl") && <th>CDL</th>}
                {show("approved") && th("approved", "Approved", true)}
                {show("outstanding") && th("outstanding", "Outstanding", true)}
                {show("reserved") && th("reserved", "Reserved", true)}
                {show("available") && th("available", "Available", true)}
                {show("utilizationPct") && th("utilizationPct", "Util", true)}
                {templateFields.map((f) => <th key={f.id} className={f.kind === "formula" && f.format !== "text" ? "num" : ""}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={1 + ["kind", "name", "cdl", "approved", "outstanding", "reserved", "available", "utilizationPct"].filter(show).length + templateFields.length} className="muted" style={{ padding: 16 }}>No names match.</td></tr>
              ) : (
                visible.map((r) => {
                  const isChosen = selected.size === 0 || selected.has(key(r));
                  return (
                    <tr key={key(r)} style={{ opacity: isChosen ? 1 : 0.55 }}>
                      <td style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={selected.has(key(r))} onChange={() => toggle(r)} />
                      </td>
                      {show("kind") && <td>
                        <span className={`badge ${r.kind === "SELLER" ? "green" : "grey"}`}>
                          {r.kind === "SELLER" ? "Seller" : "Obligor"}
                        </span>
                      </td>}
                      {show("name") && <td style={{ fontWeight: 600 }}>{r.name}</td>}
                      {show("cdl") && <td><code style={{ fontSize: 12 }}>{r.cdl || "—"}</code></td>}
                      {show("approved") && <td className="num">{mm(r.approved)}</td>}
                      {show("outstanding") && <td className="num">{mm(r.outstanding)}</td>}
                      {show("reserved") && <td className="num">{mm(r.reserved)}</td>}
                      {show("available") && <td className="num">{mm(r.available)}</td>}
                      {show("utilizationPct") && <td className="num">{pct(r.utilizationPct)}</td>}
                      {templateFields.map((f) => <td key={f.id} className={f.kind === "formula" && f.format !== "text" ? "num" : ""}>{exposureCell(f, r)}</td>)}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
