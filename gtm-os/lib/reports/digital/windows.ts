// Typed reader for the dm_windows and dm_pacing feeds.
// These are plain row reads (one row per metric x scope x window); the windows were
// computed ONCE in the database on working-day weights, so nothing here aggregates.
// Formatting of a value, a delta and the day counts lives here so the comparison row,
// the re-based panels and the CSV export print the same text.

export type WindowKey = "mtd" | "wow" | "mom" | "yoy";
export const WINDOW_ORDER: WindowKey[] = ["mtd", "wow", "mom", "yoy"];
export const WINDOW_LABELS: Record<WindowKey, string> = {
  mtd: "Month to date",
  wow: "Week over week",
  mom: "Month over month",
  yoy: "Year over year",
};

export type WindowRow = {
  metric: string;
  scope_kind: string;
  scope: string;
  window: string;
  value: number | null;
  prior_value: number | null;
  delta: number | null;
  delta_pct: number | null;
  kind: string | null;
  format: string | null; // dollars | count | percent
  is_ratio: boolean | number | null;
  signed: boolean | number | null;
  cur_start: string | null;
  cur_end: string | null;
  prior_start: string | null;
  prior_end: string | null;
  cur_days: number | null;
  prior_days: number | null;
  partial: boolean | number | null;
  withheld_reason: string | null;
  data_through: string | null;
};

export type PacingRow = {
  metric: string;
  scope_kind: string;
  market: string;
  month: string;
  mtd_value: number | null;
  working_days_elapsed: number | null;
  working_days_total: number | null;
  rate_per_working_day: number | null;
  projected_month: number | null;
  budget: number | null;
  projected_pct_of_budget: number | null;
  budget_status: string | null;
  settle_status: string | null;
  format: string | null;
  data_through: string | null;
  labor_mtd?: number | null; // the ruled labor constant inside the company month to date
  budget_basis_mtd?: number | null; // month to date compared to the budget (company: without labor)
};

function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Row read for one metric at one scope kind (optionally one scope). No aggregate. */
export function windowsSql(metric: string, scopeKind: string, scope?: string): string {
  const where = [`metric = ${lit(metric)}`, `scope_kind = ${lit(scopeKind)}`, ...(scope ? [`scope = ${lit(scope)}`] : [])];
  // `window` is a reserved word in DuckDB SQL; the column is always quoted
  return `SELECT * FROM dm_windows WHERE ${where.join(" AND ")} ORDER BY scope, "window"`;
}

export function pacingSql(metric: string, month?: string): string {
  const where = [`metric = ${lit(metric)}`, ...(month ? [`month = ${lit(month)}`] : [])];
  return `SELECT * FROM dm_pacing WHERE ${where.join(" AND ")} ORDER BY month DESC, market`;
}

export function windowOrder(w: string): number {
  const i = WINDOW_ORDER.indexOf(w as WindowKey);
  return i < 0 ? 99 : i;
}

export type Fmt = "dollars" | "count" | "pct";

export function normalizeFormat(f: string | null | undefined, fallback: Fmt): Fmt {
  if (f === "dollars" || f === "count") return f;
  if (f === "pct" || f === "percent") return "pct";
  return fallback;
}

export function fmtValue(v: number | null | undefined, format: Fmt): string | null {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  if (format === "dollars") return `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
  if (format === "pct") return `${n.toFixed(2)}%`;
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function signed(n: number, text: string): string {
  return n > 0 ? `+${text}` : n < 0 ? (text.startsWith("-") ? text : `-${text}`) : text;
}

/** The change text: a ratio prints its point difference , a sum prints the change
 * and the percent change. Null delta prints the reason, never a blank. */
export function deltaText(row: WindowRow, kindFallback: "sum" | "ratio", format: Fmt): string {
  if (row.withheld_reason) return row.withheld_reason;
  if (row.delta === null || row.delta === undefined) {
    if (row.window === "mtd") return "Month to date";
    if (row.prior_value === null || row.prior_value === undefined) return "no prior window to compare";
    return "difference not published";
  }
  const isRatio = row.is_ratio === null || row.is_ratio === undefined ? kindFallback === "ratio" : Boolean(Number(row.is_ratio));
  const d = Number(row.delta);
  if (isRatio) {
    if (format === "pct") return `${signed(d, `${Math.abs(d).toFixed(2)} pts`)}`;
    const abs = fmtValue(Math.abs(d), format) ?? String(Math.abs(d));
    return `${signed(d, abs)} per unit`;
  }
  const abs = fmtValue(Math.abs(d), format) ?? String(Math.abs(d));
  const pct = row.delta_pct === null || row.delta_pct === undefined ? "" : ` (${signed(Number(row.delta_pct), `${Math.abs(Number(row.delta_pct)).toFixed(1)}%`)})`;
  return `${signed(d, abs)}${pct}`;
}

export function daysText(row: WindowRow): string {
  const cur = row.cur_days === null || row.cur_days === undefined ? "unknown" : Number(row.cur_days).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const prior = row.prior_days === null || row.prior_days === undefined ? "unknown" : Number(row.prior_days).toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (row.prior_days === null || row.prior_days === undefined) return `on ${cur} working days`;
  return `on ${cur} working days vs ${prior}`;
}

export function windowSpan(row: WindowRow): string {
  const cur = row.cur_start && row.cur_end ? `${row.cur_start} to ${row.cur_end}` : "window dates not published";
  const prior = row.prior_start && row.prior_end ? `${row.prior_start} to ${row.prior_end}` : (row.window === "mtd" ? "no prior window (month to date)" : "prior dates not published");
  return `${cur}; prior ${prior}`;
}

/** The text in the value cell: the figure, or the row's reason. Never blank, never a
 * substituted zero. */
export function valueText(row: WindowRow, format: Fmt): string {
  if (row.withheld_reason) return row.withheld_reason;
  const v = fmtValue(row.value, format);
  return v ?? "no value published for this window";
}

// ---- month-grain metrics from the marketing cost target feed --------------------------------------
// Contract correction from the live feeds (2026-10-15): dm_windows carries Net revenue per issued appointment and the
// cost percent rows only for SETTLED months (the database fact behind the strip holds
// settled months, so the open month is not in it). For those two picker metrics the
// month's row, month over month the prior month's row, year over year the same month a year
// earlier; there is no weekly window. While the current month is not settled the MoM and
// YoY comparisons are withheld (month to date against a full month is not like for like);
// the MTD value itself always renders. Per-market scopes read the same feed by office.
// Nothing here aggregates: every figure is read off ONE feed row.

export const GOLDEN_MONTH_METRICS = new Set(["nsli", "marketing_cost_pct"]);

export type GoldenMonthRow = {
  period: string;
  office: string;
  universe?: string;
  nsli_cents: number | null; // net only
  nsli_plus_prenet_cents?: number | null; // the ruled Net revenue per issued appointment: net revenue per net issued
  marketing_cost_pct: number | null;
  settle_status: string | null;
  as_of: string | null;
  confidence?: string | null;
};

export const NOT_LIKE_FOR_LIKE = "month to date against a full month is not like for like; compares when the month settles";
export const NO_WEEKLY_WINDOW = "month-grain metric, no weekly window";

function shiftMonth(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function goldenValue(row: GoldenMonthRow | undefined, metric: string): number | null {
  if (!row) return null;
  if (metric === "nsli") return row.nsli_plus_prenet_cents === null || row.nsli_plus_prenet_cents === undefined ? null : row.nsli_plus_prenet_cents / 100;
  return row.marketing_cost_pct ?? null;
}

/** Build the four comparison rows for one month-grain metric at one office ('COMPANY' for
 * the company) from marketing cost target monthly rows (office + universe already filtered by the
 * caller's SQL, rep_assigned). `current` is the month the board shows. */
export function goldenWindows(rows: GoldenMonthRow[], metric: "nsli" | "marketing_cost_pct", office: string, current: string): WindowRow[] {
  const byPeriod = new Map(rows.filter((r) => r.office === office).map((r) => [r.period, r]));
  const cur = byPeriod.get(current);
  const settled = (cur?.settle_status ?? "").toUpperCase() === "SETTLED";
  const format = metric === "nsli" ? "dollars" : "percent";
  const value = goldenValue(cur, metric);
  const base = {
    metric,
    scope_kind: office === "COMPANY" ? "company" : "market",
    scope: office,
    kind: "ratio",
    format,
    is_ratio: true,
    signed: true,
    cur_start: `${current}-01`,
    cur_end: cur?.as_of ?? null,
    cur_days: null,
    prior_days: null,
    partial: !settled,
    data_through: cur?.as_of ?? null,
  };
  const noValue = cur ? null : `no marketing cost target row for ${office} in ${current}`;
  const mtd: WindowRow = {
    ...base, window: "mtd", value, prior_value: null, delta: null, delta_pct: null,
    prior_start: null, prior_end: null,
    withheld_reason: noValue ?? (value === null ? `${metric === "nsli" ? "Net revenue per issued appointment" : "marketing cost percent"} not published for ${current}` : null),
  };
  const wow: WindowRow = { ...mtd, window: "wow", value: null, withheld_reason: NO_WEEKLY_WINDOW };
  const compare = (w: string, months: number): WindowRow => {
    const pp = shiftMonth(current, months);
    const prior = byPeriod.get(pp);
    const pv = goldenValue(prior, metric);
    const withheld = noValue ?? (!settled ? NOT_LIKE_FOR_LIKE : !prior ? `no marketing cost target row for ${office} in ${pp}` : pv === null ? `no value published for ${pp}` : null);
    const diff = withheld || value === null || pv === null ? null : value - pv;
    return {
      ...base, window: w, value: withheld ? null : value, prior_value: withheld ? null : pv,
      delta: diff, delta_pct: null,
      prior_start: `${pp}-01`, prior_end: prior?.as_of ?? null, withheld_reason: withheld,
    };
  };
  return [mtd, wow, compare("mom", -1), compare("yoy", -12)];
}

/** dm_windows carries `signed`; false means the definition behind the number is a proposal.
 * The value still renders, with this caveat beside it; only withheld_reason withholds. */
export const UNSIGNED_CAVEAT = "definition unsigned (proposed)";
export function signedCaveat(row: WindowRow): string | null {
  if (row.signed === null || row.signed === undefined) return null;
  return Boolean(Number(row.signed)) ? null : UNSIGNED_CAVEAT;
}
