import Link from "next/link";
import {
  allSellers,
  getSeller,
  sellerEntitiesOf,
  findLimit,
  sellerObligorLimitsForSeller,
  getObligor,
  obligorEntitiesOf,
  getInsurancePolicy,
  allCountries,
  activePolicies,
} from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm, dateShort } from "@/lib/format";
import LimitRegister from "../limits/LimitRegister";
import EditSellerEntityRow from "./EditSellerEntityRow";
import EditObligorEntityRow from "./EditObligorEntityRow";
import EditAsrSublimitRow from "./EditAsrSublimitRow";

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
  const asrObligors = seller ? sellerObligorLimitsForSeller(seller.id) : [];

  const groupId = groupParam && asrObligors.some((x) => x.obligorId === groupParam)
    ? groupParam
    : asrObligors[0]?.obligorId;
  const group = groupId ? getObligor(groupId) : undefined;
  const groupLimit = groupId ? findLimit("OBLIGOR", groupId) : undefined;
  const groupSwl = groupId ? findLimit("SWINGLINE", groupId) : undefined;

  const canEdit = await currentUserCan("CHANGE_LIMIT");
  const countries = allCountries().map((c) => ({ code: c.code, name: c.name }));
  const policies = activePolicies().map((p) => ({ id: p.id, name: `${p.insurerName} · ${p.policyNumber}` }));

  const th = { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.03em" };

  return (
    <>
      <h1 className="page-title">Data Management</h1>
      <p className="page-sub">
        One screen to review every input for a seller facility, its eligible
        entities, the obligor groups under its ASR, and each group&rsquo;s obligor
        entities. Use the dropdowns to navigate. Editing hooks into the Limit
        Register, Setup, and registry screens.
      </p>

      <div className="row-actions">
        <span style={{ fontSize: 13, fontWeight: 600 }}>Seller facility:</span>
        {sellers.map((s) => (
          <Link
            key={s.id}
            href={`/data?seller=${s.id}`}
            className={`tab ${s.id === sellerId ? "on" : ""}`}
            style={{ padding: "6px 12px" }}
          >
            {s.name}
          </Link>
        ))}
      </div>

      {/* Box 1: seller facility + eligible seller entities */}
      <div className="panel">
        <h2>{seller?.name} — facility &amp; eligible seller entities</h2>
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, fontSize: 13 }}>
          <Field label="Seller line" value={sellerLimit ? `${mm(sellerLimit.approvedLimit)} (exp ${dateShort(sellerLimit.expiryDate)})` : "—"} />
          <Field label="ASR rating" value={seller ? `${seller.asrRating} (exp ${dateShort(seller.asrExpiry)})` : "—"} />
          <Field label="Swingline" value={swl ? `${mm(swl.approvedLimit)} (exp ${dateShort(swl.expiryDate)})` : "none"} />
          <Field label="RRL" value={rrl ? `${mm(rrl.approvedLimit)} (exp ${dateShort(rrl.expiryDate)})` : "N/A"} />
          <Field label="Borrower rating" value={seller ? `${seller.borrowerRating} (exp ${dateShort(seller.borrowerRatingExpiry)})` : "—"} />
          <Field label="GCARS #" value={seller?.gcarsNumber || "—"} />
        </div>
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
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={th}>Obligor group</th>
                <th style={th} className="num">Global limit</th>
                <th style={th} className="num">ASR sublimit</th>
                <th style={th} className="num">Max tenor</th>
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
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
