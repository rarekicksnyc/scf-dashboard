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

export const DEFAULT_TEMPLATES: DocTemplate[] = [
  { id: "TMPL-PURCHASE_REQUEST", type: "PURCHASE_REQUEST", body: PURCHASE_REQUEST },
  { id: "TMPL-COMMITMENT_REQUEST", type: "COMMITMENT_REQUEST", body: COMMITMENT_REQUEST },
  { id: "TMPL-CLIENT_EMAIL", type: "CLIENT_EMAIL", subject: "Execution required — {{document_name}} for {{obligor}}", body: CLIENT_EMAIL },
  { id: "TMPL-BOOKING_EMAIL", type: "BOOKING_EMAIL", subject: "Book transaction — {{seller}} / {{obligor}} {{primary_amount}}", body: BOOKING_EMAIL },
];
