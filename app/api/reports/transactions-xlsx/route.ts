import { NextResponse } from "next/server";
import { fundedDeals } from "@/lib/deals";
import { getSeller, getObligor } from "@/lib/data/store";
import { currentUserCan } from "@/lib/auth";
import { xlsxResponse, type Cell } from "@/lib/xlsxexport";

// Formatted Excel export of the filtered transaction report. Filters are passed
// as query params so the download mirrors exactly what is on screen.
export async function GET(request: Request) {
  if (!(await currentUserCan("VIEW_REPORTS"))) {
    return NextResponse.json({ error: "Not permitted to view reports." }, { status: 403 });
  }

  const url = new URL(request.url);
  const sellerId = url.searchParams.get("sellerId") || undefined;
  const obligorId = url.searchParams.get("obligorId") || undefined;
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const basis = (url.searchParams.get("basis") || "value") as "booked" | "value" | "maturity";

  const basisDate = (d: { bookedDate: string; valueDate: string; maturityDate: string }) =>
    basis === "booked" ? d.bookedDate : basis === "maturity" ? d.maturityDate : d.valueDate;

  const deals = fundedDeals({ sellerId, obligorId }).filter((d) => {
    const dt = basisDate(d).slice(0, 10);
    if (from && dt < from) return false;
    if (to && dt > to) return false;
    return true;
  });

  const rows: Cell[][] = deals.map((d) => [
    d.invoiceNumber,
    getSeller(d.sellerId)?.name ?? d.sellerId,
    getObligor(d.obligorId)?.name ?? d.obligorId,
    Math.round(d.amount),
    Math.round(d.revenue),
    d.bookedDate.slice(0, 10),
    d.valueDate.slice(0, 10),
    d.maturityDate.slice(0, 10),
    d.batchId,
  ]);

  // Trailing total row.
  const totalAmount = deals.reduce((a, d) => a + d.amount, 0);
  const totalRevenue = deals.reduce((a, d) => a + d.revenue, 0);
  rows.push([`Total (${deals.length})`, "", "", Math.round(totalAmount), Math.round(totalRevenue), "", "", "", ""]);

  return xlsxResponse(
    "transactions.xlsx",
    "Transactions",
    [
      { header: "Invoice", width: 18 },
      { header: "Seller", width: 32 },
      { header: "Obligor", width: 32 },
      { header: "Amount (USD)", width: 16 },
      { header: "Revenue (USD)", width: 16 },
      { header: "Booked", width: 12 },
      { header: "Value date", width: 12 },
      { header: "Maturity", width: 12 },
      { header: "Batch", width: 14 },
    ],
    rows,
  );
}
