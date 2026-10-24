// The one place a headline figure is read. scripts/demo-data/metrics.py computes every KPI once, from the same
// feeds the report tabs use, for named windows; every surface (cockpit, chat, overview, sales floor, digital board,
// executive readout) formats it through this module. No surface computes a KPI of its own.
import doc from "@/public/data/metrics.json";

export type Win = "yesterday" | "wtd" | "mtd" | "last7" | "last28" | "mom" | "ytd";
export type KpiKey =
  | "leads" | "sets" | "issued" | "meetings" | "sales" | "gross_revenue" | "net_revenue" | "ad_spend" | "marketing_cost" | "mer"
  | "marketing_cost_pct" | "marketing_tools" | "marketing_payroll" | "revenue_per_marketing_dollar" | "cost_per_lead" | "cost_per_set" | "cost_per_sale" | "set_rate" | "close_rate" | "gross_per_issued"
  | "net_per_issued" | "dials" | "connects" | "connect_rate" | "dials_per_set";
export type Values = Record<KpiKey, number | null>;
type WinDoc = { label: string; start: string; end: string; days: number; partial: boolean; values: Values; prior: Values | null; prior_start: string | null; prior_end: string | null };
type MonthDoc = { label: string; start: string; end: string; partial: boolean; days_elapsed: number; days_in_month: number; values: Values };
export type MetricsDoc = {
  as_of: string; through: string; today: string;
  kpis: Record<KpiKey, { label: string; unit: string; definition: string; lower_is_better: boolean }>;
  windows: Record<Win, WinDoc>;
  months: Record<string, MonthDoc>;
  pace: { goal: number; actual: number; expected_by_today: number; pct_to_pace: number };
  markets_last7: Record<string, Record<string, number>>;
};

export const metrics = doc as unknown as MetricsDoc;
export const KPI_KEYS = Object.keys(metrics.kpis) as KpiKey[];
export const TARGET_PCT = 28;

export function win(w: Win): WinDoc {
  return metrics.windows[w];
}
export function value(w: Win, k: KpiKey): number | null {
  return metrics.windows[w].values[k] ?? null;
}
export function priorValue(w: Win, k: KpiKey): number | null {
  return metrics.windows[w].prior?.[k] ?? null;
}
export function monthValue(period: string, k: KpiKey): number | null {
  return metrics.months[period]?.values[k] ?? null;
}
/** Change against the prior window, in percent (a rate change reads as percent of the old rate). */
export function deltaPct(w: Win, k: KpiKey): number | null {
  const a = value(w, k);
  const b = priorValue(w, k);
  return a == null || b == null || b === 0 ? null : (100 * (a - b)) / b;
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
/** One format per KPI, used by every surface. */
export function fmt(k: KpiKey, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "n/a";
  switch (metrics.kpis[k].unit) {
    case "count": return n0(v);
    case "usd": return `$${n0(v)}`;
    case "usd2": return `$${v.toFixed(2)}`;
    case "ratio": return `${v.toFixed(1)}x`;
    case "ratio1": return v.toFixed(1);
    case "pct": return `${v.toFixed(1)}%`;
    default: return String(v);
  }
}
export function fmtW(w: Win, k: KpiKey): string {
  return fmt(k, value(w, k));
}
export function label(k: KpiKey): string {
  return metrics.kpis[k].label;
}
export const PRESET_TO_WIN: Record<string, Win> = { yesterday: "yesterday", wtd: "wtd", mtd: "mtd", last7: "last7", last28: "last28", mom: "mom", ytd: "ytd" };

/** "Oct 24" from a calendar date string. Data dates are calendar dates: never shifted by the visitor's time zone. */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
export function monthName(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

/** Resolve chat tokens like {{mer@last7}} into spans that carry their KPI and window, so a surface check can read them. */
export const TOKEN_RE = /\{\{([a-z_]+)@([a-z0-9]+)\}\}/g;
export function plainTokens(text: string): string {
  return text.replace(TOKEN_RE, (_m, k: string, w: string) => fmtW(w as Win, k as KpiKey));
}
