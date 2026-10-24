// Dumps the declared data contracts as JSON on stdout so check.py can run them against the generated parquet:
// the workbench sources (feeds, joins, dims, measures, drill), the pivot sources, the contract tables, and every
// SQL string the report tabs build. Run: node_modules/.bin/tsx scripts/demo-data/dump_contracts.ts <end YYYY-MM-DD>
import { SOURCES } from "../../lib/reports/workbench/sources";
import { PIVOT_SOURCES } from "../../lib/reports/sql/_pivot_sources";
import { CONTRACT_TABLES, FETCHABLE_STATUS } from "../../lib/reports/sql/_contract_views";
import * as overview from "../../lib/reports/sql/overview.sql";
import * as paid from "../../lib/reports/sql/paid.sql";
import * as geo from "../../lib/reports/sql/geo.sql";
import * as organic from "../../lib/reports/sql/organic.sql";
import * as cc from "../../lib/reports/sql/callcenter.sql";
import { DM_FEEDS } from "../../lib/reports/digital/feeds";
import { windowsSql, pacingSql } from "../../lib/reports/digital/windows";

const end = process.argv[2];
const d = (s: string, n: number) => {
  const t = new Date(s + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const from28 = d(end, -27);
const from7 = d(end, -6);
const presets = ["yesterday", "wtd", "mtd", "last7", "last28", "mom", "ytd"] as const;
const sql: { name: string; sql: string; expectRows: boolean }[] = [];
const add = (name: string, q: string, expectRows = true) => sql.push({ name, sql: q, expectRows });

for (const p of presets) {
  add(`overview.totals.${p}`, overview.overviewTotalsSql({ preset: p as never }), true);
  add(`overview.totals.${p}.market`, overview.overviewTotalsSql({ preset: p as never, market: "Harborview" }), true);
  add(`overview.byMarket.${p}`, overview.overviewByMarketSql({ preset: p as never }), p !== "yesterday" ? true : false);
}
add("overview.trend28", overview.overviewTrend28Sql({}));
add("overview.trend28.market", overview.overviewTrend28Sql({ market: "Pinecrest" }));
for (const platform of ["google_ads", "meta", "microsoft_ads"]) {
  const o = { platform, fromDate: from28, toDate: end };
  add(`paid.kpi.${platform}`, paid.kpiSql(o));
  add(`paid.kpi.${platform}.market`, paid.kpiSql({ ...o, market: "Harborview" }));
  add(`paid.campaigns.${platform}`, paid.campaignTableSql(o));
  add(`paid.campaigns.${platform}.market`, paid.campaignTableSql({ ...o, market: "Harborview" }));
  add(`paid.trend.${platform}`, paid.trendSql({ platform, toDate: end }));
  add(`paid.geo.${platform}`, paid.geoTableSql(o), platform !== "meta");
}
const camp = { google_ads: "gads-c01", meta: "meta-c01", microsoft_ads: "msads-c01" } as Record<string, string>;
for (const platform of ["google_ads", "meta", "microsoft_ads"]) {
  const o = { platform, fromDate: from28, toDate: end, campaignId: camp[platform] };
  add(`paid.adsets.${platform}`, paid.drillTableSql({ ...o, grain: "ad_set" }));
  add(`paid.ads.${platform}`, paid.drillTableSql({ ...o, grain: "ad" }));
  add(`paid.actions.${platform}`, paid.conversionActionBreakdownSql(o), platform !== "meta");
}
const g = { fromDate: from28, toDate: end };
add("geo.points", geo.zipPointsSql(g));
add("geo.points.market", geo.zipPointsSql({ ...g, market: "Harborview" }));
add("geo.offices", geo.officePinsSql());
add("geo.outOfArea", geo.outOfAreaTableSql(g));
add("geo.coverage", geo.geoCoverageSql(g));
add("organic.ga4.kpi", organic.ga4KpiSql(g));
for (const name of Object.keys(organic)) {
  const fn = (organic as Record<string, unknown>)[name];
  if (typeof fn !== "function" || name === "escapeLiteral") continue;
  const n = (fn as (...a: unknown[]) => unknown).length;
  let q: unknown;
  try {
    q = n === 0 ? (fn as () => string)() : (fn as (o: unknown) => string)({ ...g, filterText: "roof" });
  } catch (e) {
    throw new Error(`organic.${name} could not be built with the check's arguments: ${String(e)}`);
  }
  if (typeof q === "string") add(`organic.${name}`, q);
}
for (const per of ["today", "mtd"] as const) {
  add(`callcenter.company.${per}`, cc.ccFunnelCompanySql(per), per === "mtd");
  add(`callcenter.byOffice.${per}`, cc.ccFunnelByOfficeSql(per), per === "mtd");
  add(`callcenter.dialsBySource.${per}`, cc.ccDialsBySourceSql(per), per === "mtd");
  add(`callcenter.agents.${per}`, cc.ccAgentsSql(per, cc.CC_HEADLINE_SOURCE), per === "mtd");
}
add("callcenter.dialsDaily", cc.ccDialsDailySql(cc.CC_HEADLINE_SOURCE));
const callcenter = {
  feeds: cc.CC_FEEDS,
  funnelViewSql: cc.ccFunnelViewSql(true, true),
};
add("digital.windows.spend.company", windowsSql("spend", "company", "ALL"));
add("digital.windows.ctr.platform", windowsSql("ctr", "platform"));
add("digital.pacing.spend", pacingSql("spend"));

console.log(JSON.stringify({
  SOURCES, PIVOT_SOURCES, CONTRACT_TABLES, FETCHABLE_STATUS: [...FETCHABLE_STATUS], DM_FEEDS, sql, callcenter,
}));
