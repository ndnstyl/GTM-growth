// Overview tab queries. Same params-inlined-as-literals pattern as geo.sql.ts
// (DuckDB-WASM's connection.query() takes one SQL string; market/preset are
// bounded values from FilterBar, never free text). Money stays in cents
// through SQL; components divide by 100 only at render time.
//
// KPI definitions:
//   spend, leads, CPL = spend/leads, sets, cost/set = spend/sets,
//   issued (fact_funnel_daily.issues), sales, cost/sale = spend/sales,
//   gross (gross_cents), MER = spend / net where net = gross until the RTC
//   feed exists (gross-basis, labelled in the UI), Gross revenue per issued appointment = gross/issued,
//   close rate = sales/issued.
//
// fact_spend_daily requires grain='campaign' or SUM(amount_cents) multiplies
// dollars across rollup levels (data-contract.md). fact_funnel_daily has no
// market_id column; it is recorded by office_id, which the existing
// preset_spend_funnel_market_day pivot source (_pivot_sources.ts) already
// treats as the market/office code: same assumption reused here.

import { DatePreset } from "@/components/reports/FilterBar";

// Mirrors Pivot.tsx's presetToDateSql (not exported there), so overview and
// explore read identical windows for the same preset without importing a
// client-only module cross-file.
export function presetDateSql(dateExprRaw: string, preset: DatePreset): string {
  const dateExpr = `TRY_CAST(${dateExprRaw} AS DATE)`;
  const d = (expr: string) => `CAST(${expr} AS DATE)`;
  switch (preset) {
    case "yesterday":
      return `${dateExpr} = current_date - INTERVAL 1 DAY`;
    case "wtd":
      return `${dateExpr} >= ${d("date_trunc('week', current_date)")} AND ${dateExpr} <= current_date`;
    case "mtd":
      return `${dateExpr} >= ${d("date_trunc('month', current_date)")} AND ${dateExpr} <= current_date`;
    case "last7":
      return `${dateExpr} >= current_date - INTERVAL 7 DAY AND ${dateExpr} < current_date`;
    case "last28":
      return `${dateExpr} >= current_date - INTERVAL 28 DAY AND ${dateExpr} < current_date`;
    case "mom":
      return `${dateExpr} >= ${d("date_trunc('month', current_date - INTERVAL 1 MONTH)")} AND ${dateExpr} < ${d("date_trunc('month', current_date)")}`;
    case "ytd":
      return `${dateExpr} >= ${d("date_trunc('year', current_date)")} AND ${dateExpr} <= current_date`;
    default:
      return "1=1";
  }
}

// Window start/end as SQL DATE expressions per preset, used only for
// coverage math (days_in_window). Mirrors presetDateSql's own boundaries.
export function presetBoundsSql(preset: DatePreset): { start: string; end: string } {
  const d = (expr: string) => `CAST(${expr} AS DATE)`;
  switch (preset) {
    case "yesterday":
      return { start: "current_date - INTERVAL 1 DAY", end: "current_date - INTERVAL 1 DAY" };
    case "wtd":
      return { start: d("date_trunc('week', current_date)"), end: "current_date" };
    case "mtd":
      return { start: d("date_trunc('month', current_date)"), end: "current_date" };
    case "last7":
      return { start: "current_date - INTERVAL 7 DAY", end: "current_date - INTERVAL 1 DAY" };
    case "last28":
      return { start: "current_date - INTERVAL 28 DAY", end: "current_date - INTERVAL 1 DAY" };
    case "mom":
      return {
        start: d("date_trunc('month', current_date - INTERVAL 1 MONTH)"),
        end: `(${d("date_trunc('month', current_date)")} - INTERVAL 1 DAY)`,
      };
    case "ytd":
      return { start: d("date_trunc('year', current_date)"), end: "current_date" };
    default:
      return { start: "current_date", end: "current_date" };
  }
}

function daysInWindowSql(preset: DatePreset): string {
  const { start, end } = presetBoundsSql(preset);
  return `(date_diff('day', ${start}, ${end}) + 1)`;
}

// Confidence rank, same mapping as _pivot_sources.ts CONF_RANK (duplicated,
// not exported there): deterministic=4, mapped=3, provisional=2,
// unavailable_low_n/unavailable_grain=1, unavailable_feed/NULL=0.
const CONF_RANK = (col: string) => `CASE ${col}
  WHEN 'deterministic' THEN 4
  WHEN 'mapped' THEN 3
  WHEN 'provisional' THEN 2
  WHEN 'unavailable_low_n' THEN 1
  WHEN 'unavailable_grain' THEN 1
  WHEN 'unavailable_feed' THEN 0
  ELSE 1 END`;

export type OverviewOpts = { preset: DatePreset; market?: string };

// Ad spend is the recorded all-in figure (online media, agency fees, offline media) by market and day, the same
// rows lib/demo/metrics.ts totals, so a market table or trend never disagrees with a headline tile.
const ALLOCATED_SPEND = `
  SELECT
    TRY_CAST(spend_date AS DATE) AS spend_date,
    platform, campaign_id, confidence, as_of,
    market AS alloc_market_id,
    amount_cents AS alloc_cents,
    1.0 AS alloc_share,
    'recorded' AS alloc_basis
  FROM dm_spend_daily
  WHERE bucket IN ('inhouse', 'vendor', 'offline')`;

// Coverage + availability-split confidence per feed: distinct_days /
// days_in_window (0 days = unavailable, no number), total_rows /
// unavailable_rows (some unavailable_* rows among otherwise-available rows =
// partial with a number; ALL rows unavailable_* = unavailable, no number),
// and worst_available_confidence computed over the NON-unavailable rows only
// (excluded rows never drag a partial cell's displayed confidence down to
// "unavailable").
export function overviewTotalsSql(opts: OverviewOpts): string {
  const { preset, market } = opts;
  const spendMarket = market ? `AND alloc_market_id = '${market}'` : "";
  const funnelMarket = market ? `AND office_id = '${market}'` : "";
  const daysInWindow = daysInWindowSql(preset);
  return `
    WITH spend AS (
      SELECT
        ROUND(SUM(alloc_cents))::BIGINT AS spend_cents,
        MAX(as_of) AS spend_as_of,
        COUNT(*) AS spend_rows,
        COUNT(*) FILTER (WHERE confidence LIKE 'unavailable_%') AS spend_unavailable_rows,
        COUNT(DISTINCT TRY_CAST(spend_date AS DATE)) AS spend_distinct_days,
        ${daysInWindow} AS spend_days_in_window,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC)
          FILTER (WHERE confidence NOT LIKE 'unavailable_%'))[1] AS spend_worst_available_confidence,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC))[1] AS spend_confidence,
        STRING_AGG(DISTINCT platform, ', ' ORDER BY platform)
          FILTER (WHERE confidence NOT LIKE 'unavailable_%') AS spend_platforms
      FROM (${ALLOCATED_SPEND}) x
      WHERE ${presetDateSql("spend_date", preset)}
        ${spendMarket}
    ),
    funnel AS (
      SELECT
        SUM(leads) AS leads,
        SUM(sets) AS sets,
        SUM(issues) AS issues,
        SUM(demos) AS demos,
        SUM(sales) AS sales,
        SUM(gross_cents) AS gross_cents,
        SUM(COALESCE(net_cents, gross_cents - COALESCE(cancel_gross_cents, 0))) AS net_cents,
        MAX(as_of) AS funnel_as_of,
        COUNT(*) AS funnel_rows,
        COUNT(*) FILTER (WHERE confidence LIKE 'unavailable_%') AS funnel_unavailable_rows,
        COUNT(DISTINCT TRY_CAST(date AS DATE)) AS funnel_distinct_days,
        ${daysInWindow} AS funnel_days_in_window,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC)
          FILTER (WHERE confidence NOT LIKE 'unavailable_%'))[1] AS funnel_worst_available_confidence,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC))[1] AS funnel_confidence
      FROM fact_funnel_daily
      WHERE ${presetDateSql("date", preset)}
        ${funnelMarket}
    )
    SELECT * FROM spend, funnel
  `;
}

export function overviewByMarketSql(opts: { preset: DatePreset }): string {
  const { preset } = opts;
  const daysInWindow = daysInWindowSql(preset);
  return `
    WITH spend AS (
      SELECT
        alloc_market_id AS market_id,
        ROUND(SUM(alloc_cents))::BIGINT AS spend_cents,
        COUNT(*) AS spend_rows,
        COUNT(*) FILTER (WHERE confidence LIKE 'unavailable_%') AS spend_unavailable_rows,
        COUNT(DISTINCT TRY_CAST(spend_date AS DATE)) AS spend_distinct_days,
        ${daysInWindow} AS spend_days_in_window,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC)
          FILTER (WHERE confidence NOT LIKE 'unavailable_%'))[1] AS spend_worst_available_confidence,
        COUNT(DISTINCT campaign_id) FILTER (WHERE alloc_share < 1.0) AS split_campaigns,
        STRING_AGG(DISTINCT alloc_basis, ', ' ORDER BY alloc_basis) FILTER (WHERE alloc_share < 1.0) AS split_basis
      FROM (${ALLOCATED_SPEND}) x
      WHERE ${presetDateSql("spend_date", preset)}
      GROUP BY alloc_market_id
    ),
    funnel AS (
      SELECT
        office_id AS market_id,
        SUM(leads) AS leads,
        SUM(sets) AS sets,
        SUM(issues) AS issues,
        SUM(sales) AS sales,
        SUM(gross_cents) AS gross_cents,
        COUNT(*) AS funnel_rows,
        COUNT(*) FILTER (WHERE confidence LIKE 'unavailable_%') AS funnel_unavailable_rows,
        COUNT(DISTINCT TRY_CAST(date AS DATE)) AS funnel_distinct_days,
        ${daysInWindow} AS funnel_days_in_window,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC)
          FILTER (WHERE confidence NOT LIKE 'unavailable_%'))[1] AS funnel_worst_available_confidence
      FROM fact_funnel_daily
      WHERE ${presetDateSql("date", preset)}
      GROUP BY office_id
    )
    SELECT
      COALESCE(f.market_id, s.market_id) AS market_id,
      m.name AS market_name,
      s.spend_cents, s.spend_rows, s.spend_unavailable_rows, s.spend_distinct_days, s.spend_days_in_window, s.spend_worst_available_confidence,
      s.split_campaigns, s.split_basis,
      f.leads, f.sets, f.issues, f.sales, f.gross_cents, f.funnel_rows, f.funnel_unavailable_rows, f.funnel_distinct_days, f.funnel_days_in_window, f.funnel_worst_available_confidence
    FROM funnel f
    FULL OUTER JOIN spend s ON s.market_id = f.market_id
    LEFT JOIN dim_market m ON m.market_id = COALESCE(f.market_id, s.market_id)
    ORDER BY COALESCE(f.gross_cents, 0) DESC
  `;
}

// 28-day trend, two independently-scaled series (spend, leads) never one
// dual-axis chart. Fixed last28 window regardless of the active preset so
// the trend always shows the same span.
export function overviewTrend28Sql(opts: { market?: string }): string {
  const { market } = opts;
  const spendMarket = market ? `AND alloc_market_id = '${market}'` : "";
  const funnelMarket = market ? `AND office_id = '${market}'` : "";
  return `
    WITH days AS (
      SELECT (current_date - INTERVAL (n) DAY)::DATE AS d
      FROM generate_series(0, 27) AS t(n)
    ),
    spend AS (
      SELECT
        TRY_CAST(spend_date AS DATE) AS d,
        ROUND(SUM(alloc_cents))::BIGINT AS spend_cents,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC))[1] AS spend_confidence
      FROM (${ALLOCATED_SPEND}) x
      WHERE TRY_CAST(spend_date AS DATE) >= current_date - INTERVAL 28 DAY
        ${spendMarket}
      GROUP BY 1
    ),
    funnel AS (
      SELECT
        TRY_CAST(date AS DATE) AS d,
        SUM(leads) AS leads,
        (ARRAY_AGG(confidence ORDER BY ${CONF_RANK("confidence")} ASC))[1] AS funnel_confidence
      FROM fact_funnel_daily
      WHERE TRY_CAST(date AS DATE) >= current_date - INTERVAL 28 DAY
        ${funnelMarket}
      GROUP BY 1
    )
    SELECT days.d AS date, spend.spend_cents, spend.spend_confidence,
           funnel.leads, funnel.funnel_confidence
    FROM days
    LEFT JOIN spend ON spend.d = days.d
    LEFT JOIN funnel ON funnel.d = days.d
    ORDER BY days.d
  `;
}
