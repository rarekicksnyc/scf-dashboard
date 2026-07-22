"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExposureRow } from "@/lib/exposure";
import { mm, pct } from "@/lib/format";
import { UtilBar } from "./components";

function Table({ rows, kind }: { rows: ExposureRow[]; kind: string }) {
  const base = kind === "Seller" ? "sellers" : "obligors";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{kind}</th>
            <th>CDL</th>
            <th className="num">Limit</th>
            <th className="num">Booked</th>
            <th className="num">Available</th>
            <th className="num">Swingline</th>
            <th className="num">Swingline booked</th>
            <th className="num">Swingline avail</th>
            <th className="num">RRL limit</th>
            <th className="num">RRL booked</th>
            <th className="num">RRL avail</th>
            <th className="num">Outstanding</th>
            <th className="num">Future reservation</th>
            <th className="num">Utilization</th>
            <th style={{ width: 120 }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={15} className="muted" style={{ padding: 16 }}>
                No matches.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <Fragment key={r.id}>
              <tr>
                <td>
                  {r.entities.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      title="Show eligible entities"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", marginRight: 4, fontSize: 11 }}
                    >
                      {expanded.has(r.id) ? "▾" : "▸"}
                    </button>
                  )}
                  <Link href={`/${base}/${r.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                    {r.name}
                  </Link>
                  {r.entities.length > 0 && (
                    <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                      {r.entities.length} {r.entities.length === 1 ? "entity" : "entities"}
                    </span>
                  )}
                  {r.status !== "ACTIVE" && (
                    <span className="badge orange" style={{ marginLeft: 6 }}>
                      {r.status}
                    </span>
                  )}
                </td>
                <td>
                  <code style={{ fontSize: 12 }}>{r.cdl}</code>
                </td>
                <td className="num">{r.main ? mm(r.main.approvedLimit) : "—"}</td>
                <td className="num">{r.main ? mm(r.main.consumed) : "—"}</td>
                <td className="num">{r.main ? mm(r.main.available) : "—"}</td>
                <td className="num">{r.swingline ? mm(r.swingline.approvedLimit) : <span className="muted">none</span>}</td>
                <td className="num">{r.swingline ? mm(r.swingline.consumed) : <span className="muted">—</span>}</td>
                <td className="num">{r.swingline ? mm(r.swingline.available) : <span className="muted">—</span>}</td>
                <td className="num">{r.rrl ? mm(r.rrl.approvedLimit) : <span className="muted">N/A</span>}</td>
                <td className="num">{r.rrl ? mm(r.rrl.consumed) : <span className="muted">N/A</span>}</td>
                <td className="num">{r.rrl ? mm(r.rrl.available) : <span className="muted">N/A</span>}</td>
                <td className="num">{r.main ? mm(r.main.outstanding) : "—"}</td>
                <td className="num">{r.main ? mm(r.main.reserved) : "—"}</td>
                <td className="num">{r.main ? pct(r.main.utilizationPct) : "—"}</td>
                <td>{r.main ? <UtilBar view={r.main} /> : null}</td>
              </tr>
              {expanded.has(r.id) && r.entities.length > 0 && (
                <tr>
                  <td colSpan={15} style={{ background: "#fafbfd", padding: "8px 14px 8px 34px" }}>
                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                      Eligible {kind.toLowerCase()} entities (share this aggregate line)
                    </div>
                    <table style={{ width: "auto" }}>
                      <tbody>
                        {r.entities.map((e) => (
                          <tr key={e.id}>
                            <td style={{ border: "none", padding: "3px 16px 3px 0", fontWeight: 500 }}>{e.name}</td>
                            <td style={{ border: "none", padding: "3px 16px 3px 0" }}>
                              <code style={{ fontSize: 12 }}>{e.cdl}</code>
                            </td>
                            <td style={{ border: "none", padding: "3px 16px 3px 0" }} className="muted">{e.domicile}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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

export default function ExposureTabs({
  sellers,
  obligors,
  asOf,
  aggregate,
  today,
}: {
  sellers: ExposureRow[];
  obligors: ExposureRow[];
  asOf: string;
  aggregate: boolean;
  today: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"sellers" | "obligors">("sellers");
  const [q, setQ] = useState("");

  const source = tab === "sellers" ? sellers : obligors;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.cdl.toLowerCase().includes(needle),
    );
  }, [source, q]);

  return (
    <div className="panel">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "#fafbfd",
          flexWrap: "wrap",
        }}
      >
        <div className="tabs" style={{ margin: 0, border: "none" }}>
          <button
            className={`tab ${tab === "sellers" ? "on" : ""}`}
            onClick={() => setTab("sellers")}
            type="button"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            Sellers ({sellers.length})
          </button>
          <button
            className={`tab ${tab === "obligors" ? "on" : ""}`}
            onClick={() => setTab("obligors")}
            type="button"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            Obligors ({obligors.length})
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }} className="muted">
            As of
            <input
              type="date"
              value={aggregate ? "" : asOf}
              onChange={(e) => router.push(e.target.value ? `/?asOf=${e.target.value}` : "/")}
              style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13 }}
            />
            {aggregate ? (
              <button className="btn secondary" style={{ padding: "3px 8px", fontSize: 11 }} type="button" onClick={() => router.push("/")}>
                current
              </button>
            ) : (
              <>
                {asOf !== today && (
                  <button className="btn secondary" style={{ padding: "3px 8px", fontSize: 11 }} type="button" onClick={() => router.push("/")}>
                    today
                  </button>
                )}
                <button className="btn secondary" style={{ padding: "3px 8px", fontSize: 11 }} type="button" onClick={() => router.push("/?asOf=all")}>
                  aggregate
                </button>
              </>
            )}
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Filter ${tab} by name or CDL…`}
            style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: 13, minWidth: 200 }}
          />
        </div>
      </div>
      <div className="muted" style={{ padding: "8px 14px 0", fontSize: 12 }}>
        {aggregate ? (
          <>Aggregate view — every committed reservation regardless of date. Switch to <strong>current</strong> to exclude reservations not yet effective.</>
        ) : asOf === today ? (
          <>Current view as of <strong>{today}</strong> — a reservation consumes a limit only while today falls inside its value-to-maturity window, so future reservations do not reduce today&rsquo;s capacity.</>
        ) : (
          <>Time-phased view as of <strong>{asOf}</strong> — availability reflects only reservations whose value-to-maturity window covers that date.</>
        )}
      </div>
      <Table rows={filtered} kind={tab === "sellers" ? "Seller" : "Obligor"} />
    </div>
  );
}
