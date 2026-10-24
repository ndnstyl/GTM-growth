// chartSpec: the ENGINE-AGNOSTIC chart grammar. A chart is a
// presentation of a pivotSql-computed result, never a second computation:
// x = a declared dim, y = a declared measure, series = an optional dim. The
// engine adapter (TanStack Charts: RATIFIED 2026-08-28, Mosaic deleted) is a
// pure renderer behind the ChartPanel seam; it never aggregates.

import type { DeclaredSource } from "./sources";

// Chart-kind doctrine (the owner, 2026-08-28: "somewhat a rule of thumb, because
// this isn't a binary decision"): comparison = bar (vertical under ~7 items,
// horizontal bar_h for ~7-15); change over time = line; composition = pie/
// donut ONLY at 5 or fewer categories, stacked_bar for parts across groups or
// time; relationship = scatter (two measures). Distribution kinds (histogram,
// box) need row-grain data and land with the drill lane, not the pivot lane.
export type ChartSpec = {
  kind: "line" | "bar" | "bar_h" | "stacked_bar" | "pie" | "donut" | "scatter";
  x: string; // dim key (must be in view.rows)
  y: string; // measure key (must be in view.measures)
  y2?: string; // scatter only: the second measure
  series?: string; // optional second dim (must be in view.rows)
};

export const CHART_KINDS = ["line", "bar", "bar_h", "stacked_bar", "pie", "donut", "scatter"] as const;
// the "only if" half of the doctrine: enforced at render where the real
// category count is known
export const PIE_MAX_CATEGORIES = 5;

export function validateChartSpec(
  spec: unknown,
  source: DeclaredSource,
  rows: string[],
  measures: string[]
): string[] {
  const errors: string[] = [];
  const c = spec as Partial<ChartSpec>;
  if (!c || typeof c !== "object") return ["chartSpec: required when presentation is 'chart'"];
  if (!c.kind || !CHART_KINDS.includes(c.kind)) {
    errors.push(`chartSpec.kind: ${CHART_KINDS.join(" | ")}`);
  }
  const dimKeys = new Set(source.dims.map((d) => d.key));
  if (!c.x || !dimKeys.has(c.x)) errors.push(`chartSpec.x: unknown dim '${c.x}'`);
  else if (!rows.includes(c.x)) errors.push(`chartSpec.x: '${c.x}' must be in the view's rows`);
  if (!c.y || !measures.includes(c.y)) {
    errors.push(`chartSpec.y: '${c.y}' must be one of the view's measures`);
  }
  if (c.kind === "scatter") {
    if (!c.y2 || !measures.includes(c.y2)) {
      errors.push("chartSpec.y2: scatter relates TWO measures: y2 must be one of the view's measures");
    } else if (c.y2 === c.y) errors.push("chartSpec.y2: must differ from y");
  } else if (c.y2 !== undefined) {
    errors.push("chartSpec.y2: only scatter takes a second measure");
  }
  if (c.kind === "stacked_bar" && !c.series) {
    errors.push("chartSpec.series: stacked_bar needs a series dim (the parts of the whole)");
  }
  if ((c.kind === "pie" || c.kind === "donut") && c.series) {
    errors.push("chartSpec.series: pie/donut slice by x: series has no lane here");
  }
  if (c.series !== undefined) {
    if (!dimKeys.has(c.series)) errors.push(`chartSpec.series: unknown dim '${c.series}'`);
    else if (!rows.includes(c.series)) errors.push(`chartSpec.series: '${c.series}' must be in the view's rows`);
    if (c.series === c.x) errors.push("chartSpec.series: must differ from x");
  }
  // [p2-review C4] every row dim must be consumed by the chart: an unmapped
  // row dim multiplies datums per x and one member's value draws as the total
  for (const r of rows) {
    if (r !== c.x && r !== c.series) {
      errors.push(`chartSpec: row dim '${r}' is neither x nor series: its members would collide on one x`);
    }
  }
  // [p2-review W1] composition kinds need additive parts (same law as ttm_pair)
  if (c.kind === "stacked_bar" || c.kind === "pie" || c.kind === "donut") {
    const mm = source.measures.find((m) => m.key === c.y);
    if (mm && mm.kind !== "sum" && !mm.additive) {
      errors.push(`chartSpec: '${c.y}' is a ratio: ratios have no parts-of-a-whole; ${c.kind} refuses`);
    }
  }
  return errors;
}

// pivotSql result MINUS withheld cells; withheld periods arrive separately so
// every engine must RENDER the absence (a visible marker, never a silent gap).
export type ChartDatum = {
  x: string;
  y: number;
  y2: number | null; // scatter's second measure; null for every other kind
  series: string | null;
};

export type ChartAdapterProps = {
  spec: ChartSpec;
  data: ChartDatum[];
  // x values whose measure is WITHHELD (presence-gated etc.): the adapter
  // MUST paint these visibly; a chart that hides a withheld period lies
  withheldX: { x: string; reason: string }[];
  // x values carrying an MTD (open month) marker: painted distinctly
  mtdX: string[];
  format: "dollars" | "count" | "pct";
  yLabel: string;
  // scatter only: the second measure's presentation
  y2Label?: string;
  y2Format?: "dollars" | "count" | "pct";
  onSelection?: (sel: { x: string; series: string | null; y: number } | null) => void;
};
