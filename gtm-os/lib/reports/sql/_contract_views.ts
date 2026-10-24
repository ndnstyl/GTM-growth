// Builds one DuckDB VIEW per spec-127 contract table (data-contract.md).
// v1.1 physical-file rule: a contract table may be spread across several
// `<feed>__<table>.parquet` files plus a bare `<table>.parquet`. This module
// unions every matching physical file BY NAME into one view named after the
// contract table. A contract table with zero matching files still gets a
// view (typed, zero rows) so the UI never errors on a missing feed.
"use client";

import { Manifest, query, registerParquet } from "@/lib/reports/duck";
import { reportLog } from "@/lib/reports/log";

export type ContractCol = { name: string; type: string };
export type ContractTable = { table: string; cols: ContractCol[] };

const AS_OF_COLS: ContractCol[] = [
  { name: "as_of", type: "TIMESTAMP" },
  { name: "confidence", type: "VARCHAR" },
  { name: "provenance_ref", type: "VARCHAR" },
];

function fact(table: string, cols: ContractCol[]): ContractTable {
  return { table, cols: [...cols, ...AS_OF_COLS] };
}

export const CONTRACT_TABLES: ContractTable[] = [
  fact("fact_spend_daily", [
    { name: "platform", type: "VARCHAR" },
    { name: "account_id", type: "VARCHAR" },
    { name: "company_id", type: "VARCHAR" },
    { name: "market_id", type: "VARCHAR" },
    { name: "campaign_id", type: "VARCHAR" },
    { name: "ad_set_id", type: "VARCHAR" },
    { name: "ad_unit_id", type: "VARCHAR" },
    { name: "grain", type: "VARCHAR" },
    { name: "grain_object_id", type: "VARCHAR" },
    { name: "spend_date", type: "DATE" },
    { name: "row_type", type: "VARCHAR" },
    { name: "ingestion_class", type: "VARCHAR" },
    { name: "fee_seq", type: "BIGINT" },
    { name: "amount_cents", type: "BIGINT" },
    { name: "impressions", type: "BIGINT" },
    { name: "clicks", type: "BIGINT" },
    { name: "conversions", type: "DOUBLE" },
    // beside the campaign-goal `conversions`; NULL on files published before 2026-09-09.
    { name: "all_conversions", type: "DOUBLE" },
    { name: "conversion_value_cents", type: "BIGINT" },
    { name: "impression_share", type: "DOUBLE" },
    { name: "video_views", type: "BIGINT" },
    { name: "reach", type: "BIGINT" },
    { name: "frequency", type: "DOUBLE" },
    { name: "vendor_id", type: "VARCHAR" },
  ]),
  // (account, campaign, day, conversion action) that fired; a day with no
  // conversions carries one none_reported:<account> row.
  fact("fact_conversion_action_daily", [
    { name: "platform", type: "VARCHAR" },
    { name: "account_id", type: "VARCHAR" },
    { name: "campaign_id", type: "VARCHAR" },
    { name: "spend_date", type: "DATE" },
    { name: "conversion_action_id", type: "VARCHAR" },
    { name: "conversion_action_name", type: "VARCHAR" },
    { name: "category", type: "VARCHAR" },
    { name: "primary_for_goal", type: "BOOLEAN" },
    { name: "conversions", type: "DOUBLE" },
    { name: "all_conversions", type: "DOUBLE" },
  ]),
  // campaign-day's spend splits across markets. One row per (platform, campaign,
  // day, market); shares sum to 1.0 per campaign-day. Every market read of spend
  // goes through this table (amount_cents * share); the campaign rollup is
  // untouched.
  fact("campaign_market_allocation", [
    { name: "platform", type: "VARCHAR" },
    { name: "campaign_id", type: "VARCHAR" },
    { name: "spend_date", type: "DATE" },
    { name: "market_id", type: "VARCHAR" },
    { name: "share", type: "DOUBLE" },
    { name: "basis", type: "VARCHAR" },
    { name: "grammar_status", type: "VARCHAR" },
    { name: "rule_id", type: "VARCHAR" },
    { name: "market_count", type: "BIGINT" },
    { name: "geo_postal_cents_in_set", type: "BIGINT" },
    { name: "rules_version", type: "VARCHAR" },
  ]),
  fact("fact_geo_spend_daily", [
    { name: "platform", type: "VARCHAR" },
    { name: "account_id", type: "VARCHAR" },
    { name: "campaign_id", type: "VARCHAR" },
    { name: "spend_date", type: "DATE" },
    { name: "geo_type", type: "VARCHAR" },
    { name: "geo_id", type: "VARCHAR" },
    { name: "geo_name", type: "VARCHAR" },
    { name: "location_type", type: "VARCHAR" },
    { name: "amount_cents", type: "BIGINT" },
    { name: "impressions", type: "BIGINT" },
    { name: "clicks", type: "BIGINT" },
    { name: "conversions", type: "DOUBLE" },
  ]),
  fact("fact_lead_zip_daily", [
    { name: "lead_date", type: "DATE" },
    { name: "company_id", type: "VARCHAR" },
    { name: "market_id", type: "VARCHAR" },
    { name: "source_id", type: "VARCHAR" },
    { name: "subsource_id", type: "VARCHAR" },
    { name: "platform", type: "VARCHAR" },
    { name: "zip", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "state", type: "VARCHAR" },
    { name: "within_radius_mi", type: "DOUBLE" },
    { name: "distance_basis", type: "VARCHAR" },
    { name: "filed_branch", type: "VARCHAR" },
    { name: "serviceable_branch", type: "VARCHAR" },
  ]),
  fact("fact_funnel_daily", [
    { name: "source_system", type: "VARCHAR" },
    { name: "office_id", type: "VARCHAR" },
    { name: "date", type: "DATE" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "rtc_cents", type: "BIGINT" },
    { name: "turndown_cents", type: "BIGINT" },
    // crm_spine additions (data-contract.md "CRM spine tables", v1.4): net
    // basis needs cancel_gross_cents alongside gross_cents to reconcile
    // net_cents = gross_cents - cancel_gross_cents.
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  // --- CRM spine tables (data-contract.md "CRM spine tables (v1.4)"). Every
  // table below is (date, office, <dim>) grain with the shared funnel
  // measure set unless the contract narrows it (setter, sales_rep, calls).
  fact("fact_crm_source_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "source_code", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_subsource_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "subsource_code", type: "VARCHAR" },
    { name: "subsource_name", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_promoter_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "promoter", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_product_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "product", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_rank_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "rank", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_territory_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "state", type: "VARCHAR" },
    { name: "zip", type: "VARCHAR" },
    { name: "distance_basis", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_disposition_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "lead_disposition", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_call_result_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "last_call_result", type: "VARCHAR" },
    { name: "leads", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "cancels", type: "BIGINT" },
    { name: "cancel_gross_cents", type: "BIGINT" },
    { name: "net_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_crm_setter_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "setter", type: "VARCHAR" },
    { name: "leads_touched", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
  ]),
  fact("fact_crm_sales_rep_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "sales_rep", type: "VARCHAR" },
    { name: "issues", type: "BIGINT" },
    { name: "demos", type: "BIGINT" },
    { name: "sales", type: "BIGINT" },
    { name: "gross_cents", type: "BIGINT" },
    { name: "unruled_appointments", type: "BIGINT" },
  ]),
  fact("fact_calls_office_daily", [
    { name: "date", type: "DATE" },
    { name: "office", type: "VARCHAR" },
    { name: "inbound_calls", type: "BIGINT" },
    { name: "answered", type: "BIGINT" },
    { name: "missed", type: "BIGINT" },
    { name: "first_time_callers", type: "BIGINT" },
    { name: "talk_seconds", type: "BIGINT" },
  ]),
  fact("fact_calls_source_daily", [
    { name: "date", type: "DATE" },
    { name: "source_code", type: "VARCHAR" },
    { name: "inbound_calls", type: "BIGINT" },
    { name: "answered", type: "BIGINT" },
    { name: "missed", type: "BIGINT" },
    { name: "first_time_callers", type: "BIGINT" },
    { name: "talk_seconds", type: "BIGINT" },
  ]),
  fact("dim_date", [
    { name: "date", type: "DATE" },
    { name: "iso_week", type: "DATE" },
    { name: "month_start", type: "DATE" },
    { name: "quarter_start", type: "DATE" },
    { name: "year_start", type: "DATE" },
  ]),
  fact("dim_disposition", [
    { name: "lead_disposition", type: "VARCHAR" },
    { name: "display_name", type: "VARCHAR" },
    { name: "is_issued", type: "BOOLEAN" },
    { name: "is_demo", type: "BOOLEAN" },
    { name: "is_sale", type: "BOOLEAN" },
    { name: "is_ruled", type: "BOOLEAN" },
  ]),
  fact("dim_sales_rep", [
    { name: "sales_rep", type: "VARCHAR" },
    { name: "display_name", type: "VARCHAR" },
  ]),
  fact("dim_product", [
    { name: "product", type: "VARCHAR" },
    { name: "display_name", type: "VARCHAR" },
  ]),
  fact("dim_promoter", [
    { name: "promoter", type: "VARCHAR" },
    { name: "display_name", type: "VARCHAR" },
  ]),
  fact("fact_ga4_channel_daily", [
    { name: "property_id", type: "VARCHAR" },
    { name: "date", type: "DATE" },
    { name: "ga4_channel_group_raw", type: "VARCHAR" },
    { name: "landing_page", type: "VARCHAR" },
    { name: "sessions", type: "BIGINT" },
    { name: "engaged_sessions", type: "BIGINT" },
    { name: "key_events", type: "BIGINT" },
    { name: "users", type: "BIGINT" },
  ]),
  fact("fact_ga4_geo_daily", [
    { name: "property_id", type: "VARCHAR" },
    { name: "date", type: "DATE" },
    { name: "city", type: "VARCHAR" },
    { name: "region", type: "VARCHAR" },
    { name: "sessions", type: "BIGINT" },
    { name: "engaged_sessions", type: "BIGINT" },
    { name: "key_events", type: "BIGINT" },
    { name: "users", type: "BIGINT" },
  ]),
  fact("fact_gsc_daily", [
    { name: "site", type: "VARCHAR" },
    { name: "date", type: "DATE" },
    { name: "query", type: "VARCHAR" },
    { name: "page", type: "VARCHAR" },
    { name: "device", type: "VARCHAR" },
    { name: "country", type: "VARCHAR" },
    { name: "clicks", type: "BIGINT" },
    { name: "impressions", type: "BIGINT" },
    { name: "ctr", type: "DOUBLE" },
    { name: "position", type: "DOUBLE" },
    { name: "search_type", type: "VARCHAR" },
    { name: "source_tz", type: "VARCHAR" },
  ]),
  fact("fact_gsc_site_daily", [
    { name: "site", type: "VARCHAR" },
    { name: "date", type: "DATE" },
    { name: "clicks", type: "BIGINT" },
    { name: "impressions", type: "BIGINT" },
    { name: "ctr", type: "DOUBLE" },
    { name: "position", type: "DOUBLE" },
  ]),
  fact("fact_calls_daily", [
    { name: "account_id", type: "VARCHAR" },
    { name: "tracker_id", type: "VARCHAR" },
    { name: "date", type: "DATE" },
    { name: "source_type", type: "VARCHAR" },
    { name: "customer_state", type: "VARCHAR" },
    { name: "calls", type: "BIGINT" },
    { name: "first_time_calls", type: "BIGINT" },
    { name: "answered", type: "BIGINT" },
    { name: "missed", type: "BIGINT" },
    { name: "voicemail", type: "BIGINT" },
    { name: "duration_sec_sum", type: "BIGINT" },
    { name: "market_id", type: "VARCHAR" },
  ]),
  fact("fact_callcenter_agent_daily", [
    { name: "agent", type: "VARCHAR" },
    { name: "date", type: "DATE" },
    { name: "dials", type: "BIGINT" },
    { name: "connects", type: "BIGINT" },
    { name: "sets", type: "BIGINT" },
    { name: "issues", type: "BIGINT" },
    { name: "volume_cents", type: "BIGINT" },
    { name: "talk_min", type: "DOUBLE" },
    { name: "row_source", type: "VARCHAR" },
  ]),
  fact("dim_company", [
    { name: "company_id", type: "VARCHAR" },
    { name: "legal_name", type: "VARCHAR" },
    { name: "short_code", type: "VARCHAR" },
  ]),
  fact("dim_market", [
    { name: "market_id", type: "VARCHAR" },
    { name: "code", type: "VARCHAR" },
    { name: "name", type: "VARCHAR" },
    { name: "company_id", type: "VARCHAR" },
    { name: "office_lat", type: "DOUBLE" },
    { name: "office_lng", type: "DOUBLE" },
    { name: "office_match_type", type: "VARCHAR" },
    { name: "office_address", type: "VARCHAR" },
    { name: "has_service_area_list", type: "BOOLEAN" },
    { name: "is_fallout_bucket", type: "BOOLEAN" },
  ]),
  fact("dim_zip", [
    { name: "zip", type: "VARCHAR" },
    { name: "zcta_lat", type: "DOUBLE" },
    { name: "zcta_lng", type: "DOUBLE" },
    { name: "county_fips", type: "VARCHAR" },
    { name: "state", type: "VARCHAR" },
    { name: "branch_id", type: "VARCHAR" },
    { name: "in_master", type: "BOOLEAN" },
    { name: "zip_status", type: "VARCHAR" },
  ]),
  fact("dim_channel", [
    { name: "channel_id", type: "VARCHAR" },
    { name: "name", type: "VARCHAR" },
  ]),
  fact("dim_platform_account", [
    { name: "platform", type: "VARCHAR" },
    { name: "account_id", type: "VARCHAR" },
    { name: "display_name", type: "VARCHAR" },
    { name: "company_id", type: "VARCHAR" },
    { name: "reporting_tz", type: "VARCHAR" },
    { name: "managed_by", type: "VARCHAR" },
  ]),
  fact("dim_campaign", [
    { name: "campaign_id", type: "VARCHAR" },
    { name: "platform", type: "VARCHAR" },
    { name: "platform_campaign_id", type: "VARCHAR" },
    { name: "name", type: "VARCHAR" },
    { name: "company_id", type: "VARCHAR" },
    { name: "market_id", type: "VARCHAR" },
    { name: "channel_id", type: "VARCHAR" },
    { name: "grammar_status", type: "VARCHAR" },
  ]),
  fact("dim_ad_set", [
    { name: "ad_set_id", type: "VARCHAR" },
    { name: "campaign_id", type: "VARCHAR" },
    { name: "name", type: "VARCHAR" },
  ]),
  fact("dim_ad_unit", [
    { name: "ad_unit_id", type: "VARCHAR" },
    { name: "ad_set_id", type: "VARCHAR" },
    { name: "name", type: "VARCHAR" },
    { name: "is_asset_group", type: "BOOLEAN" },
  ]),
  fact("dim_source", [
    { name: "source_id", type: "VARCHAR" },
    { name: "source_system", type: "VARCHAR" },
    { name: "display_name", type: "VARCHAR" },
  ]),
  fact("dim_subsource", [
    { name: "subsource_id", type: "VARCHAR" },
    { name: "source_id", type: "VARCHAR" },
    { name: "display_name", type: "VARCHAR" },
  ]),
  fact("dim_tracker", [
    { name: "tracker_id", type: "VARCHAR" },
    { name: "name", type: "VARCHAR" },
    { name: "company_id", type: "VARCHAR" },
    { name: "company_name", type: "VARCHAR" },
    { name: "tracker_source_class", type: "VARCHAR" },
    { name: "status", type: "VARCHAR" },
  ]),
];

export type ContractResolution = { resolved: string[]; empty: string[] };

function emptyViewSql(t: ContractTable): string {
  const cols = t.cols
    .map((c) => `CAST(NULL AS ${c.type}) AS ${c.name}`)
    .join(", ");
  return `CREATE OR REPLACE VIEW ${t.table} AS SELECT ${cols} WHERE 1=0`;
}

// Producer precedence (contract v1.4): where two feeds can carry the same date,
// the authoritative producer wins for every date it covers. Keyed by table →
// [winning physical-name prefix, date column].
// `order` is a total order of producer prefixes; a physical file whose name matches none of
// them (an orphan from before the v1.1 rename) is excluded from the union and logged.
const PRECEDENCE: Record<string, { winner: string; dateCol: string; order: string[] }> = {
  fact_funnel_daily: { winner: "crm_spine__", dateCol: "date", order: ["crm_spine__", "funnel__"] },
};

function unionViewSql(t: ContractTable, physicalNames: string[]): string {
  const rule = PRECEDENCE[t.table];
  if (rule) {
    const ordered = physicalNames.filter((n) => rule.order.some((p) => n.startsWith(p)));
    const orphans = physicalNames.filter((n) => !rule.order.some((p) => n.startsWith(p)));
    if (orphans.length) reportLog.warn(`[reports] ${t.table}: excluding orphan producer file(s) ${orphans.join(", ")}`);
    // The single-producer path below must also see only the ordered set, or an
    // orphan excluded here would be re-admitted.
    physicalNames = ordered;
    if (!ordered.length) return emptyViewSql(t);
    const winners = ordered.filter((n) => n.startsWith(rule.winner));
    const others = ordered.filter((n) => !n.startsWith(rule.winner));
    if (winners.length && others.length) {
      const win = winners.map((n) => `SELECT * FROM read_parquet('${n}.parquet')`).join(" UNION ALL BY NAME ");
      const rest = others.map((n) => `SELECT * FROM read_parquet('${n}.parquet')`).join(" UNION ALL BY NAME ");
      const casts = t.cols
        .filter((c) => c.type === "DATE" || c.type === "TIMESTAMP")
        .map((c) => `TRY_CAST(${c.name} AS ${c.type}) AS ${c.name}`);
      const replace = casts.length ? ` REPLACE (${casts.join(", ")})` : "";
      return `CREATE OR REPLACE VIEW ${t.table} AS SELECT *${replace} FROM (
        SELECT * FROM (${win})
        UNION ALL BY NAME
        SELECT * FROM (${rest}) r WHERE NOT EXISTS (SELECT 1 FROM (${win}) w WHERE TRY_CAST(w.${rule.dateCol} AS DATE) = TRY_CAST(r.${rule.dateCol} AS DATE))
      )`;
    }
  }
  // Read the registered Parquet buffers directly: a physical file can share the
  // contract table's name (bare `<table>.parquet`), and selecting from the
  // same-named view would make DuckDB bind the view to itself.
  const selects = physicalNames.map((n) => `SELECT * FROM read_parquet('${n}.parquet')`);
  const body = selects.join(" UNION ALL BY NAME ");
  // Contract v1.3 types dates as date32, but a feed may still publish them as
  // strings; cast at the view so every tab's SQL can rely on the contract type.
  const casts = t.cols
    .filter((c) => c.type === "DATE" || c.type === "TIMESTAMP")
    .map((c) => `TRY_CAST(${c.name} AS ${c.type}) AS ${c.name}`);
  const replace = casts.length ? ` REPLACE (${casts.join(", ")})` : "";
  return `CREATE OR REPLACE VIEW ${t.table} AS SELECT *${replace} FROM (${body})`;
}

// Manifest entries in these states have a parquet file on disk worth
// fetching; "missing" (declared in the registry but not yet produced, e.g.
// dim_subsource/fact_crm_subsource_daily pending the PII-guard role) and any
// other non-fetchable status are skipped so a known-missing file never
// logs a 404, it just resolves empty like an absent manifest key.
export const FETCHABLE_STATUS = new Set(["published", "stale", "orphan", "unavailable_feed"]); // a file with history is still read; the badge carries the status

// Matches the v1.1 physical-file rule: bare `<table>.parquet` or any
// `<feed>__<table>.parquet`.
function physicalKeysFor(table: string, manifestKeys: string[], manifest: Manifest | null): string[] {
  return manifestKeys
    .filter((k) => k === table || k.endsWith(`__${table}`))
    .filter((k) => !manifest || FETCHABLE_STATUS.has(manifest.files[k]?.status));
}

let built: Promise<ContractResolution> | null = null;

export async function buildContractViews(manifest: Manifest | null): Promise<ContractResolution> {
  if (built) return built;
  built = (async () => {
    const resolved: string[] = [];
    const empty: string[] = [];
    const manifestKeys = manifest ? Object.keys(manifest.files) : [];
    for (const t of CONTRACT_TABLES) {
      const physical = physicalKeysFor(t.table, manifestKeys, manifest);
      if (physical.length === 0) {
        await query(emptyViewSql(t));
        empty.push(t.table);
        continue;
      }
      let anyOk = false;
      const okNames: string[] = [];
      for (const p of physical) {
        const ok = await registerParquet(p, `/data/reports/${p}.parquet`);
        if (ok) {
          okNames.push(p);
          anyOk = true;
        }
      }
      if (!anyOk) {
        await query(emptyViewSql(t));
        empty.push(t.table);
        continue;
      }
      await query(unionViewSql(t, okNames));
      resolved.push(t.table);
    }
    return { resolved, empty };
  })();
  return built;
}

// Generated date dimension (Monday-start iso_week per hierarchies
// section) so date rollups work even before dim_date.parquet is published.
const DATE_DIM_START = "2023-01-01";
const DATE_DIM_END = "2027-12-31";

export async function buildHierarchyViews(): Promise<void> {
  await query(`
    CREATE OR REPLACE VIEW dim_date_generated AS
    SELECT
      d::DATE AS date,
      strftime(date_trunc('week', d), '%Y-%m-%d') AS iso_week,
      strftime(d, '%Y-%m') AS month,
      concat(date_part('year', d)::VARCHAR, '-Q', ((date_part('month', d)-1)/3+1)::VARCHAR) AS quarter,
      date_part('year', d)::BIGINT AS year,
      dayname(d) AS dow
    FROM generate_series(DATE '${DATE_DIM_START}', DATE '${DATE_DIM_END}', INTERVAL 1 DAY) AS t(d)
  `);

  // zip -> market -> company. dim_zip has no explicit market_id column in
  // the contract; branch_id is the closest key to a market/office id, so
  // the join below is a best-effort assumption, documented in README.md.
  await query(`
    CREATE OR REPLACE VIEW v_zip_hierarchy AS
    SELECT
      z.zip, z.state, z.branch_id,
      m.market_id, m.name AS market_name,
      c.company_id, c.legal_name AS company_name
    FROM dim_zip z
    LEFT JOIN dim_market m ON z.branch_id = m.market_id
    LEFT JOIN dim_company c ON m.company_id = c.company_id
  `);

  // ad_unit -> ad_set -> campaign -> channel -> platform
  await query(`
    CREATE OR REPLACE VIEW v_ad_hierarchy AS
    SELECT
      au.ad_unit_id, au.name AS ad_unit_name,
      as_.ad_set_id, as_.name AS ad_set_name,
      cmp.campaign_id, cmp.name AS campaign_name, cmp.platform,
      ch.channel_id, ch.name AS channel_name
    FROM dim_ad_unit au
    LEFT JOIN dim_ad_set as_ ON au.ad_set_id = as_.ad_set_id
    LEFT JOIN dim_campaign cmp ON as_.campaign_id = cmp.campaign_id
    LEFT JOIN dim_channel ch ON cmp.channel_id = ch.channel_id
  `);
}
