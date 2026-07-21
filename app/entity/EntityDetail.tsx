import Link from "next/link";
import { dealsByBooked, dealsByMaturity, upcomingReservations } from "@/lib/deals";
import { getSeller, getObligor } from "@/lib/data/store";
import { mm, dateShort } from "@/lib/format";
import type { Reservation } from "@/lib/types";

function counterpartyName(mode: "SELLER" | "OBLIGOR", sellerId: string, obligorId: string): string {
  // On a seller page the counterparty is the obligor, and vice-versa.
  if (mode === "SELLER") return obligorId ? (getObligor(obligorId)?.name ?? obligorId) : "—";
  return sellerId ? (getSeller(sellerId)?.name ?? sellerId) : "—";
}

function daysTo(dateISO: string): number {
  return Math.ceil((Date.parse(dateISO) - Date.now()) / 86_400_000);
}

export default function EntityDetail({ mode, id }: { mode: "SELLER" | "OBLIGOR"; id: string }) {
  const filter = mode === "SELLER" ? { sellerId: id } : { obligorId: id };
  const byBooked = dealsByBooked(filter);
  const byMaturity = dealsByMaturity(filter);
  const reservations = upcomingReservations(filter);
  const cpLabel = mode === "SELLER" ? "Obligor" : "Seller";

  return (
    <>
      {/* 1. Current deals — booking order, oldest first */}
      <div className="panel">
        <h2>Current deals — by booking date ({byBooked.length})</h2>
        {byBooked.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">No funded deals.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Booked</th>
                  <th>Invoice</th>
                  <th>{cpLabel}</th>
                  <th className="num">Amount</th>
                  <th>Value date</th>
                  <th>Maturity</th>
                  <th>Batch</th>
                </tr>
              </thead>
              <tbody>
                {byBooked.map((d, i) => (
                  <tr key={`${d.batchId}-${d.invoiceNumber}-${i}`}>
                    <td>{dateShort(d.bookedDate)}</td>
                    <td>{d.invoiceNumber}</td>
                    <td>{counterpartyName(mode, d.sellerId, d.obligorId)}</td>
                    <td className="num">{mm(d.amount)}</td>
                    <td>{dateShort(d.valueDate)}</td>
                    <td>{dateShort(d.maturityDate)}</td>
                    <td>
                      <Link href={`/batches/${d.batchId}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                        {d.batchId}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Current deals — by maturity / expiry */}
      <div className="panel">
        <h2>Current deals — by maturity / expiry ({byMaturity.length})</h2>
        {byMaturity.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">No funded deals.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Maturity</th>
                  <th className="num">Days</th>
                  <th>Invoice</th>
                  <th>{cpLabel}</th>
                  <th className="num">Amount</th>
                  <th>Value date</th>
                </tr>
              </thead>
              <tbody>
                {byMaturity.map((d, i) => {
                  const days = daysTo(d.maturityDate);
                  return (
                    <tr key={`${d.batchId}-${d.invoiceNumber}-mat-${i}`}>
                      <td>{dateShort(d.maturityDate)}</td>
                      <td className="num">{days < 0 ? `${-days}d ago` : `${days}d`}</td>
                      <td>{d.invoiceNumber}</td>
                      <td>{counterpartyName(mode, d.sellerId, d.obligorId)}</td>
                      <td className="num">{mm(d.amount)}</td>
                      <td>{dateShort(d.valueDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Upcoming reservations */}
      <div className="panel">
        <h2>Upcoming reservations ({reservations.length})</h2>
        {reservations.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">No upcoming reservations.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>{cpLabel}</th>
                  <th className="num">Amount</th>
                  <th>Value date</th>
                  <th>Maturity</th>
                  <th className="num">Tenor</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r: Reservation) => {
                  const isSwl = r.kind === "SWINGLINE";
                  return (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>
                        {isSwl ? (
                          <span className="badge orange">
                            Swingline {r.swinglineDirection === "INCREASE" ? "↑" : "↓"}
                          </span>
                        ) : (
                          <span className="badge grey">Discount</span>
                        )}
                      </td>
                      <td>{counterpartyName(mode, r.sellerId, r.obligorId)}</td>
                      <td className="num">
                        {isSwl && r.swinglineDirection === "INCREASE" ? "+" : isSwl ? "−" : ""}
                        {mm(r.amount)}
                      </td>
                      <td>{dateShort(r.valueDate)}</td>
                      <td>{dateShort(r.maturityDate)}</td>
                      <td className="num">{r.tenorDays}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
