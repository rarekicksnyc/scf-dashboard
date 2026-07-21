import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeller, findLimit, viewLimit } from "@/lib/data/store";
import { mm, pct } from "@/lib/format";
import EntityDetail from "../../entity/EntityDetail";

export const dynamic = "force-dynamic";

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = getSeller(id);
  if (!seller) notFound();

  const sl = findLimit("SELLER", id);
  const view = sl ? viewLimit(sl) : undefined;

  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <Link href="/" className="muted" style={{ fontSize: 13 }}>← Portfolio</Link>
      </div>
      <h1 className="page-title">{seller.name}</h1>
      <p className="page-sub">
        Seller · CDL <code>{seller.cdl}</code> · ASR {seller.asrRating} ·{" "}
        {view ? (
          <>
            limit {mm(view.approvedLimit)} · available {mm(view.available)} ({pct(view.utilizationPct)} used)
          </>
        ) : (
          "no seller limit"
        )}
      </p>

      <EntityDetail mode="SELLER" id={id} />
    </>
  );
}
