import {
  allSellers,
  allObligors,
  allObligorEntities,
  activeInvestors,
  activePolicies,
} from "@/lib/data/store";
import EligibilityCheck from "./EligibilityCheck";
import MultiTransactionCheck from "./MultiTransactionCheck";
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

  return (
    <>
      <h1 className="page-title">Eligibility Check</h1>
      <p className="page-sub">
        Run one discount transaction against every seller-facility and
        transaction control at once — seller, obligor, ASR approved-obligor
        sublimit, transaction terms, distribution, and insurance. Limits are
        checked against the funded (advance) amount; the obligor is checked
        against both its master line and the per-seller ASR sublimit.
      </p>
      <MultiTransactionCheck sellers={sellers} obligors={obligors} obligorEntities={obligorEntities} />
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
    </>
  );
}
