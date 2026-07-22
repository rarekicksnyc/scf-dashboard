"use client";

import { useState } from "react";
import Link from "next/link";
import { mm } from "@/lib/format";

export interface RevRow {
  id: string;
  name: string;
  deals: number;
  volume: number;
  revenue: number;
}

function Table({ rows, kind }: { rows: RevRow[]; kind: "seller" | "obligor" }) {
  const base = kind === "seller" ? "sellers" : "obligors";
  const totalRev = rows.reduce((a, r) => a + r.revenue, 0);
  const totalVol = rows.reduce((a, r) => a + r.volume, 0);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{kind === "seller" ? "Seller" : "Obligor"}</th>
            <th className="num">Deals</th>
            <th className="num">Volume</th>
            <th className="num">Revenue</th>
            <th className="num">Avg yield</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>No funded deals yet.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/${base}/${r.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>{r.name}</Link>
                </td>
                <td className="num">{r.deals}</td>
                <td className="num">{mm(r.volume)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{mm(r.revenue)}</td>
                <td className="num">{r.volume > 0 ? `${((r.revenue / r.volume) * 100).toFixed(2)}%` : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td>
              <td className="num">{rows.reduce((a, r) => a + r.deals, 0)}</td>
              <td className="num">{mm(totalVol)}</td>
              <td className="num">{mm(totalRev)}</td>
              <td className="num">{totalVol > 0 ? `${((totalRev / totalVol) * 100).toFixed(2)}%` : "—"}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function RevenueTabs({ sellers, obligors }: { sellers: RevRow[]; obligors: RevRow[] }) {
  const [tab, setTab] = useState<"seller" | "obligor">("seller");
  return (
    <div className="panel">
      <div className="tabs" style={{ margin: 0, padding: "10px 14px 0" }}>
        <button className={`tab ${tab === "seller" ? "on" : ""}`} type="button" onClick={() => setTab("seller")} style={{ background: "none", border: "none", cursor: "pointer" }}>
          Seller revenue
        </button>
        <button className={`tab ${tab === "obligor" ? "on" : ""}`} type="button" onClick={() => setTab("obligor")} style={{ background: "none", border: "none", cursor: "pointer" }}>
          Obligor revenue
        </button>
      </div>
      <Table rows={tab === "seller" ? sellers : obligors} kind={tab} />
    </div>
  );
}
