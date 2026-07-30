import { currentUserCan } from "@/lib/auth";
import {
  listCustomFields, listCustomRegisters, listKpiTiles, listWatchRules, recordRev,
} from "@/lib/data/store";
import { computeKpis, evaluateWatchRule } from "@/lib/creator/run";
import { KPI_FIELDS, DEAL_FIELDS, SELLER_FIELDS, OBLIGOR_FIELDS } from "@/lib/creator/surface";
import CreatorConsole from "./CreatorConsole";

export const dynamic = "force-dynamic";

export default async function CreatorPage() {
  if (!(await currentUserCan("CREATOR_MODE"))) {
    return (
      <>
        <h1 className="page-title">Creator mode</h1>
        <div style={{ padding: "12px 14px", background: "#f0f4fa", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--ink-soft)" }}>
          Creator mode is limited to the Portfolio Manager and Administrator roles. Ask an
          administrator to grant your role Creator mode on the Roles &amp; access screen.
        </div>
      </>
    );
  }

  const fields = listCustomFields();
  const registers = listCustomRegisters();
  const kpis = listKpiTiles();
  const rules = listWatchRules();
  const rev = (r: string, id: string) => recordRev(`creator:${r}:${id}`);

  return (
    <>
      <h1 className="page-title">Creator mode</h1>
      <p className="page-sub">
        Extend the platform with governed configuration — no code, no redeploys. Add custom
        fields and reference registers, build KPI tiles from a safe formula, and set advisory
        watch rules over the live book. Every change is validated, audited, and reversible.
        Definitions are data interpreted by a fixed engine; nothing here can change the ledger
        or a control.
      </p>
      <CreatorConsole
        fields={fields.map((f) => ({ ...f, rev: rev("field", f.id) }))}
        registers={registers.map((r) => ({ ...r, rev: rev("register", r.id) }))}
        kpis={kpis.map((t) => ({ tile: { ...t, rev: rev("kpi", t.id) }, result: computeKpis([t])[0] }))}
        rules={rules.map((r) => ({ rule: { ...r, rev: rev("watchRule", r.id) }, result: evaluateWatchRule(r) }))}
        catalog={{
          kpi: KPI_FIELDS,
          DEAL: DEAL_FIELDS,
          SELLER: SELLER_FIELDS,
          OBLIGOR: OBLIGOR_FIELDS,
        }}
      />
    </>
  );
}
