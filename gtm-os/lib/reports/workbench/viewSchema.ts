// viewSchema: a View is a RE-COMPUTABLE
// QUESTION: source + slice + presentation, never a number. One validate()
// entry point serves canon files (public/data-views/, git = truth), personal
// saves (localStorage), and agent-authored views: an unknown sourceKey,
// dimKey, or measureKey is a validation refusal, not a runtime blank.

import { SOURCES, findSource } from "./sources";
import { validateChartSpec } from "./chartSpec";
import type { ViewFilter } from "./pivotSql";

export type View = {
  id: string;
  name: string;
  description?: string;
  // REQUIRED for canon views [conv C15]: the one-to-two-sentence business
  // translation, rendered at the END of the view (the compass hook)
  narrative?: string;
  sourceKey: string;
  rows: string[];
  cols: string[];
  measures: string[];
  filters: ViewFilter[];
  datePreset?: "all" | "last_13" | "last_25";
  compare?: {
    modes: ("prior_year" | "ttm_pair")[];
    pairPctWithDollars: true;
    newRevenueSplit?: boolean;
    varianceFlag?: boolean;
  };
  sort?: { by: string; dir: "asc" | "desc" };
  presentation: "table" | "chart";
  chartSpec?: unknown; // grammar = the P2 bake-off winner's
  origin: "canon" | "personal" | "agent";
  created_by: string;
  created_at: string;
};

export type ValidationResult = { ok: true; view: View } | { ok: false; errors: string[] };

const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function validateView(json: unknown): ValidationResult {
  const errors: string[] = [];
  const v = json as Partial<View>;
  if (!v || typeof v !== "object") return { ok: false, errors: ["not an object"] };

  if (!v.id || !ID.test(v.id)) errors.push("id: lowercase kebab-case, 2-64 chars");
  if (!v.name) errors.push("name: required");
  if (!v.origin || !["canon", "personal", "agent"].includes(v.origin)) {
    errors.push("origin: canon | personal | agent");
  }
  if (v.origin === "canon" && !(v.narrative && v.narrative.trim().length >= 20)) {
    errors.push("narrative: REQUIRED for canon views (the business translation, conv C15)");
  }
  if (!v.created_by) errors.push("created_by: required (a named author, never blank)");

  const source = v.sourceKey ? findSource(v.sourceKey) : undefined;
  if (!source) {
    errors.push(`sourceKey: unknown '${v.sourceKey}' (known: ${SOURCES.map((s) => s.key).join(", ")})`);
    return { ok: false, errors };
  }
  const dimKeys = new Set(source.dims.map((d) => d.key));
  const measureKeys = new Set(source.measures.map((m) => m.key));
  for (const d of [...(v.rows ?? []), ...(v.cols ?? [])]) {
    if (!dimKeys.has(d)) errors.push(`dim '${d}' not on ${source.key}`);
  }
  if ((v.cols ?? []).length > 1) errors.push("cols: at most one column dim in v1");
  if (!(v.rows ?? []).length) errors.push("rows: at least one row dim");
  if (!(v.measures ?? []).length) errors.push("measures: at least one");
  for (const m of v.measures ?? []) {
    if (!measureKeys.has(m)) errors.push(`measure '${m}' not on ${source.key}`);
  }
  for (const f of v.filters ?? []) {
    if (!dimKeys.has(f.dimKey)) errors.push(`filter dim '${f.dimKey}' not on ${source.key}`);
    if (!f.values?.length) errors.push(`filter on '${f.dimKey}': values required`);
  }
  if (v.compare && !(v.rows ?? []).includes("period")) {
    errors.push("compare: requires 'period' in rows (comparisons are period-anchored)");
  }
  if (v.compare && !v.compare.modes?.length) errors.push("compare.modes: at least one");
  if (v.compare) {
    for (const m of v.compare.modes ?? []) {
      if (!["prior_year", "ttm_pair"].includes(m)) errors.push(`compare.modes: unknown '${m}'`);
    }
    if ((v.measures ?? []).length > 1) {
      errors.push("compare: one measure per compare view in v1: extra measures would vanish silently [p1-review F4]");
    }
    if (v.compare.modes?.includes("ttm_pair")) {
      for (const mkey of v.measures ?? []) {
        const mm = source.measures.find((x) => x.key === mkey);
        if (mm && mm.kind !== "sum" && !mm.additive) {
          errors.push(`compare.ttm_pair: '${mkey}' is a ratio: a sum of monthly ratios is not a TTM [p1-r2 G2]`);
        }
      }
    }
  }
  if (v.datePreset && !["all", "last_13", "last_25"].includes(v.datePreset)) {
    errors.push(`datePreset: unknown '${v.datePreset}' (all | last_13 | last_25)`);
  }
  for (const f of v.filters ?? []) {
    if (f.op && !["=", "in"].includes(f.op)) errors.push(`filter op: unknown '${f.op}'`);
  }
  if (!v.presentation || !["table", "chart"].includes(v.presentation)) {
    errors.push("presentation: table | chart");
  }
  if (v.presentation === "chart") {
    errors.push(...validateChartSpec(v.chartSpec, source, v.rows ?? [], v.measures ?? []));
  }

  return errors.length ? { ok: false, errors } : { ok: true, view: v as View };
}

// ---- canon + personal stores ------------------------------------------------

export async function loadCanonViews(): Promise<{ views: View[]; errors: string[] }> {
  const errors: string[] = [];
  const views: View[] = [];
  try {
    const idx = await fetch("/data-views/index.json", { cache: "no-store" });
    if (!idx.ok) return { views, errors: [`/data-views/index.json HTTP ${idx.status}`] };
    const ids = (await idx.json()) as string[];
    for (const id of ids) {
      const r = await fetch(`/data-views/${id}.json`, { cache: "no-store" });
      if (!r.ok) {
        errors.push(`${id}: HTTP ${r.status}`);
        continue;
      }
      const result = validateView(await r.json());
      if (result.ok) views.push(result.view);
      else errors.push(`${id}: ${result.errors.join("; ")}`);
    }
  } catch (e) {
    errors.push(String(e));
  }
  return { views, errors };
}

const LS_KEY = "echo_workbench_views_v1"; // namespaced [r2 R-L]

export function loadPersonalViews(): View[] {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as unknown[])
      .map(validateView)
      .filter((r): r is { ok: true; view: View } => r.ok)
      .map((r) => r.view);
  } catch {
    return [];
  }
}

export function savePersonalView(view: View): void {
  const all = loadPersonalViews().filter((v) => v.id !== view.id);
  all.push(view);
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* localStorage unavailable: session-only */
  }
}
