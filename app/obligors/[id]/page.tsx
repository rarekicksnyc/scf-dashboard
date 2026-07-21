import Link from "next/link";
import { notFound } from "next/navigation";
import { getObligor, findLimit, viewLimit } from "@/lib/data/store";
import { mm, pct } from "@/lib/format";
import EntityDetail from "../../entity/EntityDetail";

export const dynamic = "force-dynamic";

export default async function ObligorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const obligor = getObligor(id);
  if (!obligor) notFound();

  const ol = findLimit("OBLIGOR", id);
  const view = ol ? viewLimit(ol) : undefined;

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

      <EntityDetail mode="OBLIGOR" id={id} />
    </>
  );
}
