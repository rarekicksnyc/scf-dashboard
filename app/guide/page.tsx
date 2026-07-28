import { rolePermissionMap } from "@/lib/data/store";
import { ROLE_LABEL, ALL_ROLES, ALL_PERMISSIONS, PERMISSION_LABEL, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// In-app operations guide for the bank team — what the tool does, the end-to-end
// flow, a per-screen reference, a glossary, and the live role/permission matrix.
// The matrix is read from the same role map the app enforces (single source), so
// this page can never drift from the real permissions.

const PRINCIPLES: [string, string][] = [
  ["Single source of truth", "Capacity is always derived, never stored. Every screen reads the one set of limits, reservations, and booked receivables, so two places can never disagree."],
  ["Revenue is margin only", "The base rate (COF or SOFR) is MUFG's funding cost, not income. Revenue is the margin, earned daily over each deal's tenor. Skim on investor participations is extra income and is tracked in Revenue but never shown to the investor."],
  ["One receivables ledger", "A deal booked from the Transaction Flow and a funded batch invoice both land in the one Receivables ledger. Exposure, revenue, settlement, and aging all derive from that single place."],
  ["Four eyes on exceptions", "Anything that breaches a control — a batch exception or a single-deal booking exception — needs a second authorized user to approve. No one can approve their own request."],
];

const FLOW: { step: string; detail: string }[] = [
  { step: "Reserve", detail: "Book a future discount on the Reservations page (the forward book). It is checked against live limits before it is accepted." },
  { step: "Check & proceed", detail: "On Transaction Flow, load the reservation, run every eligibility control at once, then proceed to the documents stage." },
  { step: "Document & execute", detail: "Generate the purchase/commitment request and Schedule A, email the client, and upload the executed document. The signer is checked against the authorized signatory list." },
  { step: "Book (four eyes if breached)", detail: "Eligibility is re-run at booking. A clean deal books in one click; a breach requires a documented reason and a second user's approval before it can be booked. Book on a T+1/T+2/T+3 basis — documents are executed now (execution date) and the funds go out a few business days later (funding date). The tenor is preserved (maturity = funding + tenor) and limits are consumed only from the funding date. Ops confirms once funds are sent (nothing further for the PM)." },
  { step: "Booking", detail: "The booked deal appears on the Bookings page as real outstanding exposure. Record collections (partial or full), track overdue and default, file insurance claims, and settle investor participations." },
  { step: "Additional interest & invoices", detail: "A past-due receivable shows indicative additional interest at the original all-in rate (margin + base). When the client confirms it will repay, accrue it all at once (it freezes at that date), then generate a MUFG additional-interest statement, or an ad-hoc client invoice, as a downloadable PDF." },
];

const BATCH_FLOW = "Batches upload many invoices at once. Each is run through the same eligibility controls; funded invoices materialise into the one Receivables ledger, and any exception routes to the Exceptions screen for a checker to approve.";

const CONCURRENCY: [string, string][] = [
  ["One shared live book", "Everyone works on the same book on one server. The moment anyone books a deal, edits a limit, or records a collection, the change is saved for every user at once — there are no separate copies to reconcile."],
  ["Screens update on their own", "Each screen quietly checks for changes and refreshes itself within about fifteen seconds of anyone making one, so you are never looking at stale numbers. It pauses while a tab is in the background and never interrupts you mid-typing. You do not need to reload manually."],
  ["Edit-conflict protection", "If you and a colleague edit the same record the engine tests against — a limit, seller facility, obligor, ASR sublimit, eligible entity, parent guarantee, or country — at the same time, the second save is blocked with a “changed since you opened it” notice instead of silently overwriting the other person. Reload the latest and re-apply your change."],
  ["Every change is traceable", "The Audit log records who did what and when, so simultaneous activity across the desk is always accountable. Breaches additionally need a second approver (four eyes)."],
];

const SCREENS: [string, string][] = [
  ["Portfolio", "The book at a glance — limits, utilisation, and exposure as of any date."],
  ["Schedule", "Calendar of fundings and repayments across the forward book and live receivables."],
  ["Data management", "The single control centre — add and edit sellers, obligors, entities, limits (incl. inline credit-line amount/expiry and adding an RRL swingline), signatories, guarantees, and the country register. Concurrent edits to the same record are conflict-guarded."],
  ["Revenue", "Margin income plus skim, realized and pipeline, with accrual over tenor and a monthly view."],
  ["Reservations", "The forward book of future discounts and swingline movements."],
  ["Bookings", "The live book after funding — collections, overdue, default, claims, investor settlement, aging, concentration, and client invoicing."],
  ["Batches", "Bulk invoice upload (CSV/Excel), a downloadable template, or build a batch by hand in an editable table — then eligibility results. A batch is single-seller."],
  ["Transaction Flow", "A single deal from eligibility check through documents, execution, signature check, and booking."],
  ["Documents", "Editable document, Schedule A, email, and invoice templates (a per-seller copy overrides the default)."],
  ["Rate sheet", "COF and SOFR curves, and the short-tenor SOFR interpolator."],
  ["Expirations", "Ratings, limits, and approvals coming due."],
  ["Exceptions", "The maker-checker queue for batch breaches — a checker approves or rejects."],
  ["Enforceability", "Country register and any entity domiciled outside an eligible country."],
  ["Reports", "Exportable transaction and exposure reports — Product Manager and Administrator roles only."],
  ["Audit log", "Every action, who did it, and when."],
  ["Roles & access", "The role to permission map and user management."],
];

const GLOSSARY: [string, string][] = [
  ["DTR", "Discounted Trade Receivable — the bank buys the receivable at a discount (advance rate applied to the invoice face)."],
  ["UTRC", "Uncommitted Trade Receivables Commitment — a committed amount with a commitment fee, not a funded advance."],
  ["Coverage", "The funded (advance) amount that consumes limits: invoice face × advance rate."],
  ["Margin", "The spread MUFG earns over its funding cost, in basis points. This is the revenue."],
  ["Base rate", "MUFG's funding cost — COF (cost of funds) or SOFR. Passed through to the client, not income."],
  ["Skim", "On an investor participation, the slice of margin the bank keeps. Tracked as revenue, never shown to the investor."],
  ["ASR", "Asset Securitization. Two related uses: the ASR rating (an internal seller risk grade) and the ASR limit — the per seller/obligor approved sublimit and max tenor, checked like any other limit."],
  ["RRL", "Risk Reimbursement Line — a portion of a DTR advance booked on a separate seller line."],
  ["Swingline", "The current allocation of the global swingline limit across eligible branches and entities — a short-term core line drawn alongside the seller or obligor line for temporary funding."],
  ["PCG", "Parent Company Guarantee — a guarantee that supports a seller or obligor."],
  ["Recourse", "Whether an unpaid receivable can be charged back to the seller (recourse) or is retained by the bank (non-recourse)."],
  ["Time-phasing", "A reservation or receivable only consumes a limit while its value-to-maturity window overlaps the date being checked. An unsettled receivable stays live past maturity."],
  ["Additional interest", "Default interest on a past-due balance, at the original all-in rate (margin + base) over the overdue days, actual/360. Shown indicatively while past due; recognised (accrued) all at once when the client confirms it will repay, and frozen at that date."],
  ["Maker-checker", "Four-eyes control: the person who requests an exception cannot approve it — a second authorized user must."],
  ["Execution vs funding date", "Documents are executed on the execution date; the deal is funded on the funding date, n business days later (T+1/2/3). The tenor is preserved — maturity = funding date + tenor — exposure consumes limits only from the funding date, and Ops confirms once the funds are sent."],
];

export default async function GuidePage() {
  const roleMap = rolePermissionMap();
  // The guide is public for onboarding; when viewed without a session it renders
  // outside the app shell, so give the reader a way back to sign in.
  const loggedIn = Boolean(await getSessionUser());
  return (
    <>
      {!loggedIn && (
        <div style={{ marginBottom: 6 }}>
          <a href="/login" className="muted" style={{ fontSize: 13 }}>← Back to sign in</a>
        </div>
      )}
      <h1 className="page-title">Operations guide</h1>
      <p className="page-sub">
        How the platform works, the end-to-end flow, a reference for every screen,
        a glossary, and who can do what. Written for the desk and the operations
        team who run the book.
      </p>

      <div className="panel">
        <h2>Principles</h2>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          {PRINCIPLES.map(([t, d]) => (
            <div key={t}>
              <strong>{t}.</strong> <span className="muted">{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>End-to-end flow</h2>
        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          {FLOW.map((f, i) => (
            <div key={f.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ flex: "0 0 26px", height: 26, borderRadius: 13, background: "var(--brand)", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
              <div><strong>{f.step}.</strong> <span className="muted">{f.detail}</span></div>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 13, marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <strong style={{ color: "var(--ink)" }}>Batches.</strong> {BATCH_FLOW}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Working at the same time as others</h2>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          {CONCURRENCY.map(([t, d]) => (
            <div key={t}>
              <strong>{t}.</strong> <span className="muted">{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Screens</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Screen</th><th>What it does</th></tr></thead>
            <tbody>
              {SCREENS.map(([name, desc]) => (
                <tr key={name}><td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{name}</td><td className="muted">{desc}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Who can do what</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                {ALL_PERMISSIONS.map((p) => <th key={p} style={{ fontSize: 11 }}>{PERMISSION_LABEL[p]}</th>)}
              </tr>
            </thead>
            <tbody>
              {ALL_ROLES.map((role) => (
                <tr key={role}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{ROLE_LABEL[role]}</td>
                  {ALL_PERMISSIONS.map((p) => (
                    <td key={p} style={{ textAlign: "center" }}>
                      {(roleMap[role] ?? []).includes(p) ? <span style={{ color: "var(--green)" }}>●</span> : <span className="muted" style={{ opacity: 0.3 }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ padding: "0 16px 14px", fontSize: 12 }}>Edit these on the Roles &amp; access screen. Managing receivables, limits, and invoices requires Change limit; approving exceptions requires Approve exception.</div>
      </div>

      <div className="panel">
        <h2>Glossary</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
            <tbody>
              {GLOSSARY.map(([term, def]) => (
                <tr key={term}><td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{term}</td><td className="muted">{def}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
