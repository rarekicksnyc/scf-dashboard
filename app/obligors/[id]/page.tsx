import Link from "next/link";
import { notFound } from "next/navigation";
import { getObligor, findLimit, viewLimit, allCountries } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { mm, pct } from "@/lib/format";
import EntityDetail from "../../entity/EntityDetail";
import DeleteObligorButton from "./DeleteObligorButton";
import EditObligorGroup from "./EditObligorGroup";

export const dynamic = "force-dynamic";

export default async function ObligorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const obligor = getObligor(id);
  if (!obligor) notFound();

  const ol = findLimit("OBLIGOR", id);
  const view = ol ? viewLimit(ol) : undefined;
  const canEdit = await currentUserCan("CHANGE_LIMIT");

  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <Link href="/?tab=obligors" className="muted" style={{ fontSize: 13 }}>← Portfolio</Link>
      </div>
      <h1 className="page-title">{obligor.name}</h1>
      <p className="page-sub">
        Obligor · CDL <code>{obligor.cdl}</code> · {obligor.country} ·{" "}
        {view ? (
          <>
            master limit {mm(view.approvedLimit)} · available {mm(view.available)} ({pct(view.utilizationPct)} used)
          </>
        ) : (
          "no obligor limit"
        )}
      </p>

      {canEdit && <DeleteObligorButton obligorId={id} obligorName={obligor.name} />}

      {canEdit && (
        <EditObligorGroup
          obligor={{
            id: obligor.id,
            name: obligor.name,
            cdl: obligor.cdl,
            country: obligor.country,
            sector: obligor.sector,
            status: obligor.status,
            eligible: obligor.eligible,
            expiryDate: obligor.expiryDate ?? "",
            hasGuarantee: obligor.hasGuarantee,
            guaranteeEligible: obligor.guaranteeEligible,
          }}
          countries={allCountries().map((c) => ({ code: c.code, name: c.name }))}
        />
      )}

      <EntityDetail mode="OBLIGOR" id={id} />
    </>
  );
}
