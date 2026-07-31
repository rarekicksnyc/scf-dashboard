import { NextResponse } from "next/server";
import { renderInvoicePdf, type InvoiceLineItem } from "@/lib/pdf";
import { additionalInterestInvoiceSpec, adHocInvoiceSpec } from "@/lib/invoicegen";
import { getCurrentUser, roleHas } from "@/lib/auth";
import { addAudit } from "@/lib/data/store";

// A short, human-readable invoice number: INV-YYYYMMDD-XXXX.
function invoiceNumber(): string {
  const now = new Date();
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = String(now.getTime() % 10000).padStart(4, "0");
  return `INV-${day}-${suffix}`;
}

// Generate a client invoice as a downloadable PDF. Two kinds:
//  - additional-interest: auto-built from a past-due receivable (same discount
//    math, original margin + base rate).
//  - ad-hoc: a client-requested invoice from a filled line-item table.
// Gated by CHANGE_LIMIT (Portfolio Manager & Administrator).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CHANGE_LIMIT")) {
    return NextResponse.json({ error: `Role ${user.role} is not permitted to issue invoices.` }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  const number = invoiceNumber();
  const asOf = String(body.asOf || new Date().toISOString().slice(0, 10));

  let spec;
  if (kind === "additional-interest") {
    spec = additionalInterestInvoiceSpec(String(body.txnId ?? ""), asOf, number);
    if (!spec) return NextResponse.json({ error: "This receivable is not past due — no additional interest to bill." }, { status: 400 });
  } else if (kind === "ad-hoc") {
    const lineItems: InvoiceLineItem[] = (Array.isArray(body.lineItems) ? body.lineItems : [])
      .map((l: { description?: string; amount?: number | string }) => ({ description: String(l.description ?? "").trim(), amount: Number(l.amount) || 0 }))
      .filter((l: InvoiceLineItem) => l.description && l.amount > 0);
    if (!String(body.billToName ?? "").trim()) return NextResponse.json({ error: "A bill-to name is required." }, { status: 400 });
    if (lineItems.length === 0) return NextResponse.json({ error: "Add at least one line item with a description and amount." }, { status: 400 });
    spec = adHocInvoiceSpec({
      invoiceNumber: number,
      date: asOf,
      dueDate: body.dueDate || undefined,
      billToName: String(body.billToName).trim(),
      billToLines: Array.isArray(body.billToLines) ? body.billToLines.map(String) : undefined,
      lineItems,
      notes: body.notes ? String(body.notes) : undefined,
      sellerId: body.sellerId || undefined,
    });
  } else {
    return NextResponse.json({ error: `Unknown invoice kind '${kind}'.` }, { status: 400 });
  }

  const total = spec.lineItems.reduce((a, l) => a + l.amount, 0);
  addAudit({
    actorUserId: user.id, actorName: user.name, action: "INVOICE_GENERATE",
    entityType: "INVOICE", entityId: number,
    detail: `Generated ${kind} invoice ${number} for ${spec.billToName} (${spec.lineItems.length} line item(s)).`,
  });

  const bytes = await renderInvoicePdf(spec);
  void total;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${number}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
