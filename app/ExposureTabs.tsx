"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ExposureRow } from "@/lib/exposure";
import { mm, pct } from "@/lib/format";
import { UtilBar } from "./components";

function Table({ rows, kind }: { rows: ExposureRow[]; kind: string }) {
  const base = kind === "Seller" ? "sellers" : "obligors";
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{kind}</th>
            <th>CDL</th>
            <th className="num">Limit</th>
            <th className="num">Swingline</th>
            <th className="num">Swingline booked</th>
            <th className="num">Outstanding</th>
            <th className="num">Future reservation</th>
            <th className="num">Available</th>
            <th className="num">Utilization</th>
            <th style={{ width: 120 }}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="muted" style={{ padding: 16 }}>
                No matches.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/${base}/${r.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                    {r.name}
                  </Link>
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
                <td className="num">
                  {r.swingline ? (
                    <span>
                      {mm(r.swingline.approvedLimit)}
                      <span className="muted" style={{ fontSize: 11 }}>
                        {" "}
                        · {mm(r.swingline.available)} avail
                      </span>
                    </span>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </td>
                <td className="num">
                  {r.swingline ? mm(r.swingline.consumed) : <span className="muted">—</span>}
                </td>
                <td className="num">{r.main ? mm(r.main.outstanding) : "—"}</td>
                <td className="num">{r.main ? mm(r.main.reserved) : "—"}</td>
                <td className="num">{r.main ? mm(r.main.available) : "—"}</td>
                <td className="num">{r.main ? pct(r.main.utilizationPct) : "—"}</td>
                <td>{r.main ? <UtilBar view={r.main} /> : null}</td>
              </tr>
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
}: {
  sellers: ExposureRow[];
  obligors: ExposureRow[];
}) {
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Filter ${tab} by name or CDL…`}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "7px 10px",
            fontSize: 13,
            minWidth: 240,
          }}
        />
      </div>
      <Table rows={filtered} kind={tab === "sellers" ? "Seller" : "Obligor"} />
    </div>
  );
}
