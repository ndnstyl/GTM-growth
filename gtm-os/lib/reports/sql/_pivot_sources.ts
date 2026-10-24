// Pivot source definitions: a single fact table, or a named join preset over
// two facts joined through the contract's own dimension keys. Every source
// declares its own dims/measures so the pivot builder stays a picker, not a
// free-form SQL editor, while still producing plain reproducible SQL.
export type PivotDim = { key: string; label: string; expr: string };
export type PivotMeasure = { key: string; label: string; expr: string; kind: "sum" | "count" | "avg" | "min" | "max" | "derived" };

export type PivotSource = {
  key: string;
  label: string;
  from: string;
  dims: PivotDim[];
  measures: PivotMeasure[];
  dateExpr: string;
  confidenceExpr: string;
};

const CONF_RANK = `CASE confidence
  WHEN 'deterministic' THEN 4
  WHEN 'mapped' THEN 3
  WHEN 'provisional' THEN 2
  WHEN 'unavailable_low_n' THEN 1
  WHEN 'unavailable_grain' THEN 1
  WHEN 'unavailable_feed' THEN 0
  ELSE 1 END`;

export const PIVOT_SOURCES: PivotSource[] = [
  {
    key: "fact_spend_daily",
    label: "Ad spend by campaign, allocated to market",
    // every measure is the market's allocated share, so the market dim never
    // double-counts a split campaign and the rollup equals the campaign total.
    from: `(SELECT f.*, COALESCE(a.market_id, f.market_id) AS alloc_market_id,
                   COALESCE(a.share, 1.0) AS alloc_share, COALESCE(a.basis, 'grammar') AS alloc_basis
            FROM fact_spend_daily f
            LEFT JOIN campaign_market_allocation a
              ON a.platform = f.platform AND a.campaign_id = f.campaign_id
             AND TRY_CAST(a.spend_date AS DATE) = TRY_CAST(f.spend_date AS DATE)
            WHERE f.grain = 'campaign') s`,
    dateExpr: "s.spend_date",
    confidenceExpr: `(${CONF_RANK.replace(/confidence/g, "s.confidence")})`,
    dims: [
      { key: "platform", label: "Platform", expr: "s.platform" },
      { key: "campaign_id", label: "Campaign", expr: "s.campaign_id" },
      { key: "market_id", label: "Market", expr: "s.alloc_market_id" },
      { key: "alloc_basis", label: "Allocation basis", expr: "s.alloc_basis" },
      { key: "spend_date", label: "Date", expr: "s.spend_date" },
    ],
    measures: [
      { key: "spend", label: "Spend ($, allocated)", expr: "SUM(s.amount_cents * s.alloc_share) / 100.0", kind: "sum" },
      { key: "impressions", label: "Impressions (allocated)", expr: "SUM(s.impressions * s.alloc_share)", kind: "sum" },
      { key: "clicks", label: "Clicks (allocated)", expr: "SUM(s.clicks * s.alloc_share)", kind: "sum" },
      { key: "rows", label: "Rows", expr: "COUNT(*)", kind: "count" },
    ],
  },
  {
    key: "fact_lead_zip_daily",
    label: "Leads by zip",
    from: "fact_lead_zip_daily z",
    dateExpr: "z.lead_date",
    confidenceExpr: `(${CONF_RANK.replace(/confidence/g, "z.confidence")})`,
    dims: [
      { key: "zip", label: "Zip", expr: "z.zip" },
      { key: "state", label: "Zip state", expr: "z.state" },
      { key: "market_id", label: "Market", expr: "z.market_id" },
      { key: "lead_date", label: "Date", expr: "z.lead_date" },
    ],
    measures: [
      { key: "leads", label: "Leads", expr: "SUM(z.leads)", kind: "sum" },
      { key: "rows", label: "Row count", expr: "COUNT(*)", kind: "count" },
    ],
  },
  {
    key: "fact_gsc_daily",
    label: "Search Console queries",
    from: "fact_gsc_daily g",
    dateExpr: "g.date",
    confidenceExpr: `(${CONF_RANK.replace(/confidence/g, "g.confidence")})`,
    dims: [
      { key: "query", label: "Query", expr: "g.query" },
      { key: "page", label: "Page", expr: "g.page" },
      { key: "device", label: "Device", expr: "g.device" },
      { key: "date", label: "Date", expr: "g.date" },
    ],
    measures: [
      { key: "clicks", label: "Clicks", expr: "SUM(g.clicks)", kind: "sum" },
      { key: "impressions", label: "Impressions", expr: "SUM(g.impressions)", kind: "sum" },
      { key: "avg_position", label: "Avg position", expr: "AVG(g.position)", kind: "avg" },
    ],
  },
  {
    key: "preset_spend_funnel_market_day",
    label: "Spend and funnel, by market and day",
    from: `fact_funnel_daily f
      LEFT JOIN dim_market m ON f.office_id = m.market_id
      LEFT JOIN (SELECT x.*, COALESCE(a.market_id, x.market_id) AS alloc_market_id,
                        x.amount_cents * COALESCE(a.share, 1.0) AS alloc_cents
                 FROM fact_spend_daily x
                 LEFT JOIN campaign_market_allocation a
                   ON a.platform = x.platform AND a.campaign_id = x.campaign_id
                  AND TRY_CAST(a.spend_date AS DATE) = TRY_CAST(x.spend_date AS DATE)
                 WHERE x.grain = 'campaign') s
        ON s.alloc_market_id = m.market_id AND TRY_CAST(s.spend_date AS DATE) = TRY_CAST(f.date AS DATE)`,
    dateExpr: "f.date",
    confidenceExpr: `LEAST(${CONF_RANK.replace(/confidence/g, "f.confidence")}, COALESCE(${CONF_RANK.replace(/confidence/g, "s.confidence")}, 4))`,
    dims: [
      { key: "market_id", label: "Market", expr: "f.office_id" },
      { key: "date", label: "Date", expr: "f.date" },
    ],
    measures: [
      { key: "leads", label: "Leads", expr: "SUM(f.leads)", kind: "sum" },
      { key: "sets", label: "Appointments set", expr: "SUM(f.sets)", kind: "sum" },
      { key: "spend", label: "Spend ($, allocated)", expr: "SUM(s.alloc_cents) / 100.0", kind: "sum" },
      {
        key: "cpl",
        label: "Cost per lead",
        expr: "SUM(s.alloc_cents) / 100.0 / NULLIF(SUM(f.leads), 0)",
        kind: "derived",
      },
      {
        key: "cost_per_set",
        label: "Cost per set",
        expr: "SUM(s.alloc_cents) / 100.0 / NULLIF(SUM(f.sets), 0)",
        kind: "derived",
      },
    ],
  },
  // ---- spine feeds (registered explicitly by Shell, not via the
  // manifest: build_reports.py regenerates the manifest and would drop them).
  // T2 monthly grain; period is 'YYYY-MM' so dateExpr appends '-01' for the
  // TRY_CAST-to-DATE the filter presets apply.
  {
    key: "spine_funnel_monthly",
    label: "Revenue and funnel, monthly by market",
    from: `spine_funnel_monthly f`,
    dateExpr: "(f.period || '-01')",
    confidenceExpr: "4",
    dims: [
      { key: "period", label: "Month", expr: "f.period" },
      { key: "office", label: "Market", expr: "f.office" },
    ],
    measures: [
      { key: "gross", label: "Gross revenue ($)", expr: "SUM(f.gross_cents) / 100.0", kind: "sum" },
      { key: "net", label: "Net revenue ($)", expr: "SUM(f.net_cents) / 100.0", kind: "sum" },
      { key: "leads", label: "Leads", expr: "SUM(f.leads)", kind: "sum" },
      { key: "sets", label: "Appointments set", expr: "SUM(f.sets)", kind: "sum" },
      { key: "issues", label: "Appointments issued", expr: "SUM(f.issues)", kind: "sum" },
      { key: "demos", label: "Meetings held", expr: "SUM(f.demos)", kind: "sum" },
      { key: "sales", label: "Sales", expr: "SUM(f.sales)", kind: "sum" },
      { key: "aov", label: "Avg gross per sale ($)", expr: "SUM(f.gross_cents) / 100.0 / NULLIF(SUM(f.sales), 0)", kind: "derived" },
      { key: "sale_per_issue", label: "Sales per issued appointment (%)", expr: "100.0 * SUM(f.sales) / NULLIF(SUM(f.issues), 0)", kind: "derived" },
    ],
  },
  {
    key: "spine_spend_monthly",
    label: "Ad spend, monthly by platform and fee",
    from: `spine_spend_monthly s`,
    dateExpr: "(s.period || '-01')",
    confidenceExpr: "4",
    dims: [
      { key: "period", label: "Month", expr: "s.period" },
      { key: "platform", label: "Platform", expr: "s.platform" },
      { key: "source_key", label: "Source", expr: "s.source_key" },
      { key: "row_type", label: "Media vs fee", expr: "s.row_type" },
    ],
    measures: [
      { key: "spend", label: "Spend ($)", expr: "SUM(s.amount_cents) / 100.0", kind: "sum" },
      { key: "media_spend", label: "Media spend ($)", expr: "SUM(CASE WHEN s.row_type = 'media' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived" },
      { key: "fees", label: "Fees ($)", expr: "SUM(CASE WHEN s.row_type = 'fee' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived" },
    ],
  },
];

export function findSource(key: string): PivotSource | undefined {
  return PIVOT_SOURCES.find((s) => s.key === key);
}
