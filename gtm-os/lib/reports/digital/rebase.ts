// Re-basing: the picker swaps ONE measure key through ONE
// map. A panel template is a saved View with "{metric}" slots in its measures; resolving
// a template for a picker metric substitutes the declared dm_windows measure keys and
// validates the result with the registry's validateView. No per-metric component code.
//
// A metric whose inputs are not landed resolves to its withheld reason; a template scope
// the metric does not apply to resolves to the map's not-applicable reason. Neither ever

import { validateView, type View } from "@/lib/reports/workbench/viewSchema";
import type { ViewFilter } from "@/lib/reports/workbench/pivotSql";
import { PICKER_METRICS, pickerMetric } from "./picker";

export type ScopeKind = "company" | "market" | "platform" | "bucket" | "source";
export const SCOPES: ScopeKind[] = ["company", "market", "platform", "bucket", "source"];

export type RebaseEntry = {
  windows_metric: string;
  kind: "sum" | "ratio";
  format: "dollars" | "count" | "pct";
  company_scope: { scope_kind: string; scope: string };
  applicable_scopes: ScopeKind[];
  not_applicable: Partial<Record<ScopeKind, string>>;
  withheld_reason: string | null;
};

export type RebaseMap = {
  version: number;
  scopes: ScopeKind[];
  metrics: Record<string, RebaseEntry>;
};

export type DigitalTemplate = Partial<View> & {
  _digital?: { scope_kind?: ScopeKind; title?: string };
};

export type Resolution =
  | { kind: "view"; title: string; view: View; metric: string }
  | { kind: "withheld"; title: string; reason: string; metric: string }
  | { kind: "not_applicable"; title: string; reason: string; metric: string }
  | { kind: "invalid"; title: string; errors: string[]; metric: string };

/** The map is checked, never trusted: every picker key present, every scope covered
 * once (applicable or not applicable with a reason), every windows metric named. */
export function checkRebaseMap(map: RebaseMap): string[] {
  const errors: string[] = [];
  if (!map || typeof map !== "object" || !map.metrics) return ["rebase map: not an object with metrics"];
  for (const m of PICKER_METRICS) {
    const e = map.metrics[m.key];
    if (!e) {
      errors.push(`picker metric '${m.key}' has no rebase map entry`);
      continue;
    }
    if (!e.windows_metric) errors.push(`${m.key}: windows_metric required`);
    if (e.kind !== m.kind) errors.push(`${m.key}: map kind '${e.kind}' disagrees with the picker's '${m.kind}'`);
    if (e.format !== m.format) errors.push(`${m.key}: map format '${e.format}' disagrees with the picker's '${m.format}'`);
    if (!e.company_scope?.scope_kind || !e.company_scope?.scope) errors.push(`${m.key}: company_scope required`);
    for (const s of SCOPES) {
      const applies = (e.applicable_scopes ?? []).includes(s);
      const reason = e.not_applicable?.[s];
      if (applies && reason) errors.push(`${m.key}: scope '${s}' is both applicable and not applicable`);
      if (!applies && !reason) errors.push(`${m.key}: scope '${s}' is neither applicable nor given a not-applicable reason`);
      if (!applies && reason && !/^not applicable/.test(reason)) errors.push(`${m.key}/${s}: a not-applicable reason starts with 'not applicable'`);
    }
    if (e.withheld_reason !== null && !/^withheld/.test(e.withheld_reason)) errors.push(`${m.key}: a withheld reason starts with 'withheld'`);
  }
  for (const k of Object.keys(map.metrics)) {
    if (!pickerMetric(k)) errors.push(`rebase map names '${k}', which is not on the picker`);
  }
  return errors;
}

export const SLOT = "{metric}";
export const SLOT_PRIOR = "{metric_prior}";
export const SLOT_DELTA = "{metric_delta}";
export const SLOT_LABEL = "{metric_label}";

export function slotMeasures(metricKey: string): Record<string, string> {
  return {
    [SLOT]: `win_${metricKey}`,
    [SLOT_PRIOR]: `win_prior_${metricKey}`,
    [SLOT_DELTA]: `win_delta_${metricKey}`,
  };
}

export function hasSlot(t: DigitalTemplate): boolean {
  return (t.measures ?? []).some((m) => m.startsWith("{metric"));
}

function fillText(s: string | undefined, label: string): string | undefined {
  return s === undefined ? undefined : s.split(SLOT_LABEL).join(label);
}

export function resolveTemplate(
  template: DigitalTemplate,
  metricKey: string,
  map: RebaseMap,
  opts: { window?: string; extraFilters?: ViewFilter[] } = {}
): Resolution {
  const pm = pickerMetric(metricKey);
  const title = template._digital?.title ?? template.name ?? template.id ?? "panel";
  if (!pm) return { kind: "invalid", title, metric: metricKey, errors: [`'${metricKey}' is not on the picker`] };
  const entry = map.metrics[metricKey];
  if (!entry) return { kind: "invalid", title, metric: metricKey, errors: [`'${metricKey}' has no rebase map entry`] };

  const scope = template._digital?.scope_kind;
  if (hasSlot(template)) {
    if (scope && !entry.applicable_scopes.includes(scope)) {
      const reason = entry.not_applicable[scope] ?? `not applicable to this metric at the ${scope} scope`;
      return { kind: "not_applicable", title, metric: metricKey, reason };
    }
    if (entry.withheld_reason) return { kind: "withheld", title, metric: metricKey, reason: entry.withheld_reason };
  }

  const slots = slotMeasures(metricKey);
  const sub = (k: string) => slots[k] ?? k;
  const filters: ViewFilter[] = (template.filters ?? []).map((f) =>
    opts.window && f.dimKey === "win" ? { ...f, values: [opts.window] } : f
  );
  const idSuffix = hasSlot(template) ? `-${metricKey.replace(/_/g, "-")}` : "";
  const { _digital: _ignored, ...rest } = template;
  void _ignored;
  const candidate = {
    ...rest,
    id: `${template.id ?? "digital"}${idSuffix}`,
    name: fillText(template.name, pm.label),
    description: fillText(template.description, pm.label),
    narrative: fillText(template.narrative, pm.label),
    measures: (template.measures ?? []).map(sub),
    filters: [...filters, ...(opts.extraFilters ?? [])],
    sort: template.sort ? { ...template.sort, by: sub(template.sort.by) } : undefined,
    chartSpec: template.chartSpec
      ? { ...(template.chartSpec as Record<string, unknown>), y: sub(String((template.chartSpec as { y?: string }).y ?? "")) }
      : undefined,
  };
  const r = validateView(candidate);
  if (!r.ok) return { kind: "invalid", title, metric: metricKey, errors: r.errors };
  return { kind: "view", title, metric: metricKey, view: r.view };
}

/** The scope the company comparison row reads for a metric (platform diagnostics read
 * their platform's row, everything else the company row). */
export function companyScopeFor(metricKey: string, map: RebaseMap): { scope_kind: string; scope: string } | null {
  return map.metrics[metricKey]?.company_scope ?? null;
}

// ---- loaders (browser) --------------------------------------------------------------

export async function loadRebaseMap(): Promise<{ map: RebaseMap | null; errors: string[] }> {
  try {
    const r = await fetch("/data-views/digital/rebase_map.json", { cache: "no-store" });
    if (!r.ok) return { map: null, errors: [`rebase map: HTTP ${r.status}`] };
    const map = (await r.json()) as RebaseMap;
    const errors = checkRebaseMap(map);
    return { map: errors.length ? null : map, errors };
  } catch (e) {
    return { map: null, errors: [`rebase map: ${String(e)}`] };
  }
}

export async function loadDigitalTemplates(): Promise<{ templates: Record<string, DigitalTemplate>; errors: string[] }> {
  const templates: Record<string, DigitalTemplate> = {};
  const errors: string[] = [];
  try {
    const idx = await fetch("/data-views/digital/index.json", { cache: "no-store" });
    if (!idx.ok) return { templates, errors: [`digital templates index: HTTP ${idx.status}`] };
    const ids = (await idx.json()) as string[];
    for (const id of ids) {
      const r = await fetch(`/data-views/digital/${id}.json`, { cache: "no-store" });
      if (!r.ok) {
        errors.push(`${id}: HTTP ${r.status}`);
        continue;
      }
      templates[id] = (await r.json()) as DigitalTemplate;
    }
  } catch (e) {
    errors.push(String(e));
  }
  return { templates, errors };
}
