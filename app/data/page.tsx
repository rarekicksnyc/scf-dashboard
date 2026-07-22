import Link from "next/link";
import {
  allSellers,
  getSeller,
  sellerEntitiesOf,
  findLimit,
  viewLimit,
  sellerObligorLimitsForSeller,
  getObligor,
  obligorEntitiesOf,
  getInsurancePolicy,
} from "@/lib/data/store";
import { mm, dateShort } from "@/lib/format";

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
          <Field label="Seller line" value={sellerLimit ? mm(viewLimit(sellerLimit).approvedLimit) : "—"} />
          <Field label="ASR rating" value={seller ? `${seller.asrRating} (exp ${dateShort(seller.asrExpiry)})` : "—"} />
          <Field label="Swingline" value={swl ? `${mm(swl.approvedLimit)} (exp ${dateShort(swl.expiryDate)})` : "none"} />
          <Field label="RRL" value={rrl ? mm(rrl.approvedLimit) : "N/A"} />
          <Field label="Borrower rating" value={seller ? `${seller.borrowerRating} (exp ${dateShort(seller.borrowerRatingExpiry)})` : "—"} />
          <Field label="GCARS #" value={seller?.gcarsNumber || "—"} />
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th style={th}>Eligible seller entity</th><th style={th}>CDL</th><th style={th}>Domicile</th></tr></thead>
            <tbody>
              {seller && sellerEntitiesOf(seller.id).map((e) => (
                <tr key={e.id}><td>{e.name}</td><td><code style={{ fontSize: 12 }}>{e.cdl}</code></td><td className="muted">{e.domicile}</td></tr>
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
                  <tr key={x.obligorId} style={{ background: x.obligorId === groupId ? "var(--brand-soft)" : undefined }}>
                    <td>{o?.name ?? x.obligorId}</td>
                    <td className="num">{gl ? mm(gl.approvedLimit) : "—"}</td>
                    <td className="num">{mm(x.approvedLimit)}</td>
                    <td className="num">{x.maxTenorDays}d</td>
                    <td className="muted">{gs ? `${mm(gs.approvedLimit)} exp ${dateShort(gs.expiryDate)}` : "none"}</td>
                    <td><Link href={`/data?seller=${sellerId}&group=${x.obligorId}`} style={{ color: "var(--brand)", fontWeight: 600 }}>view entities →</Link></td>
                  </tr>
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
              </tr>
            </thead>
            <tbody>
              {group && obligorEntitiesOf(group.id).map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td><code style={{ fontSize: 12 }}>{e.cdl}</code></td>
                  <td><code style={{ fontSize: 12 }}>{e.bookingCdl}</code></td>
                  <td className="muted">{e.domicile}</td>
                  <td>{e.borrowerRating} <span className="muted">exp {dateShort(e.borrowerRatingExpiry)}</span></td>
                  <td className="muted">{e.insurancePolicyId ? `${getInsurancePolicy(e.insurancePolicyId)?.insurerName} exp ${dateShort(e.insuranceExpiry ?? "")}` : "—"}</td>
                  <td>{e.pcg ?? "N/A"}{e.pcg === "Y" && e.pcgLimit ? ` · ${mm(e.pcgLimit)} exp ${dateShort(e.pcgExpiry ?? "")}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
