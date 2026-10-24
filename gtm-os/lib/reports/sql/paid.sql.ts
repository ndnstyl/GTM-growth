// Paid Media queries (Google / Meta / Microsoft). Same discipline as
// geo.sql.ts: every query takes the SAME filtered window so a KPI strip and
// the table under it never drift, and every value here is inlined as a SQL
// string literal from a bounded input (date presets, platform enum, market
// codes from FilterBar options), never free text.
//
// Grain discipline: fact_spend_daily rows carry a
// `grain` column of campaign / ad_set / ad (the physical feeds use "ad" for
// what the contract prose calls ad_unit, same column, same key). Every
// query below filters to exactly one grain. Never sum across grains; a
// campaign-grain row and its own ad_set-grain children double the spend if
// unioned.
//
// Confidence on aggregated cells (data-contract.md ruling): aggregates are
// computed over available (non unavailable_*) rows only. available_rows /
// unavailable_rows / unavailable_reasons travel with every aggregate so the
// UI can render: all-unavailable -> no number, badge "unavailable";
// some-unavailable -> number + badge "partial" (tooltip names the excluded
// rows and why); none-unavailable -> plain mapped/provisional/deterministic
// badge, lowest among the rows actually summed.
//
// Coverage on aggregated cells (data-contract.md ruling): distinct_days is
// COUNT(DISTINCT spend_date) unfiltered by confidence (a day "has coverage"
// if any row landed for it, available or not); the caller compares that to
// the calendar days in the requested window and renders "partial, N of M
// days" the same way a mix of available/unavailable rows renders "partial".

function confRank(col: string): string {
  return `CASE ${col}
    WHEN 'mapped' THEN 4
    WHEN 'deterministic' THEN 4
    WHEN 'provisional' THEN 3
    ELSE 2 END`;
}

// Emits the confidence-state + day-coverage columns for one aggregation.
// `col` is the (optionally prefixed) confidence column in scope; the same
// prefix is applied by every SUM/AVG measure via avail() so a cell's number
// and its confidence/coverage state are read off the SAME row set.
function confAggCols(col: string, dateCol: string): string {
  return `
      COUNT(*) FILTER (WHERE ${col} NOT LIKE 'unavailable%') AS available_rows,
      COUNT(*) FILTER (WHERE ${col} LIKE 'unavailable%') AS unavailable_rows,
      STRING_AGG(DISTINCT ${col}, ', ') FILTER (WHERE ${col} LIKE 'unavailable%') AS unavailable_reasons,
      COUNT(DISTINCT ${dateCol}) AS distinct_days,
      CASE MIN(CASE WHEN ${col} NOT LIKE 'unavailable%' THEN ${confRank(col)} END)
        WHEN 4 THEN 'mapped'
        WHEN 3 THEN 'provisional'
        ELSE 'unknown'
      END AS lowest_confidence`;
}

// Wraps a SUM/AVG measure so it only aggregates rows that are NOT
// unavailable_*, the excluded count/reasons are reported separately via
// confAggCols so a cell never blends a real amount with an unavailable
// placeholder row.
function avail(col: string, expr: string): string {
  return `${expr} FILTER (WHERE ${col} NOT LIKE 'unavailable%')`;
}

export type PaidFilterOpts = {
  platform: string; // 'google_ads' | 'microsoft_ads'
  fromDate: string;
  toDate: string;
  market?: string;
};

// filter selects a campaign-day's ALLOCATED share of spend, not the whole row, so
// a South Florida campaign contributes its Stuart share to Stuart and its
// Deerfield share to Deerfield. Without a market filter the campaign row is used
// whole (shares sum to 1.0). A campaign-day with no allocation row falls back to
// the grammar's market_id at share 1.0.
const ALLOC_JOIN = (alias: string) => `
  LEFT JOIN campaign_market_allocation a
    ON a.platform = ${alias}.platform AND a.campaign_id = ${alias}.campaign_id
   AND TRY_CAST(a.spend_date AS DATE) = TRY_CAST(${alias}.spend_date AS DATE)`;
function allocated(alias: string, market: string | undefined): { from: string; where: string; share: string } {
  if (!market) return { from: `fact_spend_daily ${alias}`, where: "", share: "1.0" };
  return {
    from: `fact_spend_daily ${alias}${ALLOC_JOIN(alias)}`,
    where: `AND COALESCE(a.market_id, ${alias}.market_id) = '${market}'`,
    share: "COALESCE(a.share, 1.0)",
  };
}

// Which dim views a campaign/drill query should join against for names.
// Contract views (dim_campaign, dim_ad_set, dim_ad_unit) resolve only when
// `_manifest.json` lists a matching `<feed>__<table>` key; when the physical
// parquet exists on disk but the manifest has not been regenerated to list
// it, PaidMedia.tsx registers the raw file directly under its own filename
// (e.g. "google_ads__dim_campaign") and passes that name here instead.
export type DimSources = {
  campaign?: string; // view name to join for campaign name, defaults to "dim_campaign"
  adSet?: string; // defaults to "dim_ad_set"
  adUnit?: string; // defaults to "dim_ad_unit"
};

export function kpiSql(opts: PaidFilterOpts): string {
  const { platform, fromDate, toDate, market } = opts;
  const al = allocated("f", market);
  return `
    SELECT
      ROUND(${avail("f.confidence", `SUM(f.amount_cents * ${al.share})`)})::BIGINT AS spend_cents,
      ROUND(${avail("f.confidence", `SUM(f.impressions * ${al.share})`)})::BIGINT AS impressions,
      ROUND(${avail("f.confidence", `SUM(f.clicks * ${al.share})`)})::BIGINT AS clicks,
      ${avail("f.confidence", `SUM(f.conversions * ${al.share})`)} AS conversions,
      ${avail("f.confidence", `SUM(f.all_conversions * ${al.share})`)} AS all_conversions,
      ROUND(${avail("f.confidence", `SUM(f.conversion_value_cents * ${al.share})`)})::BIGINT AS conversion_value_cents,
      ${avail("f.confidence", "SUM(f.impression_share * f.impressions)")} / NULLIF(${avail("f.confidence", "SUM(CASE WHEN f.impression_share IS NOT NULL THEN f.impressions ELSE 0 END)")}, 0) AS impression_share,
      ${avail("f.confidence", "SUM(f.video_views)")} AS video_views,
      ${avail("f.confidence", "SUM(f.reach)")} AS reach,
      ${avail("f.confidence", "AVG(f.frequency)")} AS frequency,
      ${confAggCols("f.confidence", "f.spend_date")},
      COUNT(*) AS row_count
    FROM ${al.from}
    WHERE f.platform = '${platform}'
      AND f.grain = 'campaign'
      AND f.spend_date >= DATE '${fromDate}' AND f.spend_date <= DATE '${toDate}'
      ${al.where}
  `;
}

// Campaign-grain table. LEFT JOINs dim_campaign/dim_channel so a resolved
// dim shows names/channel; the contract view always exists (typed empty
// when no physical file matches the manifest), so the join degrades to NULL
// and every display falls back to the bare id, never a broken query. Pass
// `dims.campaign` to join a directly-registered view instead (see DimSources).
export function campaignTableSql(opts: PaidFilterOpts & { dims?: DimSources }): string {
  const { platform, fromDate, toDate, market, dims } = opts;
  const campaignView = dims?.campaign ?? "dim_campaign";
  const al = allocated("s", market);
  // market_label: a single-market campaign shows its market; a
  // split campaign shows every market with its spend-weighted share over the
  // window and the basis, e.g. "STUART 62% / DEERFIELD 38% (geo_spend)".
  return `
    WITH alloc AS (
      SELECT
        x.campaign_id,
        x.market_id,
        -- the campaign's WHOLE window spend is the denominator (shares sum to 1.0 per
        -- day, so the campaign-level sum of share*amount is the campaign total)
        SUM(x.share * x.amount_cents) / NULLIF(SUM(SUM(x.share * x.amount_cents)) OVER (PARTITION BY x.campaign_id), 0) AS w_share,
        STRING_AGG(DISTINCT x.basis, '+' ORDER BY x.basis) AS basis,
        MAX(x.market_count) AS market_count
      FROM (
        SELECT f.campaign_id, f.amount_cents,
               COALESCE(a.market_id, f.market_id) AS market_id,
               COALESCE(a.share, 1.0) AS share,
               COALESCE(a.basis, 'grammar') AS basis,
               COALESCE(a.market_count, 1) AS market_count
        FROM fact_spend_daily f${ALLOC_JOIN("f")}
        WHERE f.platform = '${platform}' AND f.grain = 'campaign'
          AND f.spend_date >= DATE '${fromDate}' AND f.spend_date <= DATE '${toDate}'
      ) x
      GROUP BY x.campaign_id, x.market_id
    ),
    labels AS (
      SELECT
        al.campaign_id,
        CASE WHEN MAX(al.market_count) > 1
             THEN STRING_AGG(COALESCE(dm.name, al.market_id) || ' ' || ROUND(100 * al.w_share)::INTEGER::VARCHAR || '%', ' / ' ORDER BY al.w_share DESC)
                  || ' (' || STRING_AGG(DISTINCT al.basis, '+' ORDER BY al.basis) || ')'
             ELSE MAX(COALESCE(dm.name, al.market_id))
        END AS market_label
      FROM alloc al
      LEFT JOIN dim_market dm ON dm.market_id = al.market_id
      GROUP BY al.campaign_id
    )
    SELECT
      s.campaign_id,
      COALESCE(c.name, s.campaign_id) AS campaign_name,
      COALESCE(ch.name, 'unassigned') AS channel_name,
      COALESCE(l.market_label, m.name, s.market_id, 'unassigned') AS market_label,
      ROUND(${avail("s.confidence", `SUM(s.amount_cents * ${al.share})`)})::BIGINT AS spend_cents,
      ROUND(${avail("s.confidence", `SUM(s.impressions * ${al.share})`)})::BIGINT AS impressions,
      ROUND(${avail("s.confidence", `SUM(s.clicks * ${al.share})`)})::BIGINT AS clicks,
      ${avail("s.confidence", `SUM(s.conversions * ${al.share})`)} AS conversions,
      ${avail("s.confidence", `SUM(s.all_conversions * ${al.share})`)} AS all_conversions,
      COUNT(*) FILTER (WHERE s.all_conversions IS NULL AND s.confidence NOT LIKE 'unavailable%') AS all_conversions_null_rows,
      ${avail("s.confidence", "SUM(s.conversion_value_cents)")} AS conversion_value_cents,
      ${avail("s.confidence", "SUM(s.impression_share * s.impressions)")} / NULLIF(${avail("s.confidence", "SUM(CASE WHEN s.impression_share IS NOT NULL THEN s.impressions ELSE 0 END)")}, 0) AS impression_share,
      ${avail("s.confidence", "SUM(s.video_views)")} AS video_views,
      ${avail("s.confidence", "SUM(s.reach)")} AS reach,
      ${avail("s.confidence", "AVG(s.frequency)")} AS frequency,
      ${confAggCols("s.confidence", "s.spend_date")}
    FROM ${al.from}
    LEFT JOIN ${campaignView} c ON c.campaign_id = s.campaign_id
    LEFT JOIN dim_channel ch ON ch.channel_id = c.channel_id
    LEFT JOIN dim_market m ON m.market_id = s.market_id
    LEFT JOIN labels l ON l.campaign_id = s.campaign_id
    WHERE s.platform = '${platform}'
      AND s.grain = 'campaign'
      AND s.spend_date >= DATE '${fromDate}' AND s.spend_date <= DATE '${toDate}'
      ${al.where}
    GROUP BY s.campaign_id, c.name, ch.name, m.name, s.market_id, l.market_label
    ORDER BY spend_cents DESC
  `;
}

// `conversions` = counted toward the campaign's bidding goal; `all_conversions` =
// every enabled action. none_reported:* flag rows never match a real campaign_id.
export function conversionActionBreakdownSql(opts: PaidFilterOpts & { campaignId: string }): string {
  const { platform, fromDate, toDate, campaignId } = opts;
  return `
    SELECT
      conversion_action_id,
      COALESCE(MAX(conversion_action_name), conversion_action_id) AS action_name,
      MAX(category) AS category,
      BOOL_OR(COALESCE(primary_for_goal, FALSE)) AS primary_for_goal,
      SUM(conversions) AS conversions,
      SUM(all_conversions) AS all_conversions,
      COUNT(DISTINCT spend_date) AS days
    FROM fact_conversion_action_daily
    WHERE platform = '${platform}'
      AND campaign_id = '${campaignId}'
      AND spend_date >= DATE '${fromDate}' AND spend_date <= DATE '${toDate}'
    GROUP BY conversion_action_id
    ORDER BY all_conversions DESC
  `;
}

// Ad-set (or ad) grain, drilled from one campaign_id. `grain` is 'ad_set' or
// 'ad' (the physical grain label for what the contract calls ad_unit).
export function drillTableSql(
  opts: PaidFilterOpts & { campaignId: string; grain: "ad_set" | "ad"; dims?: DimSources }
): string {
  const { platform, fromDate, toDate, campaignId, grain, dims } = opts;
  const idCol = grain === "ad_set" ? "ad_set_id" : "ad_unit_id";
  const dimView = grain === "ad_set" ? dims?.adSet ?? "dim_ad_set" : dims?.adUnit ?? "dim_ad_unit";
  return `
    SELECT
      s.${idCol} AS unit_id,
      COALESCE(d.name, s.${idCol}) AS unit_name,
      ${avail("s.confidence", "SUM(s.amount_cents)")} AS spend_cents,
      ${avail("s.confidence", "SUM(s.impressions)")} AS impressions,
      ${avail("s.confidence", "SUM(s.clicks)")} AS clicks,
      ${avail("s.confidence", "SUM(s.conversions)")} AS conversions,
      ${avail("s.confidence", "SUM(s.all_conversions)")} AS all_conversions,
      ${avail("s.confidence", "SUM(s.conversion_value_cents)")} AS conversion_value_cents,
      ${confAggCols("s.confidence", "s.spend_date")}
    FROM fact_spend_daily s
    LEFT JOIN ${dimView} d ON d.${idCol} = s.${idCol}
    WHERE s.platform = '${platform}'
      AND s.grain = '${grain}'
      AND s.campaign_id = '${campaignId}'
      AND s.spend_date >= DATE '${fromDate}' AND s.spend_date <= DATE '${toDate}'
    GROUP BY s.${idCol}, d.name
    ORDER BY spend_cents DESC
  `;
}

export function geoTableSql(opts: PaidFilterOpts & { geoType?: string }): string {
  const { platform, fromDate, toDate, geoType = "city" } = opts;
  return `
    SELECT
      geo_id,
      geo_name,
      geo_type,
      COALESCE(location_type, 'unspecified') AS location_type,
      ${avail("confidence", "SUM(amount_cents)")} AS spend_cents,
      ${avail("confidence", "SUM(impressions)")} AS impressions,
      ${avail("confidence", "SUM(clicks)")} AS clicks,
      ${avail("confidence", "SUM(conversions)")} AS conversions,
      ${confAggCols("confidence", "spend_date")}
    FROM fact_geo_spend_daily
    WHERE platform = '${platform}'
      AND spend_date >= DATE '${fromDate}' AND spend_date <= DATE '${toDate}'
      -- ONE geo_type only. Google reports a single delivery event in parallel as
      -- city, postal AND county (measured 2026-08-23: each read exactly $3,366 on
      -- 2026-08-21), so a table mixing them shows the same dollars three times.
      -- data-contract.md line 48 rules this; the page must not re-open the trap.
      AND geo_type = '${geoType}'
    GROUP BY geo_id, geo_name, geo_type, location_type
    ORDER BY spend_cents DESC
    LIMIT 25
  `;
}

// Fixed 28-day trend, independent of the FilterBar preset, ending at toDate.
// Zero-filled via generate_series so a day with no underlying rows draws as
// an empty bar instead of vanishing from the array (which used to make two
// real days of data look like two full-height bars with no scale). spend_date
// is a DATE column (contract views TRY_CAST it); duck.ts hands query()
// callers back an ISO "YYYY-MM-DD" string for DATE columns, read off the
// result schema, never an epoch number, format trend axis labels from that
// string directly.
export function trendSql(opts: { platform: string; toDate: string }): string {
  const { platform, toDate } = opts;
  return `
    WITH days AS (
      SELECT (DATE '${toDate}' - INTERVAL (27 - n) DAY) AS spend_date
      FROM generate_series(0, 27) AS t(n)
    ),
    agg AS (
      SELECT
        spend_date,
        ${avail("confidence", "SUM(amount_cents)")} AS spend_cents,
        ${confAggCols("confidence", "spend_date")}
      FROM fact_spend_daily
      WHERE platform = '${platform}'
        AND grain = 'campaign'
        AND spend_date <= DATE '${toDate}'
        AND spend_date >= (DATE '${toDate}' - INTERVAL 27 DAY)
      GROUP BY spend_date
    )
    SELECT
      days.spend_date AS spend_date,
      COALESCE(agg.spend_cents, 0) AS spend_cents,
      COALESCE(agg.available_rows, 0) AS available_rows,
      COALESCE(agg.unavailable_rows, 0) AS unavailable_rows,
      agg.unavailable_reasons AS unavailable_reasons,
      COALESCE(agg.lowest_confidence, 'unknown') AS lowest_confidence
    FROM days
    LEFT JOIN agg ON agg.spend_date = days.spend_date
    ORDER BY days.spend_date ASC
  `;
}
