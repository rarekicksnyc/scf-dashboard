import { getRates } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { dateShort } from "@/lib/format";
import RateUpload from "./RateUpload";
import SofrRefresh from "./SofrRefresh";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const rates = getRates();
  const canEdit = await currentUserCan("CHANGE_LIMIT");

  return (
    <>
      <h1 className="page-title">Rate Sheet</h1>
      <p className="page-sub">
        SOFR is pulled live from the official New York Fed public feed; other
        curves (COF) are uploaded as a rate sheet. The offer is the used rate;
        transactions resolve their base rate by rate type and closest tenor.
      </p>

      {canEdit && <SofrRefresh />}
      {canEdit && <RateUpload />}

      <div className="panel">
        <h2>Rates ({rates.length})</h2>
        {rates.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">No rates loaded.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Value date</th>
                  <th>Maturity</th>
                  <th className="num">Tenor</th>
                  <th className="num">Bid</th>
                  <th className="num">Offer (used)</th>
                  <th className="num">Calc rate</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r, i) => (
                  <tr key={i}>
                    <td><span className="badge grey">{r.rateType}</span></td>
                    <td>{dateShort(r.startDate)}</td>
                    <td>{dateShort(r.maturityDate)}</td>
                    <td className="num">{r.tenorDays}d</td>
                    <td className="num">{r.bid.toFixed(2)}%</td>
                    <td className="num" style={{ fontWeight: 700 }}>{r.offer.toFixed(2)}%</td>
                    <td className="num">{r.calcRate != null ? `${r.calcRate.toFixed(2)}%` : "—"}</td>
                    <td>{r.error ? <span className="badge red">{r.error}</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
