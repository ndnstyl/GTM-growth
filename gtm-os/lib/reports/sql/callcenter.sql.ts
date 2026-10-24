// Call Center tab SQL. The tab used to render the
// kiosk feed (the data), parked by the owner 2026-09-06 when the big
// board moved to the owner's Apple app. It now reads two live feeds:
//
//   * the CRM funnel: `crm_spine__fact_funnel_daily.parquet` (through yesterday,
//     deterministic, carries cancels + net) and `funnel__fact_funnel_daily.parquet`
//     (today only, provisional, net NULL). Same producer precedence as the
//     contract view in _contract_views.ts: the data file wins every date it
//     covers, the today file fills only dates the spine has not published.
//   * the call-floor connect feed: `callfloor/callfloor_connect_rate_crm_daily.parquet`
//     (one row per CRM pull window x day; the pull window IS the dial denominator,
//     vault: "An CRM GetLead Lead Window Truncates the Call Count, So a Connect
//     Rate Depends on the Pull"). The denominator of record is UNRULED (150
//     backtest report §definition), so every pull window is carried side by side
//     and the headline names the one it uses.
//
// Both feeds live outside 127's _manifest.json and are registered explicitly
// (bi-workbench/references/feed-wiring.md); the view names below are private to
// this tab so it never depends on Shell's contract-view timing.

export const CC_FUNNEL_SPINE = "cc_funnel_spine";
export const CC_FUNNEL_TODAY = "cc_funnel_today";
export const CC_FUNNEL_VIEW = "cc_funnel";
export const CC_CONNECT_VIEW = "callfloor_connect_rate_crm_daily";
export const CC_DIM_MARKET = "dim_market";
export const CC_AGENT_VIEW = "callfloor_connect_rate_crm_agent_daily";

export const CC_FEEDS = {
  spine: { name: CC_FUNNEL_SPINE, url: "/data/reports/crm_spine__fact_funnel_daily.parquet" },
  today: { name: CC_FUNNEL_TODAY, url: "/data/reports/funnel__fact_funnel_daily.parquet" },
  connect: { name: CC_CONNECT_VIEW, url: "/data/reports/callfloor/callfloor_connect_rate_crm_daily.parquet" },
  market: { name: CC_DIM_MARKET, url: "/data/reports/dim_market.parquet" },
  agents: { name: CC_AGENT_VIEW, url: "/data/reports/callfloor/callfloor_connect_rate_crm_agent_daily.parquet" },
} as const;

import { presetDateSql } from "./overview.sql";
import type { DatePreset } from "@/components/reports/FilterBar";

export type CcPeriod = DatePreset;

// Headline pull. "ledger" accumulates every CRM call the
// pulls have ever seen, refreshed per person daily on the mini, so it is the
// only source that reaches yesterday; wide150 was a one-off pull ending
export const CC_HEADLINE_SOURCE = "ledger";

// Builds one funnel view over whichever physical files registered. With both
// present the spine wins per date (contract v1.4 precedence); with one, that
// one alone. Dates are cast because the today file publishes them as text.
export function ccFunnelViewSql(haveSpine: boolean, haveToday: boolean): string | null {
  const cols = `
    TRY_CAST(date AS DATE) AS date, office_id, office, confidence, as_of,
    leads, sets, issues, demos, sales, gross_cents, net_cents, cancels, cancel_gross_cents`;
  const spine = `SELECT ${cols} FROM read_parquet('${CC_FUNNEL_SPINE}.parquet')`;
  // The today file has no cancels columns; name them NULL so UNION ALL BY NAME lines up.
  const today = `SELECT TRY_CAST(date AS DATE) AS date, office_id, office, confidence, as_of,
    leads, sets, issues, demos, sales, gross_cents, net_cents,
    CAST(NULL AS BIGINT) AS cancels, CAST(NULL AS BIGINT) AS cancel_gross_cents
    FROM read_parquet('${CC_FUNNEL_TODAY}.parquet')`;
  if (haveSpine && haveToday) {
    return `CREATE OR REPLACE VIEW ${CC_FUNNEL_VIEW} AS
      SELECT * FROM (${spine}) w
      UNION ALL BY NAME
      SELECT * FROM (${today}) r WHERE NOT EXISTS (SELECT 1 FROM (${spine}) w WHERE w.date = r.date)`;
  }
  if (haveSpine) return `CREATE OR REPLACE VIEW ${CC_FUNNEL_VIEW} AS ${spine}`;
  if (haveToday) return `CREATE OR REPLACE VIEW ${CC_FUNNEL_VIEW} AS ${today}`;
  return null;
}

function periodWhere(dateCol: string, period: CcPeriod): string {
  return presetDateSql(dateCol, period);
}

// Net per row: the published net where the spine has it; otherwise gross minus
// no cancel record is gross, never NULL, so Net and Gross cover the same days.
const NET_EXPR = "COALESCE(net_cents, gross_cents - COALESCE(cancel_gross_cents, 0))";

const FUNNEL_MEASURES = `
  SUM(leads) AS leads, SUM(sets) AS sets, SUM(issues) AS issues, SUM(demos) AS demos, SUM(sales) AS sales,
  SUM(gross_cents) AS gross_cents,
  SUM(${NET_EXPR}) AS net_cents,
  SUM(cancels) AS cancels,
  SUM(cancel_gross_cents) AS cancel_gross_cents,
  COUNT(DISTINCT date) AS days_with_rows,
  COUNT(DISTINCT date) FILTER (WHERE cancels IS NOT NULL) AS days_with_cancel_record,
  MIN(date) AS first_date, MAX(date) AS last_date,
  MAX(as_of) AS as_of,
  COUNT(*) FILTER (WHERE confidence = 'provisional') AS provisional_rows,
  COUNT(*) AS rows`;

export function ccFunnelCompanySql(period: CcPeriod): string {
  return `SELECT ${FUNNEL_MEASURES},
    (EXTRACT(day FROM current_date))::INTEGER AS days_elapsed
    FROM ${CC_FUNNEL_VIEW} WHERE ${periodWhere("date", period)}`;
}

// Aggregate first, then name the office: dim_market carries its own as_of and
// confidence columns, so joining before the SUMs makes those names ambiguous.
export function ccFunnelByOfficeSql(period: CcPeriod): string {
  return `SELECT f.office_id, COALESCE(m.name, f.office, f.office_id) AS office_name, f.* EXCLUDE (office_id, office)
    FROM (
      SELECT office_id, MIN(office) AS office, ${FUNNEL_MEASURES}
      FROM ${CC_FUNNEL_VIEW}
      WHERE ${periodWhere("date", period)}
      GROUP BY office_id
    ) f
    LEFT JOIN ${CC_DIM_MARKET} m ON m.market_id = f.office_id
    ORDER BY f.gross_cents DESC NULLS LAST`;
}

// One row per CRM pull window: the dial universe differs by window, so the
// rate is never shown without its source.
export function ccDialsBySourceSql(period: CcPeriod): string {
  return `SELECT source,
    SUM(crm_dials) AS crm_dials, SUM(crm_dials_d) AS crm_dials_d,
    SUM(crm_connects) AS crm_connects, SUM(crm_connects_d) AS crm_connects_d,
    SUM(crm_machine) AS crm_machine,
    MAX(agents) AS agents_peak,
    COUNT(DISTINCT call_date) AS days_with_rows,
    MIN(TRY_CAST(call_date AS DATE)) AS first_date, MAX(TRY_CAST(call_date AS DATE)) AS last_date,
    MAX(as_of) AS as_of
    FROM ${CC_CONNECT_VIEW}
    WHERE ${periodWhere("TRY_CAST(call_date AS DATE)", period)}
    GROUP BY source ORDER BY source`;
}

export function ccDialsDailySql(source: string, period: CcPeriod): string {
  return `SELECT TRY_CAST(call_date AS DATE) AS call_date, crm_dials, crm_dials_d, crm_connects, crm_connects_d, crm_machine, agents
    FROM ${CC_CONNECT_VIEW}
    WHERE source = '${source}' AND ${periodWhere("TRY_CAST(call_date AS DATE)", period)}
    ORDER BY call_date DESC`;
}

// One row per agent for the window, one pull window at a time: the dial
// universe differs by window, so an agent's rate never prints without its
// source. The view carries dials and connects only (no sets): a per-agent set
// rate needs the CRM setter feed joined on the agent key, not invented here.
export function ccAgentsSql(period: CcPeriod, source: string): string {
  return `SELECT agent_key, MIN(agent_name_lp) AS agent_name,
    SUM(crm_dials) AS crm_dials, SUM(crm_connects) AS crm_connects,
    COUNT(DISTINCT call_date) AS days_with_rows,
    MAX(TRY_CAST(call_date AS DATE)) AS last_date
    FROM ${CC_AGENT_VIEW}
    WHERE source = '${source}' AND ${periodWhere("TRY_CAST(call_date AS DATE)", period)}
    GROUP BY agent_key
    ORDER BY crm_dials DESC`;
}
