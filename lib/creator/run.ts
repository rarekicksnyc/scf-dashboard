import { evaluateExpression, toBool, toNumber, validateExpression } from "@/lib/creator/expr";
import { kpiContext, watchSurface, KPI_FIELDS, watchFields, type WatchItem } from "@/lib/creator/surface";
import { usd } from "@/lib/format";
import type { KpiTile, WatchRule, KpiFormat, WatchScope } from "@/lib/types";

// Interpret Creator-Mode definitions against the live surface. Pure reads; a bad
// formula yields an error string, never a throw or a wrong number.

export function kpiFieldKeys(): string[] { return KPI_FIELDS.map((f) => f.key); }
export function watchFieldKeys(scope: WatchScope): string[] { return watchFields(scope).map((f) => f.key); }

export function validateKpiFormula(formula: string) { return validateExpression(formula, kpiFieldKeys()); }
export function validateWatchExpression(expression: string, scope: WatchScope) { return validateExpression(expression, watchFieldKeys(scope)); }

export function formatKpi(v: number, fmt: KpiFormat): string {
  if (fmt === "currency") return usd(v);
  if (fmt === "percent") return `${(v * 100).toFixed(1)}%`;
  if (fmt === "bps") return `${Math.round(v)} bps`;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export interface KpiResult { id: string; label: string; formatted: string; error?: string }

export function computeKpi(tile: KpiTile): KpiResult {
  const { value, error } = evaluateExpression(tile.formula, kpiContext());
  if (error !== undefined) return { id: tile.id, label: tile.label, formatted: "—", error };
  return { id: tile.id, label: tile.label, formatted: formatKpi(toNumber(value!), tile.format) };
}

export function computeKpis(tiles: KpiTile[]): KpiResult[] { return tiles.map(computeKpi); }

export interface WatchMatch { id: string; label: string }
export interface WatchResult { rule: WatchRule; matches: WatchMatch[]; error?: string }

export function evaluateWatchRule(rule: WatchRule): WatchResult {
  const { items } = watchSurface(rule.scope);
  const matches: WatchMatch[] = [];
  let error: string | undefined;
  for (const it of items) {
    const { value, error: e } = evaluateExpression(rule.expression, it.context);
    if (e !== undefined) { error = e; break; } // a bad expression fails the same way on every item
    if (toBool(value!)) matches.push({ id: it.id, label: it.label });
  }
  return { rule, matches, error };
}

// Every enabled rule with its current matches — the live watch list.
export function evaluateEnabledWatchRules(): WatchResult[] {
  return watchSurfaceRules().filter((r) => r.enabled).map(evaluateWatchRule);
}

// Indirection kept tiny so callers import one module; the store is the source.
import { listWatchRules } from "@/lib/data/store";
function watchSurfaceRules(): WatchRule[] { return listWatchRules(); }

export type { WatchItem };
