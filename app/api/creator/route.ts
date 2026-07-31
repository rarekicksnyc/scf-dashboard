import { NextResponse } from "next/server";
import { getCurrentUser, roleHas } from "@/lib/auth";
import {
  addCustomField, updateCustomField, removeCustomField, listCustomFields, setCustomFieldValues,
  addCustomRegister, updateCustomRegister, removeCustomRegister,
  addKpiTile, updateKpiTile, removeKpiTile,
  addWatchRule, updateWatchRule, removeWatchRule,
  addTemplateField, updateTemplateField, removeTemplateField, listTemplateFields,
  recordUnchanged, recordRev, bumpRecordRev, addAudit,
} from "@/lib/data/store";
import { validateKpiFormula, validateWatchExpression, validateTemplateFormula } from "@/lib/creator/run";
import type { CustomFieldType, CustomFieldEntity, KpiFormat, WatchScope, WatchSeverity, TemplateTarget, TemplateFieldKind, TemplateFieldFormat } from "@/lib/types";

// One dispatching route for every Creator-Mode extension (keeps the surface small
// for the bank-team handoff). Every mutation is gated to CREATOR_MODE, audited,
// and — on update — edit-conflict guarded. Nothing here runs code: definitions
// are validated against the fixed evaluator/surface and stored as data.

const FIELD_TYPES = new Set(["text", "number", "date", "select", "boolean"]);
const KPI_FORMATS = new Set(["currency", "number", "percent", "bps"]);
const SCOPES = new Set(["DEAL", "SELLER", "OBLIGOR"]);
const SEVERITIES = new Set(["INFO", "WARN"]);
const TARGETS = new Set(["REPORT_TRANSACTIONS"]);
const FIELD_KINDS = new Set(["formula", "text", "dropdown"]);
const FIELD_FORMATS = new Set(["text", "currency", "number", "percent", "bps"]);
const KEY_RE = /^[a-z][a-z0-9_]*$/;

async function requireCreator() {
  const user = await getCurrentUser();
  if (!roleHas(user.role, "CREATOR_MODE")) return { error: NextResponse.json({ error: `Role ${user.role} is not permitted to use Creator mode.` }, { status: 403 }) };
  return { user };
}

function audit(user: { id: string; name: string }, action: string, entityId: string, detail: string) {
  addAudit({ actorUserId: user.id, actorName: user.name, action, entityType: "CREATOR_EXTENSION", entityId, detail });
}

function conflict(key: string, rev: unknown): NextResponse | null {
  if (rev != null && !recordUnchanged(key, Number(rev))) {
    return NextResponse.json({ error: "This item was changed by another user since you opened it.", current: recordRev(key) }, { status: 409 });
  }
  return null;
}

export async function POST(request: Request) {
  const g = await requireCreator();
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const resource = b.resource as string;

  if (resource === "field") {
    const entityType = b.entityType as CustomFieldEntity;
    const key = String(b.key ?? "").trim();
    if (!["SELLER", "OBLIGOR"].includes(entityType)) return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });
    if (!KEY_RE.test(key)) return NextResponse.json({ error: "Key must be lower_snake_case starting with a letter." }, { status: 400 });
    if (!FIELD_TYPES.has(b.type)) return NextResponse.json({ error: "Invalid field type." }, { status: 400 });
    if (listCustomFields(entityType).some((f) => f.key === key)) return NextResponse.json({ error: `A ${entityType} field "${key}" already exists.` }, { status: 409 });
    const options = b.type === "select" ? (Array.isArray(b.options) ? b.options.map(String).filter(Boolean) : []) : undefined;
    if (b.type === "select" && (!options || options.length === 0)) return NextResponse.json({ error: "A select field needs at least one option." }, { status: 400 });
    const field = addCustomField({ entityType, key, label: String(b.label || key), type: b.type as CustomFieldType, options });
    audit(g.user, "CREATOR_FIELD_ADD", field.id, `Added ${entityType} field ${key} (${b.type}).`);
    return NextResponse.json({ ok: true, field });
  }

  if (resource === "register") {
    const name = String(b.name ?? "").trim();
    const columns = Array.isArray(b.columns) ? b.columns.map(String).map((s: string) => s.trim()).filter(Boolean) : [];
    if (!name) return NextResponse.json({ error: "A register needs a name." }, { status: 400 });
    if (columns.length === 0) return NextResponse.json({ error: "A register needs at least one column." }, { status: 400 });
    const reg = addCustomRegister({ name, description: b.description ? String(b.description) : undefined, columns, rows: [] });
    audit(g.user, "CREATOR_REGISTER_ADD", reg.id, `Added register "${name}" (${columns.length} cols).`);
    return NextResponse.json({ ok: true, register: reg });
  }

  if (resource === "kpi") {
    const label = String(b.label ?? "").trim();
    const formula = String(b.formula ?? "").trim();
    if (!label) return NextResponse.json({ error: "A KPI needs a label." }, { status: 400 });
    if (!KPI_FORMATS.has(b.format)) return NextResponse.json({ error: "Invalid format." }, { status: 400 });
    const v = validateKpiFormula(formula);
    if (!v.ok) return NextResponse.json({ error: v.error ?? "Invalid formula." }, { status: 400 });
    const tile = addKpiTile({ label, formula, format: b.format as KpiFormat });
    audit(g.user, "CREATOR_KPI_ADD", tile.id, `Added KPI "${label}".`);
    return NextResponse.json({ ok: true, tile });
  }

  if (resource === "watchRule") {
    const label = String(b.label ?? "").trim();
    const scope = b.scope as WatchScope;
    const expression = String(b.expression ?? "").trim();
    if (!label) return NextResponse.json({ error: "A rule needs a label." }, { status: 400 });
    if (!SCOPES.has(scope)) return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
    if (!SEVERITIES.has(b.severity)) return NextResponse.json({ error: "Invalid severity." }, { status: 400 });
    const v = validateWatchExpression(expression, scope);
    if (!v.ok) return NextResponse.json({ error: v.error ?? "Invalid expression." }, { status: 400 });
    const rule = addWatchRule({ label, scope, expression, severity: b.severity as WatchSeverity, message: b.message ? String(b.message) : undefined, enabled: b.enabled !== false });
    audit(g.user, "CREATOR_WATCHRULE_ADD", rule.id, `Added watch rule "${label}" (${scope}).`);
    return NextResponse.json({ ok: true, rule });
  }

  if (resource === "templateField") {
    const target = b.target as TemplateTarget;
    const key = String(b.key ?? "").trim();
    const kind = b.kind as TemplateFieldKind;
    const label = String(b.label ?? "").trim();
    if (!TARGETS.has(target)) return NextResponse.json({ error: "Invalid target." }, { status: 400 });
    if (!KEY_RE.test(key)) return NextResponse.json({ error: "Key must be lower_snake_case starting with a letter." }, { status: 400 });
    if (!FIELD_KINDS.has(kind)) return NextResponse.json({ error: "Invalid field kind." }, { status: 400 });
    if (!label) return NextResponse.json({ error: "A field needs a label." }, { status: 400 });
    if (listTemplateFields(target).some((f) => f.key === key)) return NextResponse.json({ error: `A field "${key}" already exists on this target.` }, { status: 409 });
    const patch: { formula?: string; text?: string; options?: string[]; format?: TemplateFieldFormat } = {};
    if (kind === "formula") {
      const formula = String(b.formula ?? "").trim();
      const v = validateTemplateFormula(formula, target);
      if (!v.ok) return NextResponse.json({ error: v.error ?? "Invalid formula." }, { status: 400 });
      patch.formula = formula;
      patch.format = FIELD_FORMATS.has(b.format) ? (b.format as TemplateFieldFormat) : "number";
    } else if (kind === "text") {
      patch.text = String(b.text ?? "");
    } else {
      const options = Array.isArray(b.options) ? b.options.map(String).map((s: string) => s.trim()).filter(Boolean) : [];
      if (options.length === 0) return NextResponse.json({ error: "A dropdown needs at least one option." }, { status: 400 });
      patch.options = options;
    }
    const field = addTemplateField({ target, key, label, kind, ...patch });
    audit(g.user, "CREATOR_TEMPLATEFIELD_ADD", field.id, `Added ${kind} field ${key} to ${target}.`);
    return NextResponse.json({ ok: true, field });
  }

  return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const g = await requireCreator();
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const resource = b.resource as string;
  const id = String(b.id ?? "");

  if (resource === "fieldValues") {
    const entityType = b.entityType as CustomFieldEntity;
    if (!["SELLER", "OBLIGOR"].includes(entityType) || !b.entityId) return NextResponse.json({ error: "Expected entityType + entityId." }, { status: 400 });
    const defs = listCustomFields(entityType);
    const values: Record<string, string> = {};
    for (const f of defs) { const v = b.values?.[f.key]; if (v !== undefined && v !== null && String(v) !== "") values[f.key] = String(v); }
    setCustomFieldValues(entityType, String(b.entityId), values);
    audit(g.user, "CREATOR_FIELD_VALUES", `${entityType}:${b.entityId}`, `Updated ${entityType} custom fields.`);
    return NextResponse.json({ ok: true });
  }

  const key = `creator:${resource}:${id}`;
  const c = conflict(key, b.rev);
  if (c) return c;

  if (resource === "field") {
    const patch: { label?: string; options?: string[] } = {};
    if (b.label != null) patch.label = String(b.label);
    if (Array.isArray(b.options)) patch.options = b.options.map(String).filter(Boolean);
    const field = updateCustomField(id, patch);
    if (!field) return NextResponse.json({ error: "Field not found." }, { status: 404 });
    audit(g.user, "CREATOR_FIELD_EDIT", id, `Edited field ${field.key}.`);
    return NextResponse.json({ ok: true, field, rev: bumpRecordRev(key) });
  }
  if (resource === "register") {
    const patch: Record<string, unknown> = {};
    if (b.name != null) patch.name = String(b.name);
    if (b.description != null) patch.description = String(b.description);
    if (Array.isArray(b.columns)) patch.columns = b.columns.map(String);
    if (Array.isArray(b.rows)) patch.rows = (b.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(String) : []));
    const reg = updateCustomRegister(id, patch);
    if (!reg) return NextResponse.json({ error: "Register not found." }, { status: 404 });
    audit(g.user, "CREATOR_REGISTER_EDIT", id, `Edited register "${reg.name}".`);
    return NextResponse.json({ ok: true, register: reg, rev: bumpRecordRev(key) });
  }
  if (resource === "kpi") {
    if (b.formula != null) { const v = validateKpiFormula(String(b.formula)); if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 }); }
    const tile = updateKpiTile(id, { label: b.label != null ? String(b.label) : undefined, formula: b.formula != null ? String(b.formula) : undefined, format: KPI_FORMATS.has(b.format) ? (b.format as KpiFormat) : undefined });
    if (!tile) return NextResponse.json({ error: "KPI not found." }, { status: 404 });
    audit(g.user, "CREATOR_KPI_EDIT", id, `Edited KPI "${tile.label}".`);
    return NextResponse.json({ ok: true, tile, rev: bumpRecordRev(key) });
  }
  if (resource === "watchRule") {
    const scope = SCOPES.has(b.scope) ? (b.scope as WatchScope) : undefined;
    if (b.expression != null && scope) { const v = validateWatchExpression(String(b.expression), scope); if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 }); }
    const rule = updateWatchRule(id, {
      label: b.label != null ? String(b.label) : undefined,
      scope,
      expression: b.expression != null ? String(b.expression) : undefined,
      severity: SEVERITIES.has(b.severity) ? (b.severity as WatchSeverity) : undefined,
      message: b.message != null ? String(b.message) : undefined,
      enabled: typeof b.enabled === "boolean" ? b.enabled : undefined,
    });
    if (!rule) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    audit(g.user, "CREATOR_WATCHRULE_EDIT", id, `Edited watch rule "${rule.label}".`);
    return NextResponse.json({ ok: true, rule, rev: bumpRecordRev(key) });
  }
  if (resource === "templateField") {
    const existing = listTemplateFields().find((f) => f.id === id);
    if (!existing) return NextResponse.json({ error: "Field not found." }, { status: 404 });
    if (b.formula != null) { const v = validateTemplateFormula(String(b.formula), existing.target); if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 }); }
    const field = updateTemplateField(id, {
      label: b.label != null ? String(b.label) : undefined,
      formula: b.formula != null ? String(b.formula) : undefined,
      text: b.text != null ? String(b.text) : undefined,
      options: Array.isArray(b.options) ? b.options.map(String).filter(Boolean) : undefined,
      format: FIELD_FORMATS.has(b.format) ? (b.format as TemplateFieldFormat) : undefined,
    });
    audit(g.user, "CREATOR_TEMPLATEFIELD_EDIT", id, `Edited field ${existing.key}.`);
    return NextResponse.json({ ok: true, field, rev: bumpRecordRev(key) });
  }
  return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const g = await requireCreator();
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const resource = b.resource as string;
  const id = String(b.id ?? "");
  const remove = resource === "field" ? removeCustomField : resource === "register" ? removeCustomRegister : resource === "kpi" ? removeKpiTile : resource === "watchRule" ? removeWatchRule : resource === "templateField" ? removeTemplateField : null;
  if (!remove) return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
  if (!remove(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  audit(g.user, "CREATOR_DELETE", id, `Removed ${resource} ${id}.`);
  return NextResponse.json({ ok: true });
}
