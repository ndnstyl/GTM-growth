// Leads & Geo map queries. Named geo.sql.ts (not a bare .sql file) because this
// app's export build has no raw-text loader configured for .sql imports
// (next.config.ts has no webpack rule for it): a plain .sql file cannot be
// imported by a bundled TS module here without one. Every query takes the
// SAME filtered window (date range + market + source) so a numerator and a
// denominator computed from one call never drift.
//
// Params are inlined as SQL string literals (not parameterized placeholders)
// because DuckDB-WASM's connection.query() here takes a single SQL string
// (see lib/reports/duck.ts `query<T>(sql)`); callers MUST escape/validate
// values before interpolating (dates come from a fixed preset map, market/
// source come from a bounded options list rendered by FilterBar, never free
// text from a user).

export function zipPointsSql(opts: {
  fromDate: string;
  toDate: string;
  market?: string;
  source?: string;
}): string {
  const { fromDate, toDate, market, source } = opts;
  const marketClause = market ? `AND f.market_id = '${market}'` : "";
  const sourceClause = source ? `AND f.source_id = '${source}'` : "";
  return `
    SELECT
      f.zip,
      z.zcta_lat,
      z.zcta_lng,
      f.state,
      f.market_id,
      f.distance_basis,
      f.within_radius_mi,
      f.filed_branch,
      f.serviceable_branch,
      SUM(f.leads) AS leads
    FROM fact_lead_zip_daily f
    LEFT JOIN dim_zip z ON z.zip = f.zip
    WHERE f.lead_date >= '${fromDate}' AND f.lead_date <= '${toDate}'
      AND f.zip IS NOT NULL
      ${marketClause}
      ${sourceClause}
    GROUP BY f.zip, z.zcta_lat, z.zcta_lng, f.state, f.market_id,
             f.distance_basis, f.within_radius_mi, f.filed_branch, f.serviceable_branch
    HAVING z.zcta_lat IS NOT NULL AND z.zcta_lng IS NOT NULL
  `;
}

export function officePinsSql(): string {
  return `
    SELECT market_id, code, name, office_lat, office_lng, office_match_type,
           office_address, has_service_area_list, is_fallout_bucket
    FROM dim_market
    WHERE office_lat IS NOT NULL AND office_lng IS NOT NULL
  `;
}

// Out-of-area / wrong-branch zips ranked by leads, rate computed in the SAME
// query as the count it is a rate of (numerator = leads in the flagged
// state for that zip, denominator = all leads for that zip over the same
// window): never two separate queries whose windows could drift apart.
export function outOfAreaTableSql(opts: {
  fromDate: string;
  toDate: string;
  market?: string;
  source?: string;
}): string {
  const { fromDate, toDate, market, source } = opts;
  const marketClause = market ? `AND market_id = '${market}'` : "";
  const sourceClause = source ? `AND source_id = '${source}'` : "";
  return `
    WITH windowed AS (
      SELECT zip, state, market_id, leads
      FROM fact_lead_zip_daily
      WHERE lead_date >= '${fromDate}' AND lead_date <= '${toDate}'
        AND zip IS NOT NULL
        ${marketClause}
        ${sourceClause}
    ),
    zip_totals AS (
      SELECT zip, SUM(leads) AS total_leads
      FROM windowed
      GROUP BY zip
    ),
    flagged AS (
      SELECT zip, state, market_id, SUM(leads) AS flagged_leads
      FROM windowed
      WHERE state IN ('out_of_area', 'wrong_branch', 'unknown_branch_list')
      GROUP BY zip, state, market_id
    )
    SELECT
      flagged.zip,
      flagged.state,
      flagged.market_id,
      flagged.flagged_leads,
      zip_totals.total_leads,
      ROUND(flagged.flagged_leads * 1.0 / zip_totals.total_leads, 3) AS flagged_rate
    FROM flagged
    JOIN zip_totals ON zip_totals.zip = flagged.zip
    ORDER BY flagged.flagged_leads DESC
    LIMIT 25
  `;
}

// Table-level coverage for the geo window (data-contract.md, fact_lead_zip_daily
// missing-day semantics): an absent lead_date means the feed was never run for
// that day, never zero leads, so every window total carries "N of M days".
// Computed ONCE per window over the same filters the map and the out-of-area
// table use, so the badge and the totals describe the same rows. days_in_window
// is computed by the caller from the same from/to strings (DuckDB-WASM's binder
// rejected DATE-literal arithmetic here).
export function geoCoverageSql(opts: {
  fromDate: string;
  toDate: string;
  market?: string;
  source?: string;
}): string {
  const { fromDate, toDate, market, source } = opts;
  const marketClause = market ? `AND market_id = '${market}'` : "";
  const sourceClause = source ? `AND source_id = '${source}'` : "";
  return `
    SELECT
      COUNT(DISTINCT TRY_CAST(lead_date AS DATE)) AS distinct_days,
      SUM(leads) AS leads,
      MIN(TRY_CAST(lead_date AS DATE)) AS first_day,
      MAX(TRY_CAST(lead_date AS DATE)) AS last_day
    FROM fact_lead_zip_daily
    WHERE lead_date >= '${fromDate}' AND lead_date <= '${toDate}'
      ${marketClause}
      ${sourceClause}
  `;
}
