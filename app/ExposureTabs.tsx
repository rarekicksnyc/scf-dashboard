"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExposureRow } from "@/lib/exposure";
import { mm, pct } from "@/lib/format";
import { UtilBar } from "./components";

export interface PortfolioDeal { sellerId: string; obligorId: string; investor: number; insured: number }

function Table({ rows, kind, selected, onToggle }: { rows: ExposureRow[]; kind: string; selected: Set<string>; onToggle: (id: string) => void }) {
  const base = kind === "Seller" ? "sellers" : "obligors";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const hasSwingline = rows.some((r) => r.swingline);
  const hasRrl = rows.some((r) => r.rrl);
  const cols = 9 + (hasSwingline ? 3 : 0) + (hasRrl ? 3 : 0);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}></th>
            <th>{kind}</th>
            <th>CDL</th>
            <th className="num">Limit</th>
            <th className="num">Booked</th>
            <th className="num">Available</th>
            {hasSwingline && <><th className="num">Swingline</th><th className="num">Swingline booked</th><th className="num">Swingline avail</th></>}
            {hasRrl && <><th className="num">RRL limit</th><th className="num">RRL booked</th><th className="num">RRL avail</th></>}
            <th className="num">Future reservation</th>
            <th className="num">Utilization</th>
            <th style={{ width: 120 }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols} className="muted" style={{ padding: 16 }}>No matches.</td></tr>
          ) : (
            rows.map((r) => (
              <Fragment key={r.id}>
              <tr style={selected.has(r.id) ? { background: "var(--brand-soft, rgba(0,80,200,0.06))" } : undefined}>
                <td style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => onToggle(r.id)} aria-label={`Select ${r.name}`} />
                </td>
                <td>
                  {r.entities.length > 0 && (
                    <button type="button" onClick={() => toggle(r.id)} title="Show eligible entities" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", marginRight: 4, fontSize: 11 }}>
                      {expanded.has(r.id) ? "▾" : "▸"}
                    </button>
                  )}
                  <Link href={`/${base}/${r.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>{r.name}</Link>
                  {r.entities.length > 0 && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{r.entities.length} {r.entities.length === 1 ? "entity" : "entities"}</span>}
                  {r.status !== "ACTIVE" && <span className="badge orange" style={{ marginLeft: 6 }}>{r.status}</span>}
                </td>
                <td><code style={{ fontSize: 12 }}>{r.cdl}</code></td>
                <td className="num">{r.main ? mm(r.main.approvedLimit) : "—"}</td>
                <td className="num">{r.main ? mm(r.main.consumed) : "—"}</td>
                <td className="num">{r.main ? mm(r.main.available) : "—"}</td>
                {hasSwingline && <>
                  <td className="num">{r.swingline ? mm(r.swingline.approvedLimit) : <span className="muted">none</span>}</td>
                  <td className="num">{r.swingline ? mm(r.swingline.consumed) : <span className="muted">—</span>}</td>
                  <td className="num">{r.swingline ? mm(r.swingline.available) : <span className="muted">—</span>}</td>
                </>}
                {hasRrl && <>
                  <td className="num">{r.rrl ? mm(r.rrl.approvedLimit) : <span className="muted">N/A</span>}</td>
                  <td className="num">{r.rrl ? mm(r.rrl.consumed) : <span className="muted">N/A</span>}</td>
                  <td className="num">{r.rrl ? mm(r.rrl.available) : <span className="muted">N/A</span>}</td>
                </>}
                <td className="num">{r.main ? mm(r.main.reserved) : "—"}</td>
                <td className="num">{r.main ? pct(r.main.utilizationPct) : "—"}</td>
                <td>{r.main ? <UtilBar view={r.main} /> : null}</td>
              </tr>
              {expanded.has(r.id) && r.entities.length > 0 && (
                <tr>
                  <td colSpan={cols} style={{ background: "#fafbfd", padding: "8px 14px 8px 34px" }}>
                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Eligible {kind.toLowerCase()} entities (share this aggregate line)</div>
                    <table style={{ width: "auto" }}><tbody>
                      {r.entities.map((e) => (
                        <tr key={e.id}>
                          <td style={{ border: "none", padding: "3px 16px 3px 0", fontWeight: 500 }}>{e.name}</td>
                          <td style={{ border: "none", padding: "3px 16px 3px 0" }}><code style={{ fontSize: 12 }}>{e.cdl}</code></td>
                          <td style={{ border: "none", padding: "3px 16px 3px 0" }} className="muted">{e.domicile}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  </td>
                </tr>
              )}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// Sum helpers over an entity's real lines (main + RRL) and its swingline.
const sOut = (r: ExposureRow) => (r.main?.outstanding ?? 0) + (r.rrl?.outstanding ?? 0);
const sAvail = (r: ExposureRow) => (r.main?.available ?? 0) + (r.rrl?.available ?? 0);
const swOut = (r: ExposureRow) => (r.swingline?.outstanding ?? 0) + (r.rrlSwingline?.outstanding ?? 0);
const swAvail = (r: ExposureRow) => (r.swingline?.available ?? 0) + (r.rrlSwingline?.available ?? 0);

export default function ExposureTabs({
  sellers, obligors, deals, investorAvail, insuranceAvail, peak, asOf, aggregate, today,
}: {
  sellers: ExposureRow[];
  obligors: ExposureRow[];
  deals: PortfolioDeal[];
  investorAvail: number;
  insuranceAvail: number;
  peak: number;
  asOf: string;
  aggregate: boolean;
  today: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"sellers" | "obligors">("sellers");
  const [q, setQ] = useState("");
  const [selSellers, setSelSellers] = useState<Set<string>>(new Set());
  const [selObligors, setSelObligors] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(!aggregate && asOf !== today);
  const viewMode = aggregate ? "aggregate" : showPicker ? "asof" : "today";

  const source = tab === "sellers" ? sellers : obligors;
  const selForTab = tab === "sellers" ? selSellers : selObligors;
  const setSelForTab = tab === "sellers" ? setSelSellers : setSelObligors;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((r) => r.name.toLowerCase().includes(needle) || r.cdl.toLowerCase().includes(needle));
  }, [source, q]);

  function toggleSel(id: string) {
    setSelForTab((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const selectAllShown = () => setSelForTab((prev) => { const n = new Set(prev); filtered.forEach((r) => n.add(r.id)); return n; });
  const clearAll = () => { setSelSellers(new Set()); setSelObligors(new Set()); };
  const anySel = selSellers.size + selObligors.size > 0;

  // Boxes recompute from the current selection (whole book when nothing is
  // selected). Each shows outstanding (bold) + headroom available, as of the date.
  const selSel = selSellers.size ? sellers.filter((s) => selSellers.has(s.id)) : sellers;
  const selObl = selObligors.size ? obligors.filter((o) => selObligors.has(o.id)) : obligors;
  const inScope = deals.filter((d) => (selSellers.size === 0 || selSellers.has(d.sellerId)) && (selObligors.size === 0 || selObligors.has(d.obligorId)));
  const boxes = [
    { label: "Seller exposure", out: selSel.reduce((a, r) => a + sOut(r), 0), avail: selSel.reduce((a, r) => a + sAvail(r), 0) },
    { label: "Obligor exposure", out: selObl.reduce((a, r) => a + (r.main?.outstanding ?? 0), 0), avail: selObl.reduce((a, r) => a + (r.main?.available ?? 0), 0) },
    { label: "Swingline exposure", out: selSel.reduce((a, r) => a + swOut(r), 0) + selObl.reduce((a, r) => a + swOut(r), 0), avail: selSel.reduce((a, r) => a + swAvail(r), 0) + selObl.reduce((a, r) => a + swAvail(r), 0) },
    { label: "Investor exposure", out: inScope.reduce((a, d) => a + d.investor, 0), avail: investorAvail },
    { label: "Insurance exposure", out: inScope.reduce((a, d) => a + d.insured, 0), avail: insuranceAvail },
  ];

  return (
    <>
      <div className="cards">
        {boxes.map((b) => (
          <div className="card" key={b.label}>
            <div className="label">{b.label}</div>
            <div className="value small">{mm(b.out)}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{mm(b.avail)} headroom</div>
          </div>
        ))}
        <div className="card">
          <div className="label">Peak expected outstanding</div>
          <div className="value small">{mm(peak)}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>full book, next 12 months</div>
        </div>
      </div>

      {anySel && (
        <div className="notice" style={{ background: "var(--brand-soft, rgba(0,80,200,0.06))", color: "var(--brand)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong>Filtered:</strong> the figures above reflect{" "}
          {selSellers.size > 0 && `${selSellers.size} seller${selSellers.size === 1 ? "" : "s"}`}
          {selSellers.size > 0 && selObligors.size > 0 && " and "}
          {selObligors.size > 0 && `${selObligors.size} obligor${selObligors.size === 1 ? "" : "s"}`}
          {" "}as of {aggregate ? "the aggregate view" : asOf}.
          <button type="button" onClick={clearAll} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--brand)", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>Clear selection</button>
        </div>
      )}

      <div className="panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "#fafbfd", flexWrap: "wrap" }}>
          <div className="tabs" style={{ margin: 0, border: "none" }}>
            <button className={`tab ${tab === "sellers" ? "on" : ""}`} onClick={() => setTab("sellers")} type="button" style={{ background: "none", border: "none", cursor: "pointer" }}>
              Sellers ({sellers.length}){selSellers.size > 0 ? ` · ${selSellers.size} selected` : ""}
            </button>
            <button className={`tab ${tab === "obligors" ? "on" : ""}`} onClick={() => setTab("obligors")} type="button" style={{ background: "none", border: "none", cursor: "pointer" }}>
              Obligors ({obligors.length}){selObligors.size > 0 ? ` · ${selObligors.size} selected` : ""}
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }} className="muted">
              <span>View:</span>
              <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {([
                  { m: "today", label: "Today", on: () => { setShowPicker(false); router.push("/"); } },
                  { m: "asof", label: "As of date", on: () => setShowPicker(true) },
                  { m: "aggregate", label: "Aggregate", on: () => { setShowPicker(false); router.push("/?asOf=all"); } },
                ] as const).map((b) => (
                  <button key={b.m} type="button" onClick={b.on} style={{ padding: "5px 10px", fontSize: 12, border: "none", cursor: "pointer", background: viewMode === b.m ? "var(--brand)" : "transparent", color: viewMode === b.m ? "#fff" : "var(--ink)" }}>{b.label}</button>
                ))}
              </div>
              {viewMode === "asof" && (
                <input type="date" value={asOf === today ? "" : asOf} onChange={(e) => { if (e.target.value) router.push(`/?asOf=${e.target.value}`); }} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", fontSize: 13 }} />
              )}
            </div>
            <button className="btn secondary" type="button" style={{ padding: "5px 10px", fontSize: 12 }} onClick={selectAllShown}>Select shown</button>
            {selForTab.size > 0 && <button className="btn secondary" type="button" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setSelForTab(new Set())}>Clear {tab}</button>}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${tab} by name or CDL…`} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: 13, minWidth: 180 }} />
          </div>
        </div>
        <div className="muted" style={{ padding: "8px 14px 0", fontSize: 12 }}>
          Tick sellers and/or obligors to filter the figures above to just those names; leave all unticked for the whole book.{" "}
          {aggregate ? (
            <>Aggregate view — every committed reservation regardless of date.</>
          ) : asOf === today ? (
            <>Current view as of <strong>{today}</strong> — a reservation consumes a limit only while today falls inside its value-to-maturity window.</>
          ) : (
            <>Time-phased view as of <strong>{asOf}</strong>.</>
          )}
        </div>
        <Table rows={filtered} kind={tab === "sellers" ? "Seller" : "Obligor"} selected={selForTab} onToggle={toggleSel} />
      </div>
    </>
  );
}
