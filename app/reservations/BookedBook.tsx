"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mm, dateShort } from "@/lib/format";

export interface BookedRow {
  id: string;
  reference: string;
  sellerName: string;
  obligorName: string;
  productType: string;
  amount: number;
  scope?: string;
  valueDate: string;
  maturityDate: string;
  pricingBps: number;
  bookedAt: string;
}

// Booked transactions — real outstanding exposure realised from the flow. Time-
// phased like the forward book. Reversing removes the booked exposure everywhere.
export default function BookedBook({ rows, canBook }: { rows: BookedRow[]; canBook: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function reverse(id: string, ref: string) {
    if (!confirm(`Reverse booking ${ref}? Its outstanding exposure is removed everywhere. This cannot be undone.`)) return;
    setBusy(id);
    const res = await fetch(`/api/booked-transactions/${id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  return (
    <div className="panel">
      <h2>Booked transactions ({rows.length})</h2>
      {rows.length === 0 ? (
        <div style={{ padding: 18 }} className="muted">No booked transactions yet — book one from the Transaction Flow.</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Reference</th><th>Seller</th><th>Obligor</th><th>Product</th>
                <th className="num">Amount</th><th>Value date</th><th>Maturity</th><th className="num">Pricing</th><th>Booked</th>
                {canBook && <th>&nbsp;</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td style={{ fontWeight: 600 }}>{r.reference}</td>
                  <td>{r.sellerName}</td>
                  <td>{r.obligorName}</td>
                  <td>
                    <span className="badge grey">{r.productType}</span>
                    {r.scope === "SELLER_ONLY" && <span className="badge yellow" style={{ marginLeft: 4 }}>seller only</span>}
                    {r.scope === "OBLIGOR_ONLY" && <span className="badge yellow" style={{ marginLeft: 4 }}>obligor only</span>}
                  </td>
                  <td className="num">{mm(r.amount)}</td>
                  <td>{dateShort(r.valueDate)}</td>
                  <td>{dateShort(r.maturityDate)}</td>
                  <td className="num">{r.pricingBps}bps</td>
                  <td className="muted">{r.bookedAt.slice(0, 10)}</td>
                  {canBook && (
                    <td>
                      <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12, borderColor: "var(--red)", color: "var(--red)" }} type="button" disabled={busy === r.id} onClick={() => reverse(r.id, r.reference)}>
                        {busy === r.id ? "…" : "Reverse"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
