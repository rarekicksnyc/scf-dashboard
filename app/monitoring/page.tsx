import { allCountries, domicileExceptions } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import CountryRegister from "./CountryRegister";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const countries = allCountries();
  const exceptions = domicileExceptions();
  const canEdit = await currentUserCan("CHANGE_LIMIT");

  return (
    <>
      <h1 className="page-title">Monitoring</h1>
      <p className="page-sub">
        Enforceability and domicile monitoring. Entities domiciled in a
        non-eligible country are flagged here.
      </p>

      <div className="panel">
        <h2>Domicile exceptions ({exceptions.length})</h2>
        {exceptions.length === 0 ? (
          <div style={{ padding: 18 }} className="muted">
            No entities are domiciled in a non-eligible country.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Domicile</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((e, i) => (
                  <tr key={i}>
                    <td><span className="badge red">Enforceability</span></td>
                    <td>{e.kind}</td>
                    <td>{e.name}</td>
                    <td>{e.domicile}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CountryRegister countries={countries} canEdit={canEdit} />
    </>
  );
}
