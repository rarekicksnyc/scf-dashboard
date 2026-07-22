import {
  getReservations,
  allSellers,
  allObligors,
  getSeller,
  getObligor,
  findLimit,
} from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm } from "@/lib/format";
import ReservationForm from "./ReservationForm";
import MultiReservationForm from "./MultiReservationForm";
import ForwardBook, { type BookRow } from "./ForwardBook";

export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  const reservations = getReservations();
  const canBook = await currentUserCan("UPLOAD_BATCH");
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));
  const obligors = allObligors().map((o) => ({ id: o.id, name: o.name }));
  const rrlSellers = allSellers().filter((s) => findLimit("RRL", s.id)).map((s) => s.id);

  const activeTotal = reservations
    .filter((r) => r.status === "RESERVED")
    .reduce((a, r) => a + r.amount, 0);

  const rows: BookRow[] = reservations.map((r) => ({
    id: r.id,
    kind: r.kind,
    swinglineDirection: r.swinglineDirection,
    sellerId: r.sellerId,
    sellerName: r.sellerId ? (getSeller(r.sellerId)?.name ?? r.sellerId) : "",
    obligorId: r.obligorId,
    obligorName: r.obligorId ? (getObligor(r.obligorId)?.name ?? r.obligorId) : "",
    amount: r.amount,
    valueDate: r.valueDate,
    maturityDate: r.maturityDate,
    tenorDays: r.tenorDays,
    pricingBps: r.pricingBps,
    status: r.status,
    exception: r.exception,
    exceptionComment: r.exceptionComment,
    exceptionReasons: r.exceptionReasons,
    resolveByDate: r.resolveByDate,
  }));

  return (
    <>
      <h1 className="page-title">Reservations</h1>
      <p className="page-sub">
        Forward-booked future discounts and swingline movements. Each is checked
        against live limits before it is accepted. Active reservations:{" "}
        {mm(activeTotal)}.
      </p>

      <MultiReservationForm sellers={sellers} obligors={obligors} rrlSellers={rrlSellers} canBook={canBook} />
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--ink-soft)", margin: "0 0 12px 2px" }}>
          Single detailed entry / swingline adjustment
        </summary>
        <ReservationForm sellers={sellers} obligors={obligors} rrlSellers={rrlSellers} canBook={canBook} />
      </details>

      <div className="panel">
        <h2>Forward book ({reservations.length})</h2>
        {reservations.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No reservations yet.
          </div>
        ) : (
          <>
            <div className="muted" style={{ padding: "8px 14px 0", fontSize: 12 }}>
              Click the Seller or Obligor column to sort.
            </div>
            <ForwardBook rows={rows} canBook={canBook} />
          </>
        )}
      </div>
    </>
  );
}
