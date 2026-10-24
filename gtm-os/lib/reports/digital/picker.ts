// The metric picker vocabulary for the Digital Marketing board.
// keys are the dictionary keys and never appear on a surface the owner reads.
// Definitions live in the database dictionary; this file only names the picker.

export type PickerGroupKey = "money" | "volume" | "google" | "meta";

export type PickerMetric = {
  key: string;
  label: string;
  format: "dollars" | "count" | "pct";
  // "sum" compares as a change and a percent change; "ratio" compares as the ratio in
  kind: "sum" | "ratio";
};

export type PickerGroup = { key: PickerGroupKey; label: string; metrics: PickerMetric[] };

export const PICKER_GROUPS: PickerGroup[] = [
  {
    key: "money",
    label: "Money chain",
    metrics: [
      { key: "spend", label: "Spend", format: "dollars", kind: "sum" },
      { key: "nsli", label: "Net revenue per issued appointment (net revenue per net issued)", format: "dollars", kind: "ratio" },
      { key: "marketing_cost_pct", label: "Marketing cost percent of Net revenue per issued appointment", format: "pct", kind: "ratio" },
      { key: "cost_per_lead", label: "Cost per lead", format: "dollars", kind: "ratio" },
      { key: "cost_per_set", label: "Cost per set", format: "dollars", kind: "ratio" },
      { key: "cost_per_issue", label: "Cost per issued appointment", format: "dollars", kind: "ratio" },
      { key: "cost_per_sale", label: "Cost per sale", format: "dollars", kind: "ratio" },
    ],
  },
  {
    key: "volume",
    label: "Volume chain",
    metrics: [
      { key: "raw_contacts", label: "Raw contacts (every lead entered)", format: "count", kind: "sum" },
      { key: "sets", label: "Sets", format: "count", kind: "sum" },
      { key: "issues", label: "Issued appointments", format: "count", kind: "sum" },
      { key: "demos", label: "Demos", format: "count", kind: "sum" },
      { key: "sales", label: "Sales", format: "count", kind: "sum" },
      { key: "close_rate", label: "Close rate (sales over demos)", format: "pct", kind: "ratio" },
    ],
  },
  {
    key: "google",
    label: "Google diagnostics",
    metrics: [
      { key: "ctr", label: "Click-through rate", format: "pct", kind: "ratio" },
      { key: "cpc", label: "Cost per click", format: "dollars", kind: "ratio" },
      { key: "conversion_rate", label: "Conversion rate (platform conversions over clicks)", format: "pct", kind: "ratio" },
      { key: "is_lost_budget", label: "Search impression share lost to budget", format: "pct", kind: "ratio" },
      { key: "is_lost_rank", label: "Search impression share lost to rank", format: "pct", kind: "ratio" },
    ],
  },
  {
    key: "meta",
    label: "Meta diagnostics",
    metrics: [
      { key: "cpm", label: "Cost per thousand impressions", format: "dollars", kind: "ratio" },
      { key: "meta_ctr", label: "Click-through rate (Meta)", format: "pct", kind: "ratio" },
      { key: "frequency", label: "Frequency (impressions over reach)", format: "count", kind: "ratio" },
      { key: "hook_rate", label: "Hook rate (three-second views over impressions)", format: "pct", kind: "ratio" },
      { key: "cost_per_set_d35", label: "Cost per set at day thirty-five", format: "dollars", kind: "ratio" },
    ],
  },
];

export const PICKER_METRICS: PickerMetric[] = PICKER_GROUPS.flatMap((g) => g.metrics);

export function pickerMetric(key: string): PickerMetric | undefined {
  return PICKER_METRICS.find((m) => m.key === key);
}

export const DEFAULT_METRIC = "spend";

// Per-viewer convenience only (never state the board depends on); wrapped in try/catch
// because storage can be absent or throw in private windows.
const LS_KEY = "gtm_digital_board_metric_v1";

export function loadPickedMetric(): string {
  try {
    const v = window.localStorage.getItem(LS_KEY);
    return v && pickerMetric(v) ? v : DEFAULT_METRIC;
  } catch {
    return DEFAULT_METRIC;
  }
}

export function savePickedMetric(key: string): void {
  try {
    window.localStorage.setItem(LS_KEY, key);
  } catch {
    /* storage unavailable: session-only */
  }
}
