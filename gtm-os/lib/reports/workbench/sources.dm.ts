// Declared sources for the Digital Marketing board (data-model.md "App-side
// declared sources"). DATA ONLY: every measure here is one SQL definition consumed by
// pivotSql.ts. Keys shared with other sources (spend, media_spend, fees, sets, issues,
// demos, sales, sold, net, close_rate, set_rate, demo_rate, issue_rate) carry the SAME
// expr text as their first declaration, which is what validateRegistry checks; a key
// whose expr differs here gets its own name (mapped_spend, mapped_cost_per_set, ad_ctr),
// so no measure key ever carries two definitions.
//
// Feeds (served at /data/reports/<name>.parquet, exported by the spine lane):
//   dm_spend_daily, dm_source_chain_daily, dm_windows, dm_pacing. Dates are text
//   YYYY-MM-DD, money is int64 cents, export_batch_id rides on every feed.

import type { DeclaredSource, Measure } from "./sources";
import { PICKER_METRICS } from "../digital/picker";

const SPEND_DIMS = ["period", "date", "platform", "account", "campaign", "market", "basis", "bucket", "operator", "row_type", "confidence", "display_name", "segment", "lp_subsource"];
const CHAIN_DIMS = ["period", "date", "market", "source", "subsource", "subsource_code", "bucket", "operator", "confidence", "spend_note", "net_basis"];
const WINDOW_DIMS = ["metric", "scope_kind", "scope", "win", "partial"];
const PACING_DIMS = ["period", "metric", "market", "budget_status", "settle_status"];

// sidecar pull lands them; until then the cells read this reason, never a blank or zero.
export const DM_WITHHELD: Readonly<Record<string, string>> = Object.freeze({
  is_lost_budget: "withheld: Google search impression share lost to budget is not pulled yet; it lands with the read-only Google diagnostics pull",
  is_lost_rank: "withheld: Google search impression share lost to rank is not pulled yet; it lands with the read-only Google diagnostics pull",
  frequency: "withheld: Meta reach and frequency are not pulled yet; they land with the read-only Meta diagnostics pull",
  hook_rate: "withheld: Meta three-second video views are not pulled yet; they land with the read-only Meta diagnostics pull",
  cost_per_set_d35: "withheld: the day thirty-five set cohort for Meta in-house starts counting from the first in-house lead",
});

// dm_windows carries one row per metric x scope x window. Each picker metric gets three
// measures (value, prior, delta) so a panel template can carry a {metric} slot and still
// pass validateView with a declared measure key. MAX over the one row of a key is the
// identity; the dims the grain law allows are exactly the keys of that row.
function windowMeasures(): Measure[] {
  const out: Measure[] = [];
  for (const m of PICKER_METRICS) {
    // the Meta click-through rate is the dictionary's ctr read at the Meta platform scope
    const metricKey = m.key === "meta_ctr" ? "ctr": m.key;
    const withheldReason = DM_WITHHELD[m.key];
    const base = { kind: "derived" as const, additive: false, format: m.format, allowedDims: WINDOW_DIMS, ...(withheldReason ? { withheldReason }: {}) };
    out.push({ key: `win_${m.key}`, label: `${m.label}, this window`, expr: `MAX(CASE WHEN w.metric = '${metricKey}' THEN w.value END)`, ...base });
    out.push({ key: `win_prior_${m.key}`, label: `${m.label}, prior window`, expr: `MAX(CASE WHEN w.metric = '${metricKey}' THEN w.prior_value END)`, ...base });
    out.push({ key: `win_delta_${m.key}`, label: m.kind === "ratio" ? `${m.label}, point difference`: `${m.label}, change`, expr: `MAX(CASE WHEN w.metric = '${metricKey}' THEN w.delta END)`, ...base });
  }
  return out;
}

export const DM_SOURCES: DeclaredSource[] = [
  {
    key: "dm_spend",
    label: "Digital Marketing: paid and social spend by owner, market, platform, account, campaign (daily)",
    feeds: [{ name: "dm_spend_daily", url: "/data/reports/dm_spend_daily.parquet", registration: "explicit" }],
    from: "dm_spend_daily s",
    dateExpr: "(substr(s.spend_date, 1, 7) || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "substr(s.spend_date, 1, 7)" },
      { key: "date", label: "Day", expr: "s.spend_date" },
      { key: "platform", label: "Platform", expr: "s.platform" },
      { key: "account", label: "Account", expr: "COALESCE(s.display_name, s.account_id)" },
      { key: "campaign", label: "Campaign", expr: "s.campaign_id" },
      { key: "market", label: "Market", expr: "s.market" },
      { key: "basis", label: "Attribution basis", expr: "s.attribution_basis" },
      { key: "bucket", label: "Who runs it (in-house, vendor, tools, offline, labor)", expr: "s.bucket" },
      { key: "operator", label: "Operator", expr: "s.operator" },
      { key: "row_type", label: "Media, fee or non-media", expr: "s.row_type" },
      { key: "confidence", label: "Confidence", expr: "s.confidence" },
      { key: "display_name", label: "Account or line name", expr: "s.display_name" },
      { key: "segment", label: "Owner and row type (chart segment)", expr: "(s.bucket || ' ' || s.row_type)" },
      { key: "lp_subsource", label: "CRM sub-source", expr: "s.lp_subsource_descr" },
    ],
    measures: [
      { key: "spend", label: "Spend ($)", expr: "SUM(s.amount_cents) / 100.0", kind: "sum", format: "dollars", allowedDims: SPEND_DIMS },
      { key: "media_spend", label: "Media spend ($)", expr: "SUM(CASE WHEN s.row_type = 'media' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: SPEND_DIMS },
      { key: "fees", label: "Fees ($)", expr: "SUM(CASE WHEN s.row_type = 'fee' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: SPEND_DIMS },
      { key: "non_media_spend", label: "Non-media cost ($)", expr: "SUM(CASE WHEN s.row_type = 'non_media' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: SPEND_DIMS },
      { key: "tools_spend", label: "Tools and retainers ($)", expr: "SUM(CASE WHEN s.bucket = 'tools' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: SPEND_DIMS },
      // platform-reported rows are the platforms' own read and are never added to the recorded basis
      { key: "allin_spend", label: "All-in cost, recorded plus labor constant ($)", expr: "SUM(CASE WHEN s.attribution_basis IN ('crm_keyed', 'ruled_constant') THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: SPEND_DIMS },
      { key: "labor_spend", label: "Marketing labor, ruled constant ($)", expr: "SUM(CASE WHEN s.bucket = 'labor' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: SPEND_DIMS },
      { key: "ad_impressions", label: "Impressions", expr: "SUM(s.impressions)", kind: "sum", additive: true, format: "count", allowedDims: SPEND_DIMS },
      { key: "ad_clicks", label: "Clicks", expr: "SUM(s.clicks)", kind: "sum", additive: true, format: "count", allowedDims: SPEND_DIMS },
      { key: "ad_conversions", label: "Platform conversions", expr: "SUM(s.conversions)", kind: "sum", additive: true, format: "count", allowedDims: SPEND_DIMS },
      { key: "ad_ctr", label: "Click-through rate (%)", expr: "100.0 * SUM(s.clicks) / NULLIF(SUM(s.impressions), 0)", kind: "derived", additive: false, format: "pct", allowedDims: SPEND_DIMS },
      { key: "ad_cpc", label: "Cost per click ($)", expr: "SUM(CASE WHEN s.row_type = 'media' THEN s.amount_cents ELSE 0 END) / 100.0 / NULLIF(SUM(s.clicks), 0)", kind: "derived", additive: false, format: "dollars", allowedDims: SPEND_DIMS },
      { key: "ad_cpm", label: "Cost per thousand impressions ($)", expr: "1000.0 * SUM(CASE WHEN s.row_type = 'media' THEN s.amount_cents ELSE 0 END) / 100.0 / NULLIF(SUM(s.impressions), 0)", kind: "derived", additive: false, format: "dollars", allowedDims: SPEND_DIMS },
      { key: "ad_conversion_rate", label: "Conversion rate (%)", expr: "100.0 * SUM(s.conversions) / NULLIF(SUM(s.clicks), 0)", kind: "derived", additive: false, format: "pct", allowedDims: SPEND_DIMS },
    ],
    drill: {
      rowFeed: "dm_spend_daily",
      joinKeys: [
        { dimKey: "period", rowExpr: "substr(r.spend_date, 1, 7)" },
        { dimKey: "date", rowExpr: "r.spend_date" },
        { dimKey: "platform", rowExpr: "r.platform" },
        { dimKey: "account", rowExpr: "COALESCE(r.display_name, r.account_id)" },
        { dimKey: "campaign", rowExpr: "r.campaign_id" },
        { dimKey: "market", rowExpr: "r.market" },
        { dimKey: "basis", rowExpr: "r.attribution_basis" },
        { dimKey: "bucket", rowExpr: "r.bucket" },
        { dimKey: "operator", rowExpr: "r.operator" },
        { dimKey: "row_type", rowExpr: "r.row_type" },
        { dimKey: "confidence", rowExpr: "r.confidence" },
        { dimKey: "display_name", rowExpr: "r.display_name" },
        { dimKey: "segment", rowExpr: "(r.bucket || ' ' || r.row_type)" },
        { dimKey: "lp_subsource", rowExpr: "r.lp_subsource_descr" },
      ],
      reconcile: { measureKey: "spend", rowExpr: "SUM(r.amount_cents) / 100.0" },
      recordFields: [
        { key: "spend_date", label: "Day", tier: "T2" },
        { key: "platform", label: "Platform", tier: "T2" },
        { key: "display_name", label: "Account", tier: "T2" },
        { key: "campaign_id", label: "Campaign", tier: "T2" },
        { key: "market", label: "Market", tier: "T2" },
        { key: "attribution_basis", label: "Attribution basis", tier: "T2" },
        { key: "bucket", label: "Who runs it", tier: "T2" },
        { key: "row_type", label: "Row type", tier: "T2" },
        { key: "amount_cents", label: "Amount (¢)", tier: "T2" },
        { key: "confidence", label: "Confidence", tier: "T2" },
      ],
      recordTitle: "Spend day row",
    },
    tier: "T2",
  },
  {
    key: "dm_source_chain",
    label: "Digital Marketing: raw contacts to sale by source, sub-source and market, with mapped spend (daily)",
    feeds: [{ name: "dm_source_chain_daily", url: "/data/reports/dm_source_chain_daily.parquet", registration: "explicit" }],
    // raw_contacts is exposed a second time as `leads` so the registry's ONE definition of
    // raw_contacts (SUM(f.leads), entry-date clock, from the growth lens) and of set_rate
    // bind here unchanged; the column is the same count under the dictionary's alias.
    from: "(SELECT c.*, c.raw_contacts AS leads FROM dm_source_chain_daily c) f",
    dateExpr: "(substr(f.date, 1, 7) || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "substr(f.date, 1, 7)" },
      { key: "date", label: "Day", expr: "f.date" },
      { key: "market", label: "Market", expr: "f.market" },
      { key: "source", label: "Source", expr: "f.source_code" },
      { key: "subsource", label: "Sub-source", expr: "f.subsource_name" },
      { key: "subsource_code", label: "Sub-source code", expr: "f.subsource_code" },
      { key: "bucket", label: "Who runs it", expr: "f.bucket" },
      { key: "operator", label: "Operator", expr: "f.operator" },
      { key: "confidence", label: "Confidence", expr: "f.confidence" },
      { key: "spend_note", label: "Spend status", expr: "COALESCE(f.spend_note, 'spend mapped')" },
      { key: "net_basis", label: "Net basis", expr: "f.net_basis" },
    ],
    measures: [
      { key: "raw_contacts", label: "Raw contacts (every lead entered)", expr: "SUM(f.leads)", kind: "sum", additive: true, format: "count", allowedDims: CHAIN_DIMS },
      { key: "set_rate", label: "Set rate (indicative)", expr: "100.0 * SUM(f.sets) / NULLIF(SUM(f.leads), 0)", kind: "derived", additive: false, format: "pct", allowedDims: CHAIN_DIMS },
      { key: "sets", label: "Sets", expr: "SUM(f.sets)", kind: "sum", additive: true, format: "count", allowedDims: CHAIN_DIMS },
      { key: "issues", label: "Issues", expr: "SUM(f.issues)", kind: "sum", additive: true, format: "count", allowedDims: CHAIN_DIMS },
      { key: "demos", label: "Demos", expr: "SUM(f.demos)", kind: "sum", additive: true, format: "count", allowedDims: CHAIN_DIMS },
      { key: "sales", label: "Sales", expr: "SUM(f.sales)", kind: "sum", additive: true, format: "count", allowedDims: CHAIN_DIMS },
      { key: "sold", label: "Sold ($)", expr: "SUM(f.sold_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "net", label: "Net after cancels ($)", expr: "SUM(f.net_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "cancels", label: "Cancels", expr: "SUM(f.cancels)", kind: "sum", additive: true, format: "count", allowedDims: CHAIN_DIMS },
      { key: "cancel_gross", label: "Cancelled gross ($, by contract month)", expr: "SUM(f.cancel_gross_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "unruled_appointments", label: "Appointments with no ruled outcome", expr: "SUM(f.unruled_appointments)", kind: "sum", additive: true, format: "count", allowedDims: CHAIN_DIMS },
      { key: "mapped_spend", label: "Spend mapped to the sub-source ($)", expr: "SUM(f.spend_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "cost_per_raw_contact", label: "Cost per raw contact ($)", expr: "SUM(f.spend_cents) / 100.0 / NULLIF(SUM(f.raw_contacts), 0)", kind: "derived", additive: false, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "mapped_cost_per_set", label: "Cost per set ($, mapped spend)", expr: "SUM(f.spend_cents) / 100.0 / NULLIF(SUM(f.sets), 0)", kind: "derived", additive: false, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "mapped_cost_per_issue", label: "Cost per issued appointment ($, mapped spend)", expr: "SUM(f.spend_cents) / 100.0 / NULLIF(SUM(f.issues), 0)", kind: "derived", additive: false, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "mapped_cost_per_sale", label: "Cost per sale ($, mapped spend)", expr: "SUM(f.spend_cents) / 100.0 / NULLIF(SUM(f.sales), 0)", kind: "derived", additive: false, format: "dollars", allowedDims: CHAIN_DIMS },
      { key: "close_rate", label: "Close rate", expr: "100.0 * SUM(f.sales) / NULLIF(SUM(f.demos), 0)", kind: "derived", additive: false, format: "pct", allowedDims: CHAIN_DIMS },
      { key: "issue_rate", label: "Set to issued (indicative)", expr: "100.0 * SUM(f.issues) / NULLIF(SUM(f.sets), 0)", kind: "derived", additive: false, format: "pct", allowedDims: CHAIN_DIMS },
      { key: "demo_rate", label: "Demo rate", expr: "100.0 * SUM(f.demos) / NULLIF(SUM(f.issues), 0)", kind: "derived", additive: false, format: "pct", allowedDims: CHAIN_DIMS },
    ],
    drill: {
      rowFeed: "dm_source_chain_daily",
      joinKeys: [
        { dimKey: "period", rowExpr: "substr(r.date, 1, 7)" },
        { dimKey: "date", rowExpr: "r.date" },
        { dimKey: "market", rowExpr: "r.market" },
        { dimKey: "source", rowExpr: "r.source_code" },
        { dimKey: "subsource", rowExpr: "r.subsource_name" },
        { dimKey: "subsource_code", rowExpr: "r.subsource_code" },
        { dimKey: "bucket", rowExpr: "r.bucket" },
        { dimKey: "operator", rowExpr: "r.operator" },
        { dimKey: "confidence", rowExpr: "r.confidence" },
        { dimKey: "spend_note", rowExpr: "COALESCE(r.spend_note, 'spend mapped')" },
        { dimKey: "net_basis", rowExpr: "r.net_basis" },
      ],
      reconcile: { measureKey: "sets", rowExpr: "SUM(r.sets)" },
      recordFields: [
        { key: "date", label: "Day", tier: "T2" },
        { key: "market", label: "Market", tier: "T2" },
        { key: "source_code", label: "Source", tier: "T2" },
        { key: "subsource_name", label: "Sub-source", tier: "T2" },
        { key: "raw_contacts", label: "Raw contacts", tier: "T2" },
        { key: "sets", label: "Sets", tier: "T2" },
        { key: "issues", label: "Issues", tier: "T2" },
        { key: "demos", label: "Demos", tier: "T2" },
        { key: "sales", label: "Sales", tier: "T2" },
        { key: "sold_cents", label: "Sold (¢)", tier: "T2" },
        { key: "net_cents", label: "Net (¢)", tier: "T2" },
        { key: "spend_cents", label: "Spend (¢)", tier: "T2" },
        { key: "spend_note", label: "Spend status", tier: "T2" },
      ],
      recordTitle: "Source chain day row (date, market, sub-source and counts only)",
    },
    tier: "T2",
  },
  {
    key: "dm_windows",
    label: "Digital Marketing: comparison windows (month to date, week over week, month over month, year over year) on working-day working days",
    feeds: [{ name: "dm_windows", url: "/data/reports/dm_windows.parquet", registration: "explicit" }],
    from: "dm_windows w",
    dateExpr: "w.cur_end",
    dims: [
      { key: "metric", label: "Metric", expr: "w.metric" },
      { key: "scope_kind", label: "Scope kind", expr: "w.scope_kind" },
      { key: "scope", label: "Scope", expr: "w.scope" },
      // `window` is a reserved word in DuckDB SQL: the column is quoted and the dim key is `win`
      // so pivotSql's `AS win` alias parses.
      { key: "win", label: "Window", expr: 'w."window"' },
      { key: "partial", label: "Window still open", expr: "CASE WHEN w.partial THEN 'partial' ELSE 'complete' END" },
    ],
    measures: windowMeasures(),
    tier: "T2",
  },
  {
    key: "dm_pacing",
    label: "Digital Marketing: pacing and run rate per market against the ruled budget line",
    feeds: [{ name: "dm_pacing", url: "/data/reports/dm_pacing.parquet", registration: "explicit" }],
    from: "dm_pacing p",
    dateExpr: "(p.month || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "p.month" },
      { key: "metric", label: "Metric", expr: "p.metric" },
      { key: "market", label: "Market (ALL = company)", expr: "p.market" },
      { key: "budget_status", label: "Budget line status", expr: "p.budget_status" },
      { key: "settle_status", label: "Settle status", expr: "p.settle_status" },
    ],
    measures: [
      { key: "pace_mtd", label: "Month to date (one metric at a time)", expr: "MAX(p.mtd_value)", kind: "derived", additive: false, format: "count", allowedDims: PACING_DIMS },
      { key: "pace_rate", label: "Rate per working day", expr: "MAX(p.rate_per_working_day)", kind: "derived", additive: false, format: "count", allowedDims: PACING_DIMS },
      { key: "pace_projected", label: "Projected month", expr: "MAX(p.projected_month)", kind: "derived", additive: false, format: "count", allowedDims: PACING_DIMS },
      { key: "pace_budget", label: "Ruled budget", expr: "MAX(p.budget)", kind: "derived", additive: false, format: "count", allowedDims: PACING_DIMS },
      { key: "pace_pct_of_budget", label: "Projected percent of budget", expr: "MAX(p.projected_pct_of_budget)", kind: "derived", additive: false, format: "pct", allowedDims: PACING_DIMS },
      { key: "pace_days_elapsed", label: "Working days elapsed", expr: "MAX(p.working_days_elapsed)", kind: "derived", additive: false, format: "count", allowedDims: PACING_DIMS },
      { key: "pace_days_total", label: "Working days in month", expr: "MAX(p.working_days_total)", kind: "derived", additive: false, format: "count", allowedDims: PACING_DIMS },
    ],
    tier: "T2",
  },
];
