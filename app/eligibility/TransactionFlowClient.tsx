"use client";

import { useState } from "react";
import { usd } from "@/lib/format";
import MultiTransactionCheck, { type ResvOpt } from "./MultiTransactionCheck";
import DocsSection from "./DocsSection";
import type { DocTemplate } from "@/lib/types";

interface Opt { id: string; name: string }
interface EntityOpt { groupId: string; id: string; name: string }

// One reservation selection drives the whole flow: it autofills the Check
// transactions table AND the Purchase/Commitment docs, so you pick it once.
export default function TransactionFlowClient({
  sellers, obligors, obligorEntities, reservations, templates, canBook, sofr1, sofr30, cofCurve,
}: {
  sellers: Opt[]; obligors: Opt[]; obligorEntities: EntityOpt[]; reservations: ResvOpt[]; templates: DocTemplate[]; canBook: boolean; sofr1?: number; sofr30?: number; cofCurve: { tenorDays: number; offer: number }[];
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = reservations.find((r) => r.id === selectedId) ?? null;

  return (
    <>
      <div className="panel">
        <h2>Select a reservation</h2>
        <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Reservation</span>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 13, minWidth: 340 }}>
            <option value="">Select an open reservation…</option>
            {reservations.map((r) => <option key={r.id} value={r.id}>{r.obligorName} | {usd(r.amount)} | {r.valueDate}</option>)}
          </select>
          {reservations.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No open reservations.</span>}
          <span className="muted" style={{ fontSize: 12 }}>Fills the checks and the documents below.</span>
        </div>
      </div>

      <MultiTransactionCheck sellers={sellers} obligors={obligors} obligorEntities={obligorEntities} selected={selected} />
      <DocsSection sellers={sellers} selected={selected} templates={templates} canBook={canBook} sofr1={sofr1} sofr30={sofr30} cofCurve={cofCurve} />
    </>
  );
}
