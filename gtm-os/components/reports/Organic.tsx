"use client";

// Organic tab: GA4 (Northbeam only) and Search Console
// (sc-domain:example.com only; example.org rows exist in the feed and are excluded on this page). No chart
// library is wired into this app, so the 28-day trend is a plain inline SVG
// line, single axis, same house pattern as LeadMap's offline-fallback SVG.

import { useEffect, useMemo, useState } from "react";
import { getDb, query, registerParquet } from "@/lib/reports/duck";
import type { FilterState } from "@/components/reports/FilterBar";
import {
  ga4KpiSql,
  ga4MaxDateSql,
  ga4ByChannelSql,
  ga4ByLandingPageSql,
  ga4ByGeoSql,
  ga4GeoKpiSql,
  ga4TrendSql,
  gscKpiSql,
  gscMaxDateSql,
  gscQueryExplorerSql,
  gscPageExplorerSql,
  gscByDeviceSql,
  gscByCountrySql,
  gscTrendSql,
  gscSiteKpiSql,
  gscSiteTrendSql,
  GSC_PRIMARY_SITE,
} from "@/lib/reports/sql/organic.sql";
import { reportLog } from "@/lib/reports/log";
import { asNumber } from "@/lib/reports/format";
import { SeriesChart } from "@/components/reports/SeriesChart";

type SubTab = "ga4" | "gsc";

function dateRangeFor(preset: FilterState["preset"]): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date(now);
  const from = new Date(now);
  switch (preset) {
    case "yesterday":
      from.setUTCDate(from.getUTCDate() - 1);
      to.setUTCDate(to.getUTCDate() - 1);
      break;
    case "wtd": {
      const day = (from.getUTCDay() + 6) % 7;
      from.setUTCDate(from.getUTCDate() - day);
      break;
    }
    case "mtd":
      from.setUTCDate(1);
      break;
    case "last7":
      from.setUTCDate(from.getUTCDate() - 6);
      break;
    case "last28":
      from.setUTCDate(from.getUTCDate() - 27);
      break;
    case "mom":
      from.setUTCMonth(from.getUTCMonth() - 1, 1);
      to.setUTCDate(0);
      break;
    case "ytd":
      from.setUTCMonth(0, 1);
      break;
  }
  return { from: iso(from), to: iso(to) };
}

// 2026-08-22): a cell shows the number AND a badge. `partial` when SOME
// input rows are unavailable_* and/or fewer distinct days came back than
// the window holds (number stays, badge names both); `unavailable` with NO
// number only when EVERY row is unavailable. A number beside an
// "unavailable" badge is a review BLOCK. Days-in-window is passed in by the
// caller (the requested window, or 28 for the trend) since it is not a SQL
// aggregate itself.
type ConfMeta = {
  conf_rank: unknown;
  excluded_rows: unknown;
  total_rows: unknown;
  excluded_reasons: unknown;
  distinct_days: unknown;
};

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

// Trend rows are already grouped one-per-date, so distinct_days for the
// trend header is just the row count; excluded/total and the worst rank
// are summed/mined across those rows the same way a single aggregate row
// would report them.
function summarizeTrend(rows: Record<string, unknown>[]): Partial<ConfMeta> {
  const excluded = rows.reduce((a, r) => a + asNumber(r.excluded_rows), 0);
  const total = rows.reduce((a, r) => a + asNumber(r.total_rows), 0);
  const ranks = rows.map((r) => asNumber(r.conf_rank)).filter((n) => n > 0);
  const reasons = Array.from(
    new Set(
      rows.flatMap((r) => (r.excluded_reasons ? String(r.excluded_reasons).split(", ") : []))
    )
  ).join(", ");
  return {
    conf_rank: ranks.length ? Math.min(...ranks) : undefined,
    excluded_rows: excluded,
    total_rows: total,
    excluded_reasons: reasons || undefined,
    distinct_days: rows.length,
  };
}

const UNAVAILABLE_ROW: Partial<ConfMeta> = { excluded_rows: 1, total_rows: 1 };

function confBadge(
  row: Partial<ConfMeta> | null | undefined,
  daysInWindow?: number
): {
  text: string;
  cls: string;
  title?: string;
  suppressNumber: boolean;
} {
  const excluded = asNumber(row?.excluded_rows);
  const total = asNumber(row?.total_rows);
  if (total > 0 && excluded >= total) {
    return { text: "unavailable", cls: "bg-[var(--crit)]/15 text-[var(--crit)]", suppressNumber: true };
  }
  const distinctDays = row?.distinct_days === undefined ? undefined : asNumber(row.distinct_days);
  const dayShort = daysInWindow !== undefined && distinctDays !== undefined && distinctDays < daysInWindow;
  if (excluded > 0 || dayShort) {
    const parts: string[] = [];
    if (dayShort) parts.push(`${distinctDays} of ${daysInWindow} days`);
    if (excluded > 0) parts.push(`${excluded} of ${total} rows excluded`);
    return {
      text: `partial · ${parts.join(", ")}`,
      cls: "bg-[var(--warn)]/15 text-[var(--warn)]",
      title: row?.excluded_reasons ? String(row.excluded_reasons) : undefined,
      suppressNumber: false,
    };
  }
  const r = asNumber(row?.conf_rank);
  if (r >= 4) return { text: "deterministic", cls: "bg-[var(--good)]/15 text-[var(--good)]", suppressNumber: false };
  if (r === 3) return { text: "mapped", cls: "bg-[var(--warn)]/15 text-[var(--warn)]", suppressNumber: false };
  // provisional means "not yet settled by the
  // vendor", not "wrong". It renders grey with the reason in the tooltip, so
  // the amber/red badges keep their meaning (rows excluded / feed missing).
  if (r === 2)
    return {
      text: "provisional",
      cls: "bg-secondary text-muted-foreground",
      title: "not yet settled: GA4 finalizes the last 2 days; Search Console reports Pacific-time days against our Eastern-time calendar (data contract), so its rows stay provisional by rule",
      suppressNumber: false,
    };
  return { text: "n/a", cls: "bg-secondary text-muted-foreground", suppressNumber: false };
}

function ConfBadge({ row, daysInWindow }: { row: Partial<ConfMeta> | null | undefined; daysInWindow?: number }) {
  const b = confBadge(row, daysInWindow);
  if (b.text !== "unavailable") return null;
  return (
    <span title={b.title} className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${b.cls}`}>
      {b.text}
    </span>
  );
}

function Kpi({
  label,
  value,
  row,
  daysInWindow,
}: {
  label: string;
  value: string;
  row?: Partial<ConfMeta> | null;
  daysInWindow?: number;
}) {
  const b = row ? confBadge(row, daysInWindow) : null;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {row && <ConfBadge row={row} daysInWindow={daysInWindow} />}
      </div>
      <span className="text-[19px] font-bold">{b?.suppressNumber ? "n/a" : value}</span>
    </div>
  );
}

function Sparkline({ points, unavailable, unit = "count" }: { points: { x: string; y: number }[]; unavailable?: string; unit?: string }) {
  if (unavailable) {
    return <div className="text-[12px] text-[var(--crit)]">unavailable: {unavailable}</div>;
  }
  if (points.length === 0) {
    return <div className="text-[12px] text-muted-foreground">no rows in this window</div>;
  }
  // axis ticks, a value on every point, total / per day / high / low.
  return (
    <SeriesChart
      kind="line"
      points={points.map((p) => ({ date: p.x, value: p.y }))}
      fmt={(v) => Math.round(v).toLocaleString()}
      unit={unit}
    />
  );
}

function DataTable({
  cols,
  rows,
  numericCols,
  emptyLabel,
  daysInWindow,
}: {
  cols: { key: string; label: string; fmt?: (v: unknown) => string }[];
  rows: Record<string, unknown>[];
  numericCols: string[];
  emptyLabel: string;
  daysInWindow?: number;
}) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-[11.5px]">
        <thead className="sticky top-0 bg-secondary">
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`border-b border-border px-2 py-1.5 text-left font-semibold ${
                  numericCols.includes(c.key) ? "text-right" : ""
                }`}
              >
                {c.label}
              </th>
            ))}
            <th className="border-b border-border px-2 py-1.5 text-left font-semibold">confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-transparent even:bg-secondary/30">
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`border-b border-border px-2 py-1 ${numericCols.includes(c.key) ? "text-right" : ""}`}
                >
                  {r[c.key] === null || r[c.key] === undefined
                    ? ""
                    : c.fmt
                    ? c.fmt(r[c.key])
                    : String(r[c.key])}
                </td>
              ))}
              <td className="border-b border-border px-2 py-1">
                <ConfBadge row={r} daysInWindow={daysInWindow} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length + 1} className="py-3 text-center text-muted-foreground">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const num = (v: unknown) => asNumber(v).toLocaleString();
const pct = (v: unknown) => (v === null || v === undefined ? "" : `${(asNumber(v) * 100).toFixed(2)}%`);
const pos = (v: unknown) => (v === null || v === undefined ? "" : asNumber(v).toFixed(1));

export function Organic({ filters }: { filters: FilterState }) {
  const [sub, setSub] = useState<SubTab>("ga4");
  const [error, setError] = useState<string | null>(null);

  const [ga4Kpi, setGa4Kpi] = useState<Record<string, unknown> | null>(null);
  const [ga4MaxDate, setGa4MaxDate] = useState<string | null>(null);
  const [ga4ByChannel, setGa4ByChannel] = useState<Record<string, unknown>[]>([]);
  const [ga4ByPage, setGa4ByPage] = useState<Record<string, unknown>[]>([]);
  const [ga4ByGeo, setGa4ByGeo] = useState<Record<string, unknown>[]>([]);
  const [ga4GeoKpi, setGa4GeoKpi] = useState<Record<string, unknown> | null>(null);
  const [ga4Trend, setGa4Trend] = useState<Record<string, unknown>[]>([]);

  const [gscKpi, setGscKpi] = useState<Record<string, unknown> | null>(null);
  // Site-grain totals (contract v1.5). null = the feed is not published yet;
  // the tiles then read "unavailable", never the query-grain sum.
  const [gscSiteAvailable, setGscSiteAvailable] = useState(false);
  const [gscSiteKpi, setGscSiteKpi] = useState<Record<string, unknown> | null>(null);
  const [gscSiteTrend, setGscSiteTrend] = useState<Record<string, unknown>[]>([]);
  const [gscMaxDate, setGscMaxDate] = useState<string | null>(null);
  const [gscQueries, setGscQueries] = useState<Record<string, unknown>[]>([]);
  const [gscPages, setGscPages] = useState<Record<string, unknown>[]>([]);
  const [gscDevice, setGscDevice] = useState<Record<string, unknown>[]>([]);
  const [gscCountry, setGscCountry] = useState<Record<string, unknown>[]>([]);
  const [, setGscTrend] = useState<Record<string, unknown>[]>([]);
  const [queryFilter, setQueryFilter] = useState("");

  const { from, to } = useMemo(() => dateRangeFor(filters.preset), [filters.preset]);
  const daysInWindow = useMemo(() => daysBetweenInclusive(from, to), [from, to]);
  const ga4TrendCoverage = useMemo(() => summarizeTrend(ga4Trend), [ga4Trend]);
  const gscSiteTrendCoverage = useMemo(() => summarizeTrend(gscSiteTrend), [gscSiteTrend]);
  // A synthetic all-excluded row makes confBadge say "unavailable" and suppress the number.
  const gscSiteRow = gscSiteAvailable ? gscSiteKpi : UNAVAILABLE_ROW;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await getDb();
      const haveGa4Channel = await registerParquet(
        "fact_ga4_channel_daily",
        "/data/reports/fact_ga4_channel_daily.parquet"
      );
      const haveGa4Geo = await registerParquet("fact_ga4_geo_daily", "/data/reports/fact_ga4_geo_daily.parquet");
      const haveGsc = await registerParquet("fact_gsc_daily", "/data/reports/fact_gsc_daily.parquet");
      const haveGscSite = await registerParquet("fact_gsc_site_daily", "/data/reports/fact_gsc_site_daily.parquet");
      setGscSiteAvailable(haveGscSite);

      let ga4SessionsForLog = 0;
      let gscClicksForLog = 0;
      try {
        if (haveGa4Channel) {
          const [kpi, maxD, byChannel, byPage, trend] = await Promise.all([
            query(ga4KpiSql({ fromDate: from, toDate: to })),
            query<{ max_date: string }>(ga4MaxDateSql()),
            query(ga4ByChannelSql({ fromDate: from, toDate: to })),
            query(ga4ByLandingPageSql({ fromDate: from, toDate: to })),
            query(ga4TrendSql()),
          ]);
          if (cancelled) return;
          setGa4Kpi(kpi[0] ?? null);
          ga4SessionsForLog = asNumber(kpi[0]?.sessions);
          setGa4MaxDate(maxD[0]?.max_date ?? null);
          setGa4ByChannel(byChannel);
          setGa4ByPage(byPage);
          setGa4Trend(trend);
        }
        if (haveGa4Geo) {
          const [byGeo, geoKpi] = await Promise.all([
            query(ga4ByGeoSql({ fromDate: from, toDate: to })),
            query(ga4GeoKpiSql({ fromDate: from, toDate: to })),
          ]);
          if (cancelled) return;
          setGa4ByGeo(byGeo);
          setGa4GeoKpi(geoKpi[0] ?? null);
        }
        if (haveGsc) {
          const [kpi, maxD, queries, pages, device, country, trend] = await Promise.all([
            query(gscKpiSql({ fromDate: from, toDate: to })),
            query<{ max_date: string }>(gscMaxDateSql()),
            query(gscQueryExplorerSql({ fromDate: from, toDate: to, filterText: queryFilter })),
            query(gscPageExplorerSql({ fromDate: from, toDate: to })),
            query(gscByDeviceSql({ fromDate: from, toDate: to })),
            query(gscByCountrySql({ fromDate: from, toDate: to })),
            query(gscTrendSql()),
          ]);
          if (cancelled) return;
          setGscKpi(kpi[0] ?? null);
          gscClicksForLog = asNumber(kpi[0]?.clicks);
          setGscMaxDate(maxD[0]?.max_date ?? null);
          setGscQueries(queries);
          setGscPages(pages);
          setGscDevice(device);
          setGscCountry(country);
          setGscTrend(trend);
          if (haveGscSite) {
            try {
              const [siteKpi, siteTrend] = await Promise.all([
                query(gscSiteKpiSql({ fromDate: from, toDate: to })),
                query(gscSiteTrendSql()),
              ]);
              if (cancelled) return;
              setGscSiteKpi(siteKpi[0] ?? null);
              setGscSiteTrend(siteTrend);
            } catch (e) {
              reportLog.warn(`[reports] gsc site-daily query failed: ${String(e)}`);
            }
          }
        }
        if (!cancelled) {
          // Logged from the freshly fetched rows, never from state (state
          // updates above are async and would still read the prior render's
          // stale value here, printing sessions=0 before the query settles).
          reportLog.info(`[reports] organic ga4 sessions=${ga4SessionsForLog} gsc clicks=${gscClicksForLog}`);
        }
      } catch (e) {
        if (!cancelled) setError(`unavailable_feed: organic query failed (${String(e)})`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // Re-run just the query explorer when the text filter changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await query(gscQueryExplorerSql({ fromDate: from, toDate: to, filterText: queryFilter }));
        if (!cancelled) setGscQueries(rows);
      } catch {
        // leave the prior result set on screen
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFilter]);

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-[13px] text-muted-foreground">Website traffic and search for Northbeam. The market filter does not apply here, because organic data has no market.</p>

      {error && <div className="text-[12px] text-[var(--crit)]">{error}</div>}

      <div className="flex gap-1 rounded-md bg-secondary p-0.5 w-fit">
        {(["ga4", "gsc"] as SubTab[]).map((k) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={
              "rounded px-3 py-1 text-[11.5px] font-semibold " +
              (sub === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            {k === "ga4" ? "GA4" : "Search Console"}
          </button>
        ))}
      </div>

      {sub === "ga4" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Sessions" value={num(ga4Kpi?.sessions)} row={ga4Kpi} daysInWindow={daysInWindow} />
            <Kpi label="Engaged sessions" value={num(ga4Kpi?.engaged_sessions)} row={ga4Kpi} daysInWindow={daysInWindow} />
            <Kpi
              label="Engagement rate"
              value={
                ga4Kpi && asNumber(ga4Kpi.sessions) > 0
                  ? pct(asNumber(ga4Kpi.engaged_sessions) / asNumber(ga4Kpi.sessions))
                  : "n/a"
              }
              row={ga4Kpi}
              daysInWindow={daysInWindow}
            />
            <Kpi label="Key events" value={num(ga4Kpi?.key_events)} row={ga4Kpi} daysInWindow={daysInWindow} />
            <Kpi label="Users" value={num(ga4Kpi?.users)} row={ga4Kpi} daysInWindow={daysInWindow} />
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold">
              Sessions, last 28 days
              <ConfBadge row={ga4TrendCoverage} daysInWindow={28} />
            </div>
            <Sparkline
              points={ga4Trend.map((r) => ({ x: String(r.date).slice(0, 10), y: asNumber(r.sessions) }))}
              unit="sessions"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold">By channel group<ConfBadge row={ga4Kpi} daysInWindow={daysInWindow} /></div>
            <DataTable
              cols={[
                { key: "channel_group", label: "Channel group" },
                { key: "sessions", label: "Sessions", fmt: num },
                { key: "engaged_sessions", label: "Engaged", fmt: num },
                { key: "key_events", label: "Key events", fmt: num },
                { key: "users", label: "Users", fmt: num },
              ]}
              rows={ga4ByChannel}
              numericCols={["sessions", "engaged_sessions", "key_events", "users"]}
              emptyLabel="no GA4 channel rows in this window"
              daysInWindow={daysInWindow}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold">By landing page (top 25)<ConfBadge row={ga4Kpi} daysInWindow={daysInWindow} /></div>
            <DataTable
              cols={[
                { key: "landing_page", label: "Landing page" },
                { key: "sessions", label: "Sessions", fmt: num },
                { key: "engaged_sessions", label: "Engaged", fmt: num },
                { key: "key_events", label: "Key events", fmt: num },
                { key: "users", label: "Users", fmt: num },
              ]}
              rows={ga4ByPage}
              numericCols={["sessions", "engaged_sessions", "key_events", "users"]}
              emptyLabel="no GA4 landing page rows in this window"
              daysInWindow={daysInWindow}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold">By city / region (top 25)<ConfBadge row={ga4GeoKpi} daysInWindow={daysInWindow} /></div>
            <DataTable
              cols={[
                { key: "city", label: "City" },
                { key: "region", label: "Region" },
                { key: "sessions", label: "Sessions", fmt: num },
                { key: "engaged_sessions", label: "Engaged", fmt: num },
                { key: "key_events", label: "Key events", fmt: num },
                { key: "users", label: "Users", fmt: num },
              ]}
              rows={ga4ByGeo}
              numericCols={["sessions", "engaged_sessions", "key_events", "users"]}
              emptyLabel="no GA4 geo rows in this window"
              daysInWindow={daysInWindow}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Clicks" value={num(gscSiteKpi?.clicks)} row={gscSiteRow} daysInWindow={daysInWindow} />
            <Kpi label="Impressions" value={num(gscSiteKpi?.impressions)} row={gscSiteRow} daysInWindow={daysInWindow} />
            <Kpi label="CTR" value={pct(gscSiteKpi?.ctr)} row={gscSiteRow} daysInWindow={daysInWindow} />
            <Kpi label="Avg position" value={pos(gscSiteKpi?.avg_position)} row={gscSiteRow} daysInWindow={daysInWindow} />
          </div>
          {!gscSiteAvailable && (
            <div className="rounded-md border border-[var(--crit,#c33)]/40 bg-[var(--crit,#c33)]/10 px-3 py-1.5 text-[11px] text-foreground">
              Site totals unavailable: <b>fact_gsc_site_daily</b> (site, date) is not published yet. The query x page rows below
              are not summable to a site total (GSC drops anonymized queries), so no total is shown rather than a wrong one.
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold">
              Clicks, last 28 days (site total, {GSC_PRIMARY_SITE})
              <ConfBadge row={gscSiteAvailable ? gscSiteTrendCoverage : UNAVAILABLE_ROW} daysInWindow={28} />
            </div>
            {gscSiteAvailable ? (
              <Sparkline points={gscSiteTrend.map((r) => ({ x: String(r.date).slice(0, 10), y: asNumber(r.clicks) }))} unit="clicks" />
            ) : (
              <div className="text-[11px] text-muted-foreground">unavailable until fact_gsc_site_daily publishes</div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold">
              Query explorer (top 50 by clicks)
              <ConfBadge row={gscKpi} daysInWindow={daysInWindow} />
              <input
                value={queryFilter}
                onChange={(e) => setQueryFilter(e.target.value)}
                placeholder="filter query text..."
                className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-[11px] font-normal"
              />
            </div>
            <DataTable
              cols={[
                { key: "query", label: "Query" },
                { key: "clicks", label: "Clicks", fmt: num },
                { key: "impressions", label: "Impressions", fmt: num },
                { key: "ctr", label: "CTR", fmt: pct },
                { key: "avg_position", label: "Avg position", fmt: pos },
              ]}
              rows={gscQueries}
              numericCols={["clicks", "impressions", "ctr", "avg_position"]}
              emptyLabel="no GSC query rows in this window"
              daysInWindow={daysInWindow}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold">Page explorer (top 25)<ConfBadge row={gscKpi} daysInWindow={daysInWindow} /></div>
            <DataTable
              cols={[
                { key: "page", label: "Page" },
                { key: "clicks", label: "Clicks", fmt: num },
                { key: "impressions", label: "Impressions", fmt: num },
                { key: "ctr", label: "CTR", fmt: pct },
                { key: "avg_position", label: "Avg position", fmt: pos },
              ]}
              rows={gscPages}
              numericCols={["clicks", "impressions", "ctr", "avg_position"]}
              emptyLabel="no GSC page rows in this window"
              daysInWindow={daysInWindow}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold">By device<ConfBadge row={gscKpi} daysInWindow={daysInWindow} /></div>
              <DataTable
                cols={[
                  { key: "device", label: "Device" },
                  { key: "clicks", label: "Clicks", fmt: num },
                  { key: "impressions", label: "Impressions", fmt: num },
                  { key: "ctr", label: "CTR", fmt: pct },
                  { key: "avg_position", label: "Avg position", fmt: pos },
                ]}
                rows={gscDevice}
                numericCols={["clicks", "impressions", "ctr", "avg_position"]}
                emptyLabel="no GSC device rows in this window"
                daysInWindow={daysInWindow}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold">By country<ConfBadge row={gscKpi} daysInWindow={daysInWindow} /></div>
              <DataTable
                cols={[
                  { key: "country", label: "Country" },
                  { key: "clicks", label: "Clicks", fmt: num },
                  { key: "impressions", label: "Impressions", fmt: num },
                  { key: "ctr", label: "CTR", fmt: pct },
                  { key: "avg_position", label: "Avg position", fmt: pos },
                ]}
                rows={gscCountry}
                numericCols={["clicks", "impressions", "ctr", "avg_position"]}
                emptyLabel="no GSC country rows in this window"
                daysInWindow={daysInWindow}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
