import {
  limitViews,
  getSeller,
  getObligor,
  getInvestor,
  getInsurancePolicy,
  allSellers,
} from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { LIMIT_LABEL } from "@/lib/format";
import EditLimitRow from "./EditLimitRow";
import type { LimitType } from "@/lib/types";

// The full editable limit register, grouped by type. Lives here so it can be
// embedded in Data Management (the register no longer has its own nav tab).
// Every row is inline-editable (amount, max tenor, expiry, status) for
// CHANGE_LIMIT holders via PATCH /api/limits/:id — the single source the engine
// and every exposure view read.

const ORDER: LimitType[] = [
  "SELLER",
  "ASR",
  "RRL",
  "OBLIGOR",
  "SWINGLINE",
  "RRL_SWINGLINE",
  "INVESTOR",
  "INSURANCE",
  "PROGRAM",
];

export default async function LimitRegister() {
  const views = limitViews();
  const canEdit = await currentUserCan("CHANGE_LIMIT");

  function entityName(entityType: string, entityId: string): string {
    if (entityType === "SELLER") {
      const s = getSeller(entityId);
      return s ? `${s.name} · ASR ${s.asrRating}` : entityId;
    }
    if (entityType === "OBLIGOR") return getObligor(entityId)?.name ?? entityId;
    if (entityType === "INVESTOR") return getInvestor(entityId)?.name ?? entityId;
    if (entityType === "INSURER_POLICY") {
      const p = getInsurancePolicy(entityId);
      return p ? `${p.insurerName} · ${p.policyNumber}` : entityId;
    }
    return entityId;
  }

  const groups = ORDER.map((type) => ({
    type,
    rows: views.filter((v) => v.limit.type === type),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      {groups.map((g) => (
        <div className="panel" key={g.type}>
          <h2>{LIMIT_LABEL[g.type]} limits</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Limit</th>
                  <th>Entity</th>
                  <th>CDL</th>
                  <th className="num">Approved</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Reserved</th>
                  <th className="num">Available</th>
                  <th className="num">Utilization</th>
                  <th style={{ width: 120 }}>&nbsp;</th>
                  <th className="num">Max tenor</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  {canEdit && <th>&nbsp;</th>}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((v) => (
                  <EditLimitRow
                    key={v.limit.id}
                    view={v}
                    entityName={entityName(v.limit.entityType, v.limit.entityId)}
                    canEdit={canEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="panel">
        <h2>Program legal documentation</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Seller</th>
                <th>Documents</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allSellers().map((seller) => {
                const missing = seller.documents.filter((d) => d.status !== "RECEIVED");
                return (
                  <tr key={seller.id}>
                    <td>{seller.name}</td>
                    <td className="muted">
                      {seller.documents.map((d) => `${d.type.replace(/_/g, " ")} (${d.status})`).join(" · ")}
                    </td>
                    <td>
                      {missing.length === 0 ? (
                        <span className="badge green">Complete</span>
                      ) : (
                        <span className="badge orange">{missing.length} outstanding</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
