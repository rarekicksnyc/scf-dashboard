import { store } from "@/lib/data/store";
import { registerCollection } from "@/lib/data/repositories/collectionRepo";

// Registers the reference/config store collections for write-through persistence
// (MIGRATION_PLAN.md Phase 3). These are bounded, low-write domains — proven safe
// to migrate first. The growing transactional collections (limits, utilizations,
// booked transactions, batches, reservations) follow in Phases 4-5 after the
// per-row path is verified against the live database.
//
// Idempotent: registerCollection ignores a duplicate name, so calling this more
// than once is harmless.
let done = false;

export function registerReferenceCollections(): void {
  if (done) return;
  done = true;

  const c = registerCollection;

  // Facilities / counterparties.
  c({ name: "programs", keyOf: (r) => r.id, get: () => store.programs, set: (rows) => { store.programs = rows; } });
  c({ name: "sellers", keyOf: (r) => r.id, get: () => store.sellers, set: (rows) => { store.sellers = rows; } });
  c({ name: "obligors", keyOf: (r) => r.id, get: () => store.obligors, set: (rows) => { store.obligors = rows; } });
  c({ name: "seller_entities", keyOf: (r) => r.id, get: () => store.sellerEntities, set: (rows) => { store.sellerEntities = rows; } });
  c({ name: "obligor_entities", keyOf: (r) => r.id, get: () => store.obligorEntities, set: (rows) => { store.obligorEntities = rows; } });
  c({ name: "signatories", keyOf: (r) => r.id, get: () => store.signatories, set: (rows) => { store.signatories = rows; } });
  c({ name: "parent_guarantees", keyOf: (r) => r.id, get: () => store.parentGuarantees, set: (rows) => { store.parentGuarantees = rows; } });

  // Funding partners.
  c({ name: "investors", keyOf: (r) => r.id, get: () => store.investors, set: (rows) => { store.investors = rows; } });
  c({ name: "insurance_policies", keyOf: (r) => r.id, get: () => store.insurancePolicies, set: (rows) => { store.insurancePolicies = rows; } });
  c({ name: "insurance_buyer_sublimits", keyOf: (r) => `${r.policyId}:${r.obligorId}`, get: () => store.insuranceBuyerSublimits, set: (rows) => { store.insuranceBuyerSublimits = rows; } });
  c({ name: "insurance_country_limits", keyOf: (r) => `${r.policyId}:${r.country}`, get: () => store.insuranceCountryLimits, set: (rows) => { store.insuranceCountryLimits = rows; } });

  // Registers / config.
  c({ name: "countries", keyOf: (r) => r.code, get: () => store.countries, set: (rows) => { store.countries = rows; } });
  c({ name: "doc_templates", keyOf: (r) => r.id, get: () => store.docTemplates, set: (rows) => { store.docTemplates = rows; } });
  c({ name: "users", keyOf: (r) => r.id, get: () => store.users, set: (rows) => { store.users = rows; } });

  // Creator Mode declarative extensions.
  c({ name: "custom_fields", keyOf: (r) => r.id, get: () => store.customFields, set: (rows) => { store.customFields = rows; } });
  c({ name: "custom_registers", keyOf: (r) => r.id, get: () => store.customRegisters, set: (rows) => { store.customRegisters = rows; } });
  c({ name: "kpi_tiles", keyOf: (r) => r.id, get: () => store.kpiTiles, set: (rows) => { store.kpiTiles = rows; } });
  c({ name: "watch_rules", keyOf: (r) => r.id, get: () => store.watchRules, set: (rows) => { store.watchRules = rows; } });
  c({ name: "template_fields", keyOf: (r) => r.id, get: () => store.templateFields, set: (rows) => { store.templateFields = rows; } });
  c({ name: "coverage", keyOf: (r) => r.id, get: () => store.coverage, set: (rows) => { store.coverage = rows; } });
}

// Phase 4-5: the capacity spine (limits + utilizations) and the transactional
// ledger. Registered the same way; still DUAL-SOURCE (snapshot retained) until a
// table is made authoritative after live-DB verification. Capacity itself is never
// stored — only the inputs (approved limits, consumption events, deals) persist.
let doneTx = false;
export function registerTransactionalCollections(): void {
  if (doneTx) return;
  doneTx = true;
  const c = registerCollection;

  // Phase 4 — limits & utilizations.
  c({ name: "limits", keyOf: (r) => r.id, get: () => store.limits, set: (rows) => { store.limits = rows; } });
  c({ name: "seller_obligor_limits", keyOf: (r) => `${r.sellerId}:${r.obligorId}`, get: () => store.sellerObligorLimits, set: (rows) => { store.sellerObligorLimits = rows; } });
  c({ name: "rates", keyOf: (r) => `${r.rateType}:${r.startDate}:${r.maturityDate}`, get: () => store.rates, set: (rows) => { store.rates = rows; } });
  // utilizations is a Map keyed by limitId — adapt to/from an array of its values.
  c({
    name: "utilizations",
    keyOf: (r) => r.limitId,
    get: () => [...store.utilizations.values()],
    set: (rows) => { store.utilizations = new Map(rows.map((u) => [u.limitId, u])); },
  });

  // Phase 5 — transactional ledger.
  c({ name: "booked_transactions", keyOf: (r) => r.id, get: () => store.bookedTransactions, set: (rows) => { store.bookedTransactions = rows; } });
  c({ name: "batches", keyOf: (r) => r.batchId, get: () => store.batches, set: (rows) => { store.batches = rows; } });
  c({ name: "reservations", keyOf: (r) => r.id, get: () => store.reservations, set: (rows) => { store.reservations = rows; } });
  c({ name: "transaction_workflows", keyOf: (r) => r.id, get: () => store.transactionWorkflows, set: (rows) => { store.transactionWorkflows = rows; } });
  c({ name: "exceptions", keyOf: (r) => r.id, get: () => store.exceptions, set: (rows) => { store.exceptions = rows; } });
  c({ name: "notifications", keyOf: (r) => r.id, get: () => store.notifications, set: (rows) => { store.notifications = rows; } });
}
