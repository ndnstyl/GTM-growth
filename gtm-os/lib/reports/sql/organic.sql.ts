// Organic tab queries: GA4 (fact_ga4_channel_daily, fact_ga4_geo_daily) and
// Search Console (fact_gsc_daily). Same inlining rule as geo.sql.ts: dates
// come from a fixed preset map, never free text, EXCEPT the query-explorer
// text filter, which a user does type: that one value is escaped (single
// quotes doubled) before interpolation, since duck.ts `query(sql)` takes one
// SQL string with no parameter binding.
//
// a cell that mixes confidences shows the number AND a badge. `unavailable_*`
// rows are EXCLUDED from every SUM/aggregate below (the number never counts
// them); `excluded_rows`/`excluded_reasons` say how many and why, so the UI
// can render `partial` (some excluded), `unavailable` (all excluded, no
// number), or the plain deterministic/mapped/provisional badge (none
// excluded) per the ruling. Never compute the badge from a MIN() that
// blends unavailable rows into the same rank scale as real confidence.

const AVAILABLE_RANK = `CASE confidence
  WHEN 'deterministic' THEN 4
  WHEN 'mapped' THEN 3
  WHEN 'provisional' THEN 2
  ELSE NULL
END`;

const IS_UNAVAILABLE = `confidence LIKE 'unavailable%'`;

// Appended to every SELECT list below: excluded_rows/total_rows let the UI
// decide partial vs unavailable vs plain; excluded_reasons is a de-duped
// list of the unavailable_* values behind an exclusion, for the tooltip.
// The site every GSC query on the Organic page reads, tiles and explorer tables
export const GSC_PRIMARY_SITE = "sc-domain:example.com";

const CONF_COLS = `
      MIN(CASE WHEN ${IS_UNAVAILABLE} THEN NULL ELSE ${AVAILABLE_RANK} END) AS conf_rank,
      COUNT(*) FILTER (WHERE ${IS_UNAVAILABLE}) AS excluded_rows,
      COUNT(*) AS total_rows,
      STRING_AGG(DISTINCT CASE WHEN ${IS_UNAVAILABLE} THEN confidence END, ', ') AS excluded_reasons,
      COUNT(DISTINCT date) AS distinct_days`;

function sumAvailable(expr: string): string {
  return `SUM(CASE WHEN ${IS_UNAVAILABLE} THEN NULL ELSE ${expr} END)`;
}

export function escapeLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

// ---------- GA4 (fact_ga4_channel_daily / fact_ga4_geo_daily) ----------

export function ga4KpiSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      ${sumAvailable("sessions")} AS sessions,
      ${sumAvailable("engaged_sessions")} AS engaged_sessions,
      ${sumAvailable("key_events")} AS key_events,
      ${sumAvailable("users")} AS users,
      ${CONF_COLS}
    FROM fact_ga4_channel_daily
    WHERE date >= '${fromDate}' AND date <= '${toDate}'
  `;
}

export function ga4MaxDateSql(): string {
  return `SELECT MAX(date) AS max_date FROM fact_ga4_channel_daily`;
}

export function ga4ByChannelSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      ga4_channel_group_raw AS channel_group,
      ${sumAvailable("sessions")} AS sessions,
      ${sumAvailable("engaged_sessions")} AS engaged_sessions,
      ${sumAvailable("key_events")} AS key_events,
      ${sumAvailable("users")} AS users,
      ${CONF_COLS}
    FROM fact_ga4_channel_daily
    WHERE date >= '${fromDate}' AND date <= '${toDate}'
    GROUP BY ga4_channel_group_raw
    ORDER BY sessions DESC
  `;
}

export function ga4ByLandingPageSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      landing_page,
      ${sumAvailable("sessions")} AS sessions,
      ${sumAvailable("engaged_sessions")} AS engaged_sessions,
      ${sumAvailable("key_events")} AS key_events,
      ${sumAvailable("users")} AS users,
      ${CONF_COLS}
    FROM fact_ga4_channel_daily
    WHERE date >= '${fromDate}' AND date <= '${toDate}'
    GROUP BY landing_page
    ORDER BY sessions DESC
    LIMIT 25
  `;
}

export function ga4ByGeoSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      city,
      region,
      ${sumAvailable("sessions")} AS sessions,
      ${sumAvailable("engaged_sessions")} AS engaged_sessions,
      ${sumAvailable("key_events")} AS key_events,
      ${sumAvailable("users")} AS users,
      ${CONF_COLS}
    FROM fact_ga4_geo_daily
    WHERE date >= '${fromDate}' AND date <= '${toDate}'
    GROUP BY city, region
    ORDER BY sessions DESC
    LIMIT 25
  `;
}

export function ga4GeoKpiSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      ${sumAvailable("sessions")} AS sessions,
      ${CONF_COLS}
    FROM fact_ga4_geo_daily
    WHERE date >= '${fromDate}' AND date <= '${toDate}'
  `;
}

// 28-day trend anchored on the newest GA4 date, not "today": the last two
// days are provisional so an as-of-today window would clip the trend early.
export function ga4TrendSql(): string {
  return `
    WITH bounds AS (SELECT MAX(date) AS max_date FROM fact_ga4_channel_daily)
    SELECT
      date,
      ${sumAvailable("sessions")} AS sessions,
      ${CONF_COLS}
    FROM fact_ga4_channel_daily, bounds
    WHERE date >= bounds.max_date - INTERVAL 27 DAY AND date <= bounds.max_date
    GROUP BY date
    ORDER BY date
  `;
}

// ---------- Search Console (fact_gsc_daily) ----------

export function gscMaxDateSql(): string {
  return `SELECT MAX(date) AS max_date FROM fact_gsc_daily WHERE site = '${GSC_PRIMARY_SITE}'`;
}

// ctr/position from the raw feed are per-row source values; the KPI ctr is
// recomputed as clicks/impressions over the rolled-up window (never averaged
// across rows), and position is weighted by impressions so a query with 1
// impression never counts the same as a query with 10,000. unavailable_*
// rows are excluded from both sums first, same as the GA4 queries above.
export function gscKpiSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      ${sumAvailable("clicks")} AS clicks,
      ${sumAvailable("impressions")} AS impressions,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("clicks")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS ctr,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("position * impressions")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS avg_position,
      ${CONF_COLS}
    FROM fact_gsc_daily
    WHERE site = '${GSC_PRIMARY_SITE}' AND date >= '${fromDate}' AND date <= '${toDate}'
  `;
}

export function gscQueryExplorerSql(opts: {
  fromDate: string;
  toDate: string;
  filterText?: string;
}): string {
  const { fromDate, toDate, filterText } = opts;
  const textClause = filterText
    ? `AND query ILIKE '%${escapeLiteral(filterText)}%'`
    : "";
  return `
    SELECT
      query,
      ${sumAvailable("clicks")} AS clicks,
      ${sumAvailable("impressions")} AS impressions,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("clicks")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS ctr,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("position * impressions")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS avg_position,
      ${CONF_COLS}
    FROM fact_gsc_daily
    WHERE site = '${GSC_PRIMARY_SITE}' AND date >= '${fromDate}' AND date <= '${toDate}'
      ${textClause}
    GROUP BY query
    ORDER BY clicks DESC
    LIMIT 50
  `;
}

export function gscPageExplorerSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      page,
      ${sumAvailable("clicks")} AS clicks,
      ${sumAvailable("impressions")} AS impressions,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("clicks")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS ctr,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("position * impressions")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS avg_position,
      ${CONF_COLS}
    FROM fact_gsc_daily
    WHERE site = '${GSC_PRIMARY_SITE}' AND date >= '${fromDate}' AND date <= '${toDate}'
    GROUP BY page
    ORDER BY clicks DESC
    LIMIT 25
  `;
}

export function gscByDeviceSql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      device,
      ${sumAvailable("clicks")} AS clicks,
      ${sumAvailable("impressions")} AS impressions,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("clicks")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS ctr,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("position * impressions")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS avg_position,
      ${CONF_COLS}
    FROM fact_gsc_daily
    WHERE site = '${GSC_PRIMARY_SITE}' AND date >= '${fromDate}' AND date <= '${toDate}'
    GROUP BY device
    ORDER BY clicks DESC
  `;
}

export function gscByCountrySql(opts: { fromDate: string; toDate: string }): string {
  const { fromDate, toDate } = opts;
  return `
    SELECT
      country,
      ${sumAvailable("clicks")} AS clicks,
      ${sumAvailable("impressions")} AS impressions,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("clicks")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS ctr,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("position * impressions")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS avg_position,
      ${CONF_COLS}
    FROM fact_gsc_daily
    WHERE site = '${GSC_PRIMARY_SITE}' AND date >= '${fromDate}' AND date <= '${toDate}'
    GROUP BY country
    ORDER BY clicks DESC
  `;
}

export function gscTrendSql(): string {
  return `
    WITH bounds AS (SELECT MAX(date) AS max_date FROM fact_gsc_daily WHERE site = '${GSC_PRIMARY_SITE}')
    SELECT
      date,
      ${sumAvailable("clicks")} AS clicks,
      ${CONF_COLS}
    FROM fact_gsc_daily, bounds
    WHERE site = '${GSC_PRIMARY_SITE}' AND date >= bounds.max_date - INTERVAL 27 DAY AND date <= bounds.max_date
    GROUP BY date
    ORDER BY date
  `;
}

// ---------- Search Console site totals (fact_gsc_site_daily, contract v1.5) ----------
// The ONLY table a site-level GSC total may be read from: fact_gsc_daily is
// the clicks trend read this table, filtered to one site.

export function gscSiteKpiSql(opts: { fromDate: string; toDate: string; site?: string }): string {
  const { fromDate, toDate, site = GSC_PRIMARY_SITE } = opts;
  return `
    SELECT
      ${sumAvailable("clicks")} AS clicks,
      ${sumAvailable("impressions")} AS impressions,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("clicks")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS ctr,
      CASE WHEN ${sumAvailable("impressions")} > 0 THEN ${sumAvailable("position * impressions")} * 1.0 / ${sumAvailable("impressions")} ELSE NULL END AS avg_position,
      ${CONF_COLS}
    FROM fact_gsc_site_daily
    WHERE site = '${site}' AND date >= '${fromDate}' AND date <= '${toDate}'
  `;
}

export function gscSiteTrendSql(site: string = GSC_PRIMARY_SITE): string {
  return `
    WITH bounds AS (SELECT MAX(date) AS max_date FROM fact_gsc_site_daily WHERE site = '${site}')
    SELECT
      date,
      ${sumAvailable("clicks")} AS clicks,
      ${CONF_COLS}
    FROM fact_gsc_site_daily, bounds
    WHERE site = '${site}' AND date >= bounds.max_date - INTERVAL 27 DAY AND date <= bounds.max_date
    GROUP BY date
    ORDER BY date
  `;
}
