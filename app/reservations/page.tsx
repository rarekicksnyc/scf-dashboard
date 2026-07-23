import {
  getReservations,
  allSellers,
  allObligors,
  allObligorEntities,
  activeInvestors,
  activePolicies,
  getSeller,
  getObligor,
  findLimit,
} from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm } from "@/lib/format";
import { fundedDeals } from "@/lib/deals";
import { reservationStillBreaches } from "@/lib/reservationStatus";
import ReservationForm from "./ReservationForm";
import MultiReservationForm from "./MultiReservationForm";
import ForwardBook, { type BookRow, type TxnCandidate } from "./ForwardBook";
import Collapsible from "../Collapsible";

export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  const reservations = getReservations();
  const canBook = await currentUserCan("UPLOAD_BATCH");
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));
  const obligors = allObligors().map((o) => ({ id: o.id, name: o.name }));
  const rrlSellers = allSellers().filter((s) => findLimit("RRL", s.id)).map((s) => s.id);
  const obligorEntities = allObligorEntities().map((e) => ({ groupId: e.groupId, id: e.id, name: e.name }));
  const investors = activeInvestors().map((i) => ({ id: i.id, name: i.name }));
  const policies = activePolicies().map((p) => ({ id: p.id, name: `${p.insurerName} · ${p.policyNumber}` }));

  const activeTotal = reservations
    .filter((r) => r.status === "RESERVED")
    .reduce((a, r) => a + r.amount, 0);

  const rows: BookRow[] = reservations.map((r) => {
    // The exception flag is LIVE: if the breach that forced the soft-warning has
    // since been resolved (e.g. the obligor group expiry was entered), it clears
    // automatically. Only still-breaching open reservations stay flagged.
    const stillFlagged = r.exception && r.status === "RESERVED" ? reservationStillBreaches(r) : false;
    return {
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
      exception: stillFlagged,
      exceptionComment: r.exceptionComment,
      exceptionReasons: r.exceptionReasons,
      resolveByDate: r.resolveByDate,
      fulfilledByInvoice: r.fulfilledByInvoice,
    };
  });

  const candidates: TxnCandidate[] = fundedDeals({}).map((d) => ({
    invoiceNumber: d.invoiceNumber,
    sellerId: d.sellerId,
    obligorId: d.obligorId,
    amount: d.amount,
    valueDate: d.valueDate,
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
      <Collapsible summary="Single detailed entry / swingline adjustment">
        <ReservationForm
          sellers={sellers}
          obligors={obligors}
          obligorEntities={obligorEntities}
          rrlSellers={rrlSellers}
          investors={investors}
          policies={policies}
          canBook={canBook}
        />
      </Collapsible>

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
            <ForwardBook rows={rows} candidates={candidates} canBook={canBook} />
          </>
        )}
      </div>
    </>
  );
}
