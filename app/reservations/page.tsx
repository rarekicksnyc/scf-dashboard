import {
  getReservations,
  allSellers,
  allObligors,
  getSeller,
  getObligor,
} from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm, dateShort } from "@/lib/format";
import ReservationForm from "./ReservationForm";
import CancelButton from "./CancelButton";
import type { ReservationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ReservationStatus, string> = {
  RESERVED: "orange",
  FUNDED: "green",
  MATURED: "grey",
  CANCELLED: "grey",
};

export default async function ReservationsPage() {
  const reservations = getReservations();
  const canBook = await currentUserCan("UPLOAD_BATCH");
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));
  const obligors = allObligors().map((o) => ({ id: o.id, name: o.name }));

  const activeTotal = reservations
    .filter((r) => r.status === "RESERVED")
    .reduce((a, r) => a + r.amount, 0);

  return (
    <>
      <h1 className="page-title">Reservations</h1>
      <p className="page-sub">
        Forward-booked future discounts. Each marks exposure against both the
        seller and the obligor and is checked against live limits before it is
        accepted. Active reservations: {mm(activeTotal)}.
      </p>

      <ReservationForm sellers={sellers} obligors={obligors} canBook={canBook} />

      <div className="panel">
        <h2>Forward book ({reservations.length})</h2>
        {reservations.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No reservations yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Seller</th>
                  <th>Obligor</th>
                  <th className="num">Amount</th>
                  <th>Value date</th>
                  <th>Maturity</th>
                  <th className="num">Tenor</th>
                  <th className="num">Pricing</th>
                  <th>Swingline</th>
                  <th>Status</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{getSeller(r.sellerId)?.name ?? r.sellerId}</td>
                    <td>{getObligor(r.obligorId)?.name ?? r.obligorId}</td>
                    <td className="num">{mm(r.amount)}</td>
                    <td>{dateShort(r.valueDate)}</td>
                    <td>{dateShort(r.maturityDate)}</td>
                    <td className="num">{r.tenorDays}d</td>
                    <td className="num">{r.pricingBps}bps</td>
                    <td>
                      {r.usesSwingline ? (
                        <span className="badge grey">Swingline</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>
                        {r.status}
                      </span>
                      {r.exception && (
                        <span
                          className="badge red"
                          style={{ marginLeft: 6, cursor: "help" }}
                          title={`Soft-warning exception: ${r.exceptionComment ?? ""}${
                            r.resolveByDate ? `\nResolve by: ${r.resolveByDate}` : ""
                          }${
                            r.exceptionReasons?.length
                              ? `\nDid not clear: ${r.exceptionReasons.join("; ")}`
                              : ""
                          }`}
                        >
                          ⚠ exception
                        </span>
                      )}
                    </td>
                    <td>
                      {r.status === "RESERVED" && canBook ? (
                        <CancelButton id={r.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
