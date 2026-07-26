"use client";

import { useMemo, useState } from "react";
import EditAsrSublimitRow from "./EditAsrSublimitRow";

export interface AsrRowData {
  sellerId: string;
  group: { id: string; name: string };
  globalLimit: string;
  groupExpiry: string;
  groupSwingline: string;
  approvedLimit: number;
  maxTenorDays: number;
  selected: boolean;
  canEdit: boolean;
}

const th = { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.03em" };

// The obligor groups under a seller's ASR, with a search box — sellers can have
// 30+ obligors, so filtering keeps the table usable.
export default function ObligorGroupsTable({ rows }: { rows: AsrRowData[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.group.name.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  return (
    <>
      {rows.length > 8 && (
        <div style={{ padding: "0 14px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter obligors by name…"
            style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: 13, minWidth: 240 }}
          />
          <span className="muted" style={{ fontSize: 12 }}>{filtered.length} of {rows.length}</span>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={th}>Obligor group</th>
              <th style={th} className="num">Global limit</th>
              <th style={th} className="num">ASR sublimit</th>
              <th style={th} className="num">Max tenor</th>
              <th style={th}>Group expiry</th>
              <th style={th} className="num">Obligor swingline limit</th>
              <th style={th}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="muted" style={{ padding: 14 }}>No obligors match.</td></tr>
            ) : (
              filtered.map((r) => (
                <EditAsrSublimitRow
                  key={r.group.id}
                  sellerId={r.sellerId}
                  group={r.group}
                  globalLimit={r.globalLimit}
                  groupExpiry={r.groupExpiry}
                  groupSwingline={r.groupSwingline}
                  approvedLimit={r.approvedLimit}
                  maxTenorDays={r.maxTenorDays}
                  selected={r.selected}
                  canEdit={r.canEdit}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
