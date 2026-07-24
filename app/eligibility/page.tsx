import {
  allSellers,
  allObligors,
  allObligorEntities,
  activeInvestors,
  activePolicies,
  getReservations,
  getObligor,
  listDocTemplates,
} from "@/lib/data/store";
import EligibilityCheck from "./EligibilityCheck";
import MultiTransactionCheck from "./MultiTransactionCheck";
import DocsSection from "./DocsSection";
import Collapsible from "../Collapsible";

export const dynamic = "force-dynamic";

export default function EligibilityPage() {
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));
  const obligors = allObligors().map((o) => ({ id: o.id, name: o.name }));
  const obligorEntities = allObligorEntities().map((e) => ({ groupId: e.groupId, id: e.id, name: e.name }));
  const rrlSellers = allSellers().filter((s) => s.rrlEnabled).map((s) => s.id);
  const investors = activeInvestors().map((i) => ({ id: i.id, name: i.name }));
  const policies = activePolicies().map((p) => ({
    id: p.id,
    name: `${p.insurerName} · ${p.policyNumber}`,
  }));
  // Open discount reservations, to autofill a transaction from.
  const reservations = getReservations()
    .filter((r) => r.status === "RESERVED" && r.kind !== "SWINGLINE")
    .map((r) => ({
      id: r.id,
      sellerId: r.sellerId,
      obligorId: r.obligorId,
      obligorName: getObligor(r.obligorId)?.name ?? r.obligorId,
      amount: r.amount,
      valueDate: r.valueDate,
      maturityDate: r.maturityDate,
      pricingBps: r.pricingBps,
    }));

  return (
    <>
      <h1 className="page-title">Transaction Flow</h1>
      <p className="page-sub">
        Take a transaction from check to booking. Select a reservation to autofill
        its details, run every eligibility control at once (seller, obligor, ASR
        sublimit, transaction terms, distribution, insurance), then proceed to
        purchase / commitment docs, execution, and booking. Limits are checked
        against the funded (advance) amount.
      </p>
      <MultiTransactionCheck sellers={sellers} obligors={obligors} obligorEntities={obligorEntities} reservations={reservations} />
      <Collapsible summary="Single detailed check (full breakdown, distribution & insurance)">
        <EligibilityCheck
          sellers={sellers}
          obligors={obligors}
          obligorEntities={obligorEntities}
          rrlSellers={rrlSellers}
          investors={investors}
          policies={policies}
        />
      </Collapsible>

      <DocsSection sellers={sellers} reservations={reservations} templates={listDocTemplates()} />
    </>
  );
}
