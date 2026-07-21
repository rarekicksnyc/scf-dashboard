import {
  allSellers,
  allObligors,
  findLimit,
  entitySwingline,
  activeInvestors,
  activePolicies,
} from "@/lib/data/store";
import { getCurrentUser, roleHas } from "@/lib/auth";
import SetupRow from "./SetupRow";
import AddToRegistry from "./AddToRegistry";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await getCurrentUser();
  const canEdit = roleHas(user.role, "CHANGE_LIMIT");

  if (!canEdit) {
    return (
      <>
        <h1 className="page-title">Setup</h1>
        <div className="notice err">
          Your role cannot change setup. Switch to Credit Officer, Risk Manager,
          or Administrator.
        </div>
      </>
    );
  }

  const sellerRows = allSellers().map((s) => {
    const main = findLimit("SELLER", s.id);
    const swl = entitySwingline("SELLER", s.id);
    return {
      entityType: "SELLER" as const,
      entityId: s.id,
      name: s.name,
      cdl: s.cdl,
      limitId: main?.id,
      limitAmount: main?.approvedLimit ?? 0,
      swinglineEnabled: Boolean(swl),
      swinglineAmount: swl?.approvedLimit ?? 0,
    };
  });

  const obligorRows = allObligors().map((o) => {
    const main = findLimit("OBLIGOR", o.id);
    const swl = entitySwingline("OBLIGOR", o.id);
    return {
      entityType: "OBLIGOR" as const,
      entityId: o.id,
      name: o.name,
      cdl: o.cdl,
      limitId: main?.id,
      limitAmount: main?.approvedLimit ?? 0,
      swinglineEnabled: Boolean(swl),
      swinglineAmount: swl?.approvedLimit ?? 0,
    };
  });

  const head = (
    <tr>
      <th>Name</th>
      <th>CDL</th>
      <th>Limit</th>
      <th>Swingline</th>
      <th>Swingline limit</th>
      <th>&nbsp;</th>
    </tr>
  );

  return (
    <>
      <h1 className="page-title">Setup</h1>
      <p className="page-sub">
        Add new limits and entities to the register, assign the CDL customer code,
        set each limit, and toggle a swingline per entity. Changes take effect
        immediately and are audited.
      </p>

      <AddToRegistry
        sellers={allSellers().map((s) => ({ id: s.id, name: s.name, cdl: s.cdl }))}
        obligors={allObligors().map((o) => ({ id: o.id, name: o.name, cdl: o.cdl }))}
        investors={activeInvestors().map((i) => ({ id: i.id, name: i.name }))}
        policies={activePolicies().map((p) => ({
          id: p.id,
          name: `${p.insurerName} · ${p.policyNumber}`,
        }))}
      />

      <div className="panel">
        <h2>Sellers</h2>
        <div className="table-scroll">
          <table>
            <thead>{head}</thead>
            <tbody>
              {sellerRows.map((r) => (
                <SetupRow key={r.entityId} {...r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Obligors</h2>
        <div className="table-scroll">
          <table>
            <thead>{head}</thead>
            <tbody>
              {obligorRows.map((r) => (
                <SetupRow key={r.entityId} {...r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
