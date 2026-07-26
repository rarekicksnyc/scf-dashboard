import type { DocTemplate } from "@/lib/types";

// Default document + email templates. Editable on the platform (a seller-specific
// copy overrides the default). {{placeholders}} are filled per transaction.
// Available tokens: seller, obligor, obligor_entity, reference, currency,
// invoice_amount, advance_rate, coverage, committed_amount, value_date,
// maturity_date, commitment_due_date, final_demand_date, pricing_bps,
// product_type, today, booking_team.

const PURCHASE_REQUEST = `PURCHASE REQUEST

Date: {{today}}
Seller: {{seller}}
Obligor (Buyer): {{obligor}}
Reference: {{reference}}

We hereby request the purchase of the following receivable(s) under the Receivables Purchase Agreement:

Currency: {{currency}}
Invoice / Face Amount: {{invoice_amount}}
Advance Rate: {{advance_rate}}
Purchase (Coverage) Amount: {{coverage}}
Value Date: {{value_date}}
Maturity Date: {{maturity_date}}
Discount Margin: {{pricing_bps}} bps

This request is subject to the terms of the governing Receivables Purchase Agreement.

Authorized Signatory: ______________________________
Name / Title: ______________________________
Date: ______________________________`;

const COMMITMENT_REQUEST = `COMMITMENT REQUEST

Date: {{today}}
Seller: {{seller}}
Obligor (Buyer): {{obligor}}
Reference: {{reference}}

We hereby request a commitment to purchase under the Uncommitted Trade Receivables (UTRC) facility:

Currency: {{currency}}
Committed Amount: {{committed_amount}}
Commitment Date: {{value_date}}
Commitment Due Date: {{commitment_due_date}}
Final Permitted Demand Date: {{final_demand_date}}
Commitment Fee Margin: {{pricing_bps}} bps

This request is subject to the terms of the governing facility agreement.

Authorized Signatory: ______________________________
Name / Title: ______________________________
Date: ______________________________`;

const CLIENT_EMAIL = `Dear {{seller}} team,

Please find attached the {{document_name}} and Schedule A for the following transaction:

  Obligor: {{obligor}}
  Amount: {{primary_amount}}
  Value Date: {{value_date}}

Kindly review, execute the {{document_name}} with an authorized signatory, and return the signed copy at your earliest convenience.

Please reply to this email with the executed document attached.

Best regards,
Supply Chain Finance Team`;

const BOOKING_EMAIL = `Booking / Funding Team,

Please book the following transaction. The executed {{document_name}} and Schedule A are attached.

  Seller: {{seller}}
  Obligor: {{obligor}}
  Product: {{product_type}}
  Amount: {{primary_amount}}
  Value Date: {{value_date}}
  Maturity / Final Demand: {{maturity_date}}
  Margin: {{pricing_bps}} bps

The document has been executed by an authorized signatory and the signature verified.

Thank you,
Supply Chain Finance Team`;

// Schedule A column specs — one column per line, "Header|token". Editable per
// seller so each seller's Schedule A can differ. Available tokens are the deal
// tokens (seller, obligor, reference, currency, invoice_amount, advance_rate,
// coverage, base_rate, pricing_bps, discount_rate, discount, purchase_price,
// value_date, maturity_date, committed_amount, commitment_due_date,
// final_demand_date, commitment_fee, revenue).
const SCHEDULE_A_DTR = `Seller|seller
Obligor|obligor
Reference|reference
Currency|currency
Invoice amount|invoice_amount
Advance rate|advance_rate
Coverage amount|coverage
Base rate|base_rate
Margin (bps)|pricing_bps
Discount rate|discount_rate
Discount|discount
Purchase price|purchase_price
Value date|value_date
Maturity date|maturity_date`;

// Investor Schedule A — the investor portion only, priced at the interpolated
// SOFR + (margin − skim). Sent separately to the investor.
const SCHEDULE_A_INVESTOR = `Investor|investor_name
Seller|seller
Obligor|obligor
Reference|reference
Currency|currency
Investor amount|investor_amount
Interpolated SOFR|investor_base
Skim (bps)|skim_bps
Investor margin|investor_margin
Investor rate|investor_rate
Discount|investor_discount
Purchase price|investor_purchase_price
Value date|value_date
Maturity date|maturity_date`;

const SCHEDULE_A_UTRC = `Seller|seller
Obligor|obligor
Reference|reference
Currency|currency
Committed amount|committed_amount
Commitment date|value_date
Commitment due date|commitment_due_date
Final permitted demand date|final_demand_date
Margin (bps)|pricing_bps
Commitment fee|commitment_fee`;

export const DEFAULT_TEMPLATES: DocTemplate[] = [
  { id: "TMPL-PURCHASE_REQUEST", type: "PURCHASE_REQUEST", body: PURCHASE_REQUEST },
  { id: "TMPL-COMMITMENT_REQUEST", type: "COMMITMENT_REQUEST", body: COMMITMENT_REQUEST },
  { id: "TMPL-SCHEDULE_A_DTR", type: "SCHEDULE_A_DTR", body: SCHEDULE_A_DTR },
  { id: "TMPL-SCHEDULE_A_UTRC", type: "SCHEDULE_A_UTRC", body: SCHEDULE_A_UTRC },
  { id: "TMPL-SCHEDULE_A_INVESTOR", type: "SCHEDULE_A_INVESTOR", body: SCHEDULE_A_INVESTOR },
  { id: "TMPL-CLIENT_EMAIL", type: "CLIENT_EMAIL", subject: "Execution required — {{document_name}} for {{obligor}}", body: CLIENT_EMAIL },
  { id: "TMPL-BOOKING_EMAIL", type: "BOOKING_EMAIL", subject: "Book transaction — {{seller}} / {{obligor}} {{primary_amount}}", body: BOOKING_EMAIL },
];
