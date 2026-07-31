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
  listSignatories,
  getSettings,
  recordRev,
} from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm, dateShort } from "@/lib/format";
import LimitRegister from "./LimitRegister";
import AddToRegistry from "./AddToRegistry";
import SellerFacilityPicker from "./SellerFacilityPicker";
import SwinglineAdjustment from "./SwinglineAdjustment";
import EditSellerEntityRow from "./EditSellerEntityRow";
import EditObligorEntityRow from "./EditObligorEntityRow";
import ObligorGroupsTable from "./ObligorGroupsTable";
import DeleteSellerButton from "./DeleteSellerButton";
import EditSellerFacility from "./EditSellerFacility";
import SignatoryManager from "./SignatoryManager";
import BookingRecipients from "./BookingRecipients";
import AddObligorToFacility from "./AddObligorToFacility";
import PcgRegister from "./PcgRegister";
import InsurancePolicies from "./InsurancePolicies";
import ResetExposure from "./ResetExposure";
import Collapsible from "../Collapsible";

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
        {canEdit ? (
          <>The control center for every feed — add new sellers, obligors, limits
          (seller, ASR, obligor, swingline, RRL, RRL swingline, investor, insurance),
          and ASR sublimits, and edit every facility, entity, and limit inline. All
          changes take effect immediately, feed the eligibility engine, and are audited.</>
        ) : (
          <>A read-only view of every feed the eligibility engine uses — sellers,
          obligors, limits, entities, ASR sublimits, guarantees, and signatories.
          Editing requires the Change limit permission.</>
        )}
      </p>

      <Collapsible summary="Booking / funding-team email recipients">
        <BookingRecipients value={getSettings().bookingTeamEmails ?? ""} canEdit={canEdit} />
      </Collapsible>

      {canEdit && (
        <Collapsible summary="Add to register — new seller/obligor group, entity, limit, ASR sublimit, or bulk upload">
          <AddToRegistry
            sellers={sellers.map((s) => ({ id: s.id, name: s.name, cdl: s.cdl }))}
            obligors={allObligors().map((o) => ({ id: o.id, name: o.name, cdl: o.cdl }))}
            investors={activeInvestors().map((i) => ({ id: i.id, name: i.name }))}
            policies={activePolicies().map((p) => ({ id: p.id, name: `${p.insurerName} · ${p.policyNumber}` }))}
          />
        </Collapsible>
      )}

      {canBook && (
        <Collapsible summary="Swingline adjustment (seller, obligor, or RRL)">
          <SwinglineAdjustment
            sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
            obligors={allObligors().map((o) => ({ id: o.id, name: o.name }))}
            rrlSwlSellers={rrlSwlSellers}
            canBook={canBook}
          />
        </Collapsible>
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
              contactEmail: seller.contactEmail ?? "",
            }}
            limits={[
              sellerLimit
                ? { key: "Seller line", id: sellerLimit.id, approvedLimit: sellerLimit.approvedLimit, expiryDate: sellerLimit.expiryDate, rev: recordRev(`limit:${sellerLimit.id}`) }
                : { key: "Seller line", note: "—" },
              swl
                ? { key: "Swingline", id: swl.id, approvedLimit: swl.approvedLimit, expiryDate: swl.expiryDate, rev: recordRev(`limit:${swl.id}`) }
                : { key: "Swingline", createType: "SWINGLINE", entityId: seller!.id, cdl: seller!.cdl, maxTenorDays: 45 },
              rrl
                ? { key: "RRL", id: rrl.id, approvedLimit: rrl.approvedLimit, expiryDate: rrl.expiryDate, rev: recordRev(`limit:${rrl.id}`) }
                : { key: "RRL", createType: "RRL", entityId: seller!.id, cdl: seller!.cdl, maxTenorDays: 150 },
              rrlSwl
                ? { key: "RRL swingline", id: rrlSwl.id, approvedLimit: rrlSwl.approvedLimit, expiryDate: rrlSwl.expiryDate, rev: recordRev(`limit:${rrlSwl.id}`) }
                : { key: "RRL swingline", createType: "RRL_SWINGLINE", entityId: seller!.id, cdl: seller!.cdl, maxTenorDays: 45 },
            ]}
            canEdit={canEdit}
            rev={recordRev(`seller:${seller.id}`)}
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
                  rev={recordRev(`sellerEntity:${e.id}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {seller && (
        <Collapsible summary={`Authorized signatories — ${seller.name} (${listSignatories(seller.id).length})`}>
          <SignatoryManager
            sellerId={seller.id}
            sellerName={seller.name}
            entities={sellerEntitiesOf(seller.id).map((e) => ({ id: e.id, name: e.name }))}
            signatories={listSignatories(seller.id).map((s) => ({ id: s.id, entityId: s.entityId, name: s.name, title: s.title, signingLimit: s.signingLimit }))}
            canEdit={canEdit}
          />
        </Collapsible>
      )}

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
            sellerLimit={sellerLimit?.approvedLimit}
            obligorLimits={Object.fromEntries(allObligors().map((o) => [o.id, findLimit("OBLIGOR", o.id)?.approvedLimit ?? 0]))}
          />
        )}
        <ObligorGroupsTable
          rows={asrObligors.map((x) => {
            const o = getObligor(x.obligorId);
            const gl = findLimit("OBLIGOR", x.obligorId);
            const gs = findLimit("SWINGLINE", x.obligorId);
            return {
              sellerId: sellerId!,
              group: { id: x.obligorId, name: o?.name ?? x.obligorId },
              globalLimit: gl ? mm(gl.approvedLimit) : "—",
              groupExpiry: o?.expiryDate ?? "",
              groupSwingline: gs ? `${mm(gs.approvedLimit)} exp ${dateShort(gs.expiryDate)}` : "none",
              approvedLimit: x.approvedLimit,
              maxTenorDays: x.maxTenorDays,
              selected: x.obligorId === groupId,
              canEdit,
              subRev: recordRev(`asr:${sellerId}:${x.obligorId}`),
              groupRev: recordRev(`obligor:${x.obligorId}`),
            };
          })}
        />
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
                  rev={recordRev(`obligorEntity:${e.id}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full editable limit register (collapsed to keep the page light) */}
      <div style={{ marginTop: 8 }}>
        <Collapsible summary="Limit register — every limit the engine checks (seller, ASR, RRL, obligor, swingline, investor, insurance), inline-editable">
          <LimitRegister />
        </Collapsible>
      </div>

      {/* Parent Company Guarantees */}
      <div style={{ marginTop: 8 }}>
        <Collapsible summary={`Parent Company Guarantees (${listParentGuarantees().length}) — parent, seller/obligor supported, limit, expiry or continuing`}>
          <PcgRegister
            pcgs={listParentGuarantees()}
            sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
            obligors={allObligors().map((o) => ({ id: o.id, name: o.name }))}
            canEdit={canEdit}
            revs={Object.fromEntries(listParentGuarantees().map((p) => [p.id, recordRev(`pcg:${p.id}`)]))}
          />
        </Collapsible>
      </div>

      {/* Insurance policies — set each policy's annual minimum premium in-app */}
      <div style={{ marginTop: 8 }}>
        <Collapsible summary={`Insurance policies (${activePolicies().length}) — annual minimum premium per policy`}>
          <InsurancePolicies
            policies={activePolicies().map((p) => ({
              id: p.id,
              insurerName: p.insurerName,
              policyNumber: p.policyNumber,
              coveragePercent: p.coveragePercent,
              limitSize: findLimit("INSURANCE", p.id)?.approvedLimit ?? 0,
              minimumPremium: p.minimumPremium ?? 0,
              rev: recordRev(`policy:${p.id}`),
            }))}
            canEdit={canEdit}
          />
        </Collapsible>
      </div>

      {canEdit && (
        <div style={{ marginTop: 8 }}>
          <Collapsible summary="Danger zone — reset all exposure to full availability">
            <ResetExposure />
          </Collapsible>
        </div>
      )}
    </>
  );
}

