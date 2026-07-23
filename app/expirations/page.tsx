import { buildExpirations, expiryCounts } from "@/lib/expirations";
import type { ExpiryFlag } from "@/lib/expirations";

export const dynamic = "force-dynamic";

const FLAG_BADGE: Record<ExpiryFlag, { cls: string; label: string }> = {
  EXPIRED: { cls: "red", label: "Expired" },
  WITHIN_30: { cls: "orange", label: "≤ 30 days" },
  WITHIN_60: { cls: "yellow", label: "≤ 60 days" },
  OK: { cls: "grey", label: "OK" },
};

export default function ExpirationsPage() {
  const asOf = new Date().toISOString().slice(0, 10);
  const all = buildExpirations(asOf);
  const flagged = all.filter((i) => i.flag !== "OK");
  const counts = expiryCounts(all);

  return (
    <>
      <h1 className="page-title">Expirations</h1>
      <p className="page-sub">
        Every limit and dated field across the book — seller lines, obligor lines,
        swinglines, RRL and RRL swinglines, ASR and borrower ratings, obligor
        group approvals, obligor entity credentials, insurance policies, and parent
        company guarantees. Flagged at 60 days and 30 days before expiry, and once
        expired. As of {asOf}.
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">Expired</div>
          <div className="value" style={{ color: "var(--red)" }}>{counts.expired}</div>
        </div>
        <div className="card">
          <div className="label">Within 30 days</div>
          <div className="value" style={{ color: "var(--orange)" }}>{counts.within30}</div>
        </div>
        <div className="card">
          <div className="label">Within 60 days</div>
          <div className="value" style={{ color: "var(--yellow)" }}>{counts.within60}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Flagged items ({flagged.length})</h2>
        {flagged.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            Nothing expiring within 60 days.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Entity</th>
                  <th>Detail</th>
                  <th>Expiry date</th>
                  <th className="num">Days</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((i, idx) => {
                  const b = FLAG_BADGE[i.flag];
                  return (
                    <tr key={idx}>
                      <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                      <td>{i.kind}</td>
                      <td><code style={{ fontSize: 12 }}>{i.ref}</code></td>
                      <td>{i.entity}</td>
                      <td className="muted">{i.detail}</td>
                      <td>{i.expiryDate}</td>
                      <td className="num">
                        {i.daysToExpiry < 0 ? `${-i.daysToExpiry}d ago` : `${i.daysToExpiry}d`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>All tracked dates ({all.length})</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Flag</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Entity</th>
                <th>Detail</th>
                <th>Expiry date</th>
                <th className="num">Days</th>
              </tr>
            </thead>
            <tbody>
              {all.map((i, idx) => {
                const b = FLAG_BADGE[i.flag];
                return (
                  <tr key={idx}>
                    <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                    <td>{i.kind}</td>
                    <td><code style={{ fontSize: 12 }}>{i.ref}</code></td>
                    <td>{i.entity}</td>
                    <td className="muted">{i.detail}</td>
                    <td>{i.expiryDate || "—"}</td>
                    <td className="num">
                      {!isFinite(i.daysToExpiry) ? "—" : i.daysToExpiry < 0 ? `${-i.daysToExpiry}d ago` : `${i.daysToExpiry}d`}
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
