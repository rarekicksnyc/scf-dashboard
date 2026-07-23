import {
  allSellers,
  allObligors,
  getSeller,
  sellerEntitiesOf,
  findLimit,
  sellerObligorLimitsForSeller,
  getObligor,
  obligorEntitiesOf,
  getInsurancePolicy,
  allCountries,
  activeInvestors,
  activePolicies,
  listParentGuarantees,
} from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm, dateShort } from "@/lib/format";
import LimitRegister from "./LimitRegister";
import AddToRegistry from "./AddToRegistry";
import SellerFacilityPicker from "./SellerFacilityPicker";
import SwinglineAdjustment from "./SwinglineAdjustment";
import EditSellerEntityRow from "./EditSellerEntityRow";
import EditObligorEntityRow from "./EditObligorEntityRow";
import EditAsrSublimitRow from "./EditAsrSublimitRow";
import DeleteSellerButton from "./DeleteSellerButton";
import EditSellerFacility from "./EditSellerFacility";
import AddObligorToFacility from "./AddObligorToFacility";
import PcgRegister from "./PcgRegister";
import ResetExposure from "./ResetExposure";

export const dynamic = "force-dynamic";

export default async function DataManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string; group?: string }>;
}) {
  const { seller: sellerParam, group: groupParam } = await searchParams;
  const sellers = allSellers();
  const sellerId = sellerParam && getSeller(sellerParam) ? sellerParam : sellers[0]?.id;
  const seller = sellerId ? getSeller(sellerId) : undefined;

  const sellerLimit = seller ? findLimit("SELLER", seller.id) : undefined;
  const asrLimit = seller ? findLimit("ASR", seller.id) : undefined;
  const swl = seller ? findLimit("SWINGLINE", seller.id) : undefined;
  const rrl = seller ? findLimit("RRL", seller.id) : undefined;
  const rrlSwl = seller ? findLimit("RRL_SWINGLINE", seller.id) : undefined;
  const asrObligors = seller ? sellerObligorLimitsForSeller(seller.id) : [];

  const groupId = groupParam && asrObligors.some((x) => x.obligorId === groupParam)
    ? groupParam
    : asrObligors[0]?.obligorId;
  const group = groupId ? getObligor(groupId) : undefined;
  const groupLimit = groupId ? findLimit("OBLIGOR", groupId) : undefined;
  const groupSwl = groupId ? findLimit("SWINGLINE", groupId) : undefined;

  const canEdit = await currentUserCan("CHANGE_LIMIT");
  const canBook = await currentUserCan("UPLOAD_BATCH");
  const rrlSwlSellers = sellers.filter((s) => findLimit("RRL_SWINGLINE", s.id)).map((s) => s.id);
  const countries = allCountries().map((c) => ({ code: c.code, name: c.name }));
  const policies = activePolicies().map((p) => ({ id: p.id, name: `${p.insurerName} · ${p.policyNumber}` }));

  const th = { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.03em" };

  return (
    <>
      <h1 className="page-title">Data Management</h1>
      <p className="page-sub">
        The control center for every feed — add new sellers, obligors, limits
        (seller, ASR, obligor, swingline, RRL, RRL swingline, investor, insurance),
        and ASR sublimits, and edit every facility, entity, and limit inline. All
        changes take effect immediately, feed the eligibility engine, and are audited.
      </p>

      {canEdit && (
        <AddToRegistry
          sellers={sellers.map((s) => ({ id: s.id, name: s.name, cdl: s.cdl }))}
          obligors={allObligors().map((o) => ({ id: o.id, name: o.name, cdl: o.cdl }))}
          investors={activeInvestors().map((i) => ({ id: i.id, name: i.name }))}
          policies={activePolicies().map((p) => ({ id: p.id, name: `${p.insurerName} · ${p.policyNumber}` }))}
        />
      )}

      {canBook && (
        <SwinglineAdjustment
          sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
          obligors={allObligors().map((o) => ({ id: o.id, name: o.name }))}
          rrlSwlSellers={rrlSwlSellers}
          canBook={canBook}
        />
      )}

      <SellerFacilityPicker
        sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
        current={sellerId ?? ""}
      />

      {/* Box 1: seller facility + eligible seller entities */}
      <div className="panel">
        <h2 style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span>{seller?.name} — facility &amp; eligible seller entities</span>
          {canEdit && seller && <DeleteSellerButton sellerId={seller.id} sellerName={seller.name} />}
        </h2>
        {seller && (
          <EditSellerFacility
            seller={{
              id: seller.id,
              name: seller.name,
              asrRating: seller.asrRating,
              asrExpiry: seller.asrExpiry,
              borrowerRating: seller.borrowerRating,
              borrowerRatingExpiry: seller.borrowerRatingExpiry,
              gcarsNumber: seller.gcarsNumber,
              guarantor: seller.guarantor,
              minPricingBps: seller.minPricingBps,
              rrlEnabled: seller.rrlEnabled,
              status: seller.status,
            }}
            limits={{
              sellerLine: sellerLimit ? `${mm(sellerLimit.approvedLimit)} (exp ${dateShort(sellerLimit.expiryDate)})` : "—",
              swingline: swl ? `${mm(swl.approvedLimit)} (exp ${dateShort(swl.expiryDate)})` : "none",
              rrl: rrl ? `${mm(rrl.approvedLimit)} (exp ${dateShort(rrl.expiryDate)})` : "N/A",
              rrlSwingline: rrlSwl ? `${mm(rrlSwl.approvedLimit)} (exp ${dateShort(rrlSwl.expiryDate)})` : "N/A",
            }}
            canEdit={canEdit}
          />
        )}
        <div className="table-scroll">
          <table>
            <thead><tr><th style={th}>Eligible seller entity</th><th style={th}>CDL</th><th style={th}>Domicile</th>{canEdit && <th style={th}>&nbsp;</th>}</tr></thead>
            <tbody>
              {seller && sellerEntitiesOf(seller.id).map((e) => (
                <EditSellerEntityRow
                  key={e.id}
                  entity={{ id: e.id, name: e.name, cdl: e.cdl, domicile: e.domicile }}
                  countries={countries}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Box 2: obligor groups under this seller's ASR */}
      <div className="panel">
        <h2>Obligor groups under {seller?.name}&rsquo;s ASR ({asrObligors.length})</h2>
        {canEdit && seller && (
          <AddObligorToFacility
            sellerId={seller.id}
            sellerName={seller.name}
            availableObligors={allObligors()
              .filter((o) => !asrObligors.some((x) => x.obligorId === o.id))
              .map((o) => ({ id: o.id, name: o.name }))}
            everyObligor={allObligors().map((o) => ({ id: o.id, name: o.name }))}
          />
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={th}>Obligor group</th>
                <th style={th} className="num">Global limit</th>
                <th style={th} className="num">ASR sublimit</th>
                <th style={th} className="num">Max tenor</th>
                <th style={th}>Group expiry</th>
                <th style={th}>Group swingline</th>
                <th style={th}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {asrObligors.map((x) => {
                const o = getObligor(x.obligorId);
                const gl = findLimit("OBLIGOR", x.obligorId);
                const gs = findLimit("SWINGLINE", x.obligorId);
                return (
                  <EditAsrSublimitRow
                    key={x.obligorId}
                    sellerId={sellerId!}
                    group={{ id: x.obligorId, name: o?.name ?? x.obligorId }}
                    globalLimit={gl ? mm(gl.approvedLimit) : "—"}
                    groupExpiry={o?.expiryDate ?? ""}
                    groupSwingline={gs ? `${mm(gs.approvedLimit)} exp ${dateShort(gs.expiryDate)}` : "none"}
                    approvedLimit={x.approvedLimit}
                    maxTenorDays={x.maxTenorDays}
                    selected={x.obligorId === groupId}
                    canEdit={canEdit}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Box 3: obligor entities under the selected group */}
      <div className="panel">
        <h2>Eligible obligor entities under {group?.name ?? "—"}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={th}>Obligor entity</th>
                <th style={th}>CDL</th>
                <th style={th}>Booking CDL</th>
                <th style={th}>Domicile</th>
                <th style={th}>Borrower rating</th>
                <th style={th}>Insurance</th>
                <th style={th}>PCG</th>
                {canEdit && <th style={th}>&nbsp;</th>}
              </tr>
            </thead>
            <tbody>
              {group && obligorEntitiesOf(group.id).map((e) => (
                <EditObligorEntityRow
                  key={e.id}
                  entity={{
                    id: e.id, name: e.name, cdl: e.cdl, bookingCdl: e.bookingCdl, domicile: e.domicile,
                    borrowerRating: e.borrowerRating, borrowerRatingExpiry: e.borrowerRatingExpiry,
                    insurancePolicyId: e.insurancePolicyId, insuranceExpiry: e.insuranceExpiry,
                    insurerName: e.insurancePolicyId ? getInsurancePolicy(e.insurancePolicyId)?.insurerName : undefined,
                    pcg: e.pcg, pcgExpiry: e.pcgExpiry, pcgLimit: e.pcgLimit,
                  }}
                  countries={countries}
                  policies={policies}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full editable limit register (moved here from its own tab) */}
      <h2 className="page-title" style={{ fontSize: 20, marginTop: 8 }}>Limit register</h2>
      <p className="page-sub">
        Every limit the engine checks against — seller line, ASR, RRL, obligor,
        swingline, investor, and insurance. Inline-editable (amount, max tenor,
        expiry, status) with CHANGE_LIMIT; edits feed the eligibility engine and
        every exposure view. Available capacity is always derived, never stored.
      </p>
      <LimitRegister />

      {/* Parent Company Guarantees — track/edit across all sellers and obligors */}
      <h2 className="page-title" style={{ fontSize: 20, marginTop: 8 }}>Parent Company Guarantees</h2>
      <p className="page-sub">
        Record a parent company guarantee against any seller and/or obligor — parent name, the
        seller and obligor it supports, the obligor covered, guarantee limit, and an expiry date or a
        continuing unconditional (indefinite) guarantee. Dated guarantees flow into the Expirations tab.
      </p>
      <PcgRegister
        pcgs={listParentGuarantees()}
        sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
        obligors={allObligors().map((o) => ({ id: o.id, name: o.name }))}
        canEdit={canEdit}
      />

      {canEdit && (
        <>
          <h2 className="page-title" style={{ fontSize: 20, marginTop: 8, color: "var(--red)" }}>Danger zone</h2>
          <ResetExposure />
        </>
      )}
    </>
  );
}

