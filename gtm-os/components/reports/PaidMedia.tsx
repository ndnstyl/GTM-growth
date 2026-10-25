"use client";

// Paid Media tab: Google / Meta / Microsoft sub-tabs. Google campaign names
// come from google_ads__dim_campaign.parquet: the file is published on disk
// but `_manifest.json` does not list it yet, so the shared contract view
// (dim_campaign, built off manifest keys in _contract_views.ts) still
// resolves empty. PaidMedia registers the four google_ads__dim_* files
// resolvedDims below and the console log `[reports] paid dims resolved=`.
// The channel split (Search / PMax / LSA / YouTube) still reads "unassigned"
// even with the campaign dim resolved: channel_id is null for all 284
// google_ads campaign rows (grammar_status = "unparsed"), so there is no
// channel to join, not a naming problem. Meta has no fact feed at all
// (blocked on Business Manager assignment; the agency-managed spend is invoice
// grain only) so its sub-tab never renders a KPI strip of zeros.

import { dateRangeFor, daysBetweenInclusive } from "@/lib/reports/dates";
import { useEffect, useMemo, useState } from "react";
import { query, registerParquet } from "@/lib/reports/duck";
import type { FilterState } from "@/components/reports/FilterBar";
import {
  campaignTableSql,
  conversionActionBreakdownSql,
  drillTableSql,
  geoTableSql,
  kpiSql,
  trendSql,
  type DimSources,
} from "@/lib/reports/sql/paid.sql";
import { reportLog } from "@/lib/reports/log";
import { asNumber, moneyDollars } from "@/lib/reports/format";
import { SeriesChart, compactMoney, type SeriesPoint } from "@/components/reports/SeriesChart";

type PlatformTab = "google" | "meta" | "microsoft";
const PLATFORM_ID: Record<PlatformTab, string> = {
  google: "google_ads",
  meta: "meta",
  microsoft: "microsoft_ads",
};


// spend_date can arrive as a full ISO timestamp string (generate_series'
// date arithmetic in trendSql yields TIMESTAMP even though the source
// column is DATE); always trim to the calendar date before display.
function asDate(v: unknown): string {
  return String(v ?? "").slice(0, 10);
}

// Confidence + coverage state for one aggregated cell (data-contract.md
// rulings): a cell with SOME unavailable_* rows, or fewer distinct days than
// the requested window, still shows its number under a "partial" badge
// naming what was excluded/short and why; a cell where EVERY row is
// unavailable shows no number at all, only the reason. A number next to an
// "unavailable" badge is never valid.
export type ConfState = {
  available_rows: number;
  unavailable_rows: number;
  unavailable_reasons: string | null;
  lowest_confidence: string;
  distinct_days?: number;
  days_in_window?: number;
};

function ConfBadge({ conf }: { conf: ConfState | undefined }) {
  if (!conf) return null;
  if (conf.available_rows === 0) {
    return (
      <span className="text-[10px] text-[var(--crit)]" title={conf.unavailable_reasons ?? undefined}>
        unavailable{conf.unavailable_reasons ? `, ${conf.unavailable_reasons}` : ""}
      </span>
    );
  }
  return null;
}

// A number is never rendered beside an "unavailable" badge; callers pass
// this through instead of the raw value when available_rows === 0.
function valueOrUnavailable(conf: ConfState | undefined, rendered: string): string {
  return conf && conf.available_rows === 0 ? "unavailable" : rendered;
}


function money(cents: unknown): string {
  return `$${(asNumber(cents) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function pct(v: unknown, digits = 1): string {
  const n = asNumber(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : "n/a";
}

type Kpi = {
  spend_cents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  all_conversions: number | null;
  conversion_value_cents: number;
  impression_share: number | null;
  video_views: number | null;
  reach: number | null;
  frequency: number | null;
  available_rows: number;
  unavailable_rows: number;
  unavailable_reasons: string | null;
  lowest_confidence: string;
  distinct_days: number;
  row_count: number;
};

type CampaignRow = {
  campaign_id: string;
  campaign_name: string;
  channel_name: string;
  market_label: string;
  spend_cents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  all_conversions: number | null;
  all_conversions_null_rows: number;
  conversion_value_cents: number;
  impression_share: number | null;
  video_views: number | null;
  reach: number | null;
  frequency: number | null;
  available_rows: number;
  unavailable_rows: number;
  unavailable_reasons: string | null;
  lowest_confidence: string;
  distinct_days: number;
};

type DrillRow = {
  unit_id: string;
  unit_name: string;
  spend_cents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  all_conversions: number | null;
  conversion_value_cents: number;
  available_rows: number;
  unavailable_rows: number;
  unavailable_reasons: string | null;
  lowest_confidence: string;
};

type BreakdownRow = {
  conversion_action_id: string;
  action_name: string;
  category: string | null;
  primary_for_goal: boolean | null;
  conversions: number;
  all_conversions: number;
  days: number;
};

type GeoRow = {
  geo_id: string;
  geo_name: string;
  geo_type: string;
  location_type: string;
  spend_cents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  available_rows: number;
  unavailable_rows: number;
  unavailable_reasons: string | null;
  lowest_confidence: string;
};

type TrendRow = {
  spend_date: string;
  spend_cents: number;
  available_rows: number;
  unavailable_rows: number;
  unavailable_reasons: string | null;
  lowest_confidence: string;
};

function confOf(
  row: {
    available_rows: number;
    unavailable_rows: number;
    unavailable_reasons: string | null;
    lowest_confidence: string;
    distinct_days?: number;
  },
  daysInWindow?: number
): ConfState {
  return {
    available_rows: asNumber(row.available_rows),
    unavailable_rows: asNumber(row.unavailable_rows),
    unavailable_reasons: row.unavailable_reasons,
    lowest_confidence: row.lowest_confidence,
    distinct_days: row.distinct_days != null ? asNumber(row.distinct_days) : undefined,
    days_in_window: daysInWindow,
  };
}

export function PaidMedia({ filters, ready }: { filters: FilterState; ready: boolean }) {
  const [platformTab, setPlatformTab] = useState<PlatformTab>("google");
  const { from, to } = useMemo(() => dateRangeFor(filters.preset), [filters.preset]);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Platform" className="flex gap-1 rounded-md bg-secondary p-0.5 w-fit">
        {(["google", "meta", "microsoft"] as PlatformTab[]).map((p) => (
          <button
            key={p}
            onClick={() => setPlatformTab(p)}
            aria-pressed={platformTab === p}
            className={
              "rounded px-3 py-1.5 text-[13px] font-medium capitalize " +
              (platformTab === p
                ? "bg-primary text-primary-foreground"
                : "text-[var(--ink2)] hover:text-foreground")
            }
          >
            {p === "google" ? "Google Ads" : p === "meta" ? "Meta" : "Microsoft Ads"}
          </button>
        ))}
      </div>

      {!ready ? (
        <div className="text-[13px] text-muted-foreground">Building contract views...</div>
      ) : (
        <PlatformPanel
          platformTab={platformTab}
          from={from}
          to={to}
          market={filters.market}
        />
      )}
    </div>
  );
}

function MetaScopeNote() {
  return (
    <div className="rounded-md border border-[var(--warn)] bg-[var(--warn)]/10 px-3 py-2 text-[11.5px]">
      <b>Meta figures come from the platform export.</b> A day with no delivery is marked as missing rather than shown as a $0 row.
    </div>
  );
}

function PlatformPanel({
  platformTab,
  from,
  to,
  market,
}: {
  platformTab: PlatformTab;
  from: string;
  to: string;
  market?: string;
}) {
  const platform = PLATFORM_ID[platformTab];
  const daysInWindow = useMemo(() => daysBetweenInclusive(from, to), [from, to]);
  const [ready, setReady] = useState(false);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [geo, setGeo] = useState<GeoRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [adSets, setAdSets] = useState<DrillRow[]>([]);
  const [, setSelectedAdSet] = useState<string | null>(null);
  const [ads, setAds] = useState<DrillRow[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState<DimSources>({});
  const [dimsResolved, setDimsResolved] = useState<string[]>([]);

  // google_ads__dim_campaign/dim_ad_set/dim_ad_unit are published on disk
  // (v1.1 double-underscore names) but _manifest.json has not been
  // regenerated to list them, so the shared contract view (dim_campaign,
  // built off manifest keys) resolves empty regardless of this glob being
  // correct. Registering the raw files directly by filename is a scoped
  // contract-view builder or any other tab.
  useEffect(() => {
    if (platformTab !== "google") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the Google-only dimension tables when another platform tab opens.
      setDims({});
      setDimsResolved([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const candidates: { key: keyof DimSources; name: string }[] = [
        { key: "campaign", name: "google_ads__dim_campaign" },
        { key: "adSet", name: "google_ads__dim_ad_set" },
        { key: "adUnit", name: "google_ads__dim_ad_unit" },
      ];
      const resolved: DimSources = {};
      const resolvedNames: string[] = [];
      for (const c of candidates) {
        const ok = await registerParquet(c.name, `/data/reports/${c.name}.parquet`).catch(() => false);
        if (ok) {
          resolved[c.key] = c.name;
          resolvedNames.push(c.name);
        }
      }
      if (cancelled) return;
      setDims(resolved);
      setDimsResolved(resolvedNames);
      reportLog.info(`[reports] paid dims resolved=[${resolvedNames.join(",")}]`);
    })();
    return () => {
      cancelled = true;
    };
  }, [platformTab]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets campaign selection at the top of the same effect that re-fetches the campaign list; the reset and fetch share one dependency array, so splitting into remount-by-key would duplicate the fetch.
    setSelectedCampaign(null);
    setSelectedAdSet(null);
    setChannelFilter(null);
    (async () => {
      try {
        const [kpiRows, campaignRows, geoRows, trendRows] = await Promise.all([
          query<Kpi>(kpiSql({ platform, fromDate: from, toDate: to, market })),
          query<CampaignRow>(campaignTableSql({ platform, fromDate: from, toDate: to, market, dims })),
          query<GeoRow>(geoTableSql({ platform, fromDate: from, toDate: to })),
          query<TrendRow>(trendSql({ platform, toDate: to })),
        ]);
        if (cancelled) return;
        setKpi(kpiRows[0] ?? null);
        setCampaigns(campaignRows);
        setGeo(geoRows);
        setTrend(trendRows);
        setReady(true);
        setError(null);
        reportLog.info(
          `[reports] paid ${platform} spend=${asNumber(kpiRows[0]?.spend_cents ?? 0)} rows=${campaignRows.length}`
        );
      } catch (e) {
        if (!cancelled) setError(`unavailable_feed: paid media query failed (${String(e)})`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platform, from, to, market, dims]);

  useEffect(() => {
    if (!selectedCampaign) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears ad-set state when the campaign selection is cleared, in the same effect that fetches ad sets for the new campaign.
      setAdSets([]);
      setSelectedAdSet(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await query<DrillRow>(
        drillTableSql({ platform, fromDate: from, toDate: to, campaignId: selectedCampaign, grain: "ad_set", dims })
      ).catch(() => []);
      if (!cancelled) setAdSets(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [platform, from, to, selectedCampaign, dims]);

  useEffect(() => {
    if (!selectedCampaign) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears ad state when the campaign selection is cleared, in the same effect that fetches ads for the new campaign.
      setAds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await query<DrillRow>(
        drillTableSql({ platform, fromDate: from, toDate: to, campaignId: selectedCampaign, grain: "ad", dims })
      ).catch(() => []);
      if (!cancelled) setAds(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [platform, from, to, selectedCampaign, dims]);

  useEffect(() => {
    if (!selectedCampaign) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the breakdown when the campaign selection is cleared, in the same effect that fetches it for the new campaign.
      setBreakdown(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await query<BreakdownRow>(
        conversionActionBreakdownSql({ platform, fromDate: from, toDate: to, campaignId: selectedCampaign })
      ).catch(() => [] as BreakdownRow[]);
      if (!cancelled) setBreakdown(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [platform, from, to, selectedCampaign]);

  const channels = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.channel_name))).sort(),
    [campaigns]
  );
  const campaignDimResolved = dimsResolved.includes("google_ads__dim_campaign");
  const channelSplitAvailable = channels.length > 1 || (channels.length === 1 && channels[0] !== "unassigned");
  const visibleCampaigns = channelFilter ? campaigns.filter((c) => c.channel_name === channelFilter) : campaigns;

  if (!ready && !error) {
    return <div className="min-h-[960px] text-[13px] text-muted-foreground">Loading spend...</div>;
  }

  return (
    <div className="flex min-h-[960px] flex-col gap-3">
      {error && <div className="text-[11px] text-[var(--crit)]">{error}</div>}

      {platformTab === "google" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Channel:</span>
          <button
            onClick={() => setChannelFilter(null)}
            className={
              "rounded px-2 py-0.5 text-[11px] " +
              (channelFilter === null ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")
            }
          >
            All
          </button>
          {channels.map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={
                "rounded px-2 py-0.5 text-[11px] capitalize " +
                (channelFilter === ch ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")
              }
            >
              {ch}
            </button>
          ))}
          {!channelSplitAvailable && (
            <span className="text-[10.5px] text-muted-foreground">
              {campaignDimResolved
                ? "campaign names resolved, but channel_id is unparsed for every google_ads campaign, so the channel split still reads unassigned"
                : "campaign/channel dim not yet published for Google Ads, all campaigns fall in \"unassigned\" until it is"}
            </span>
          )}
        </div>
      )}

      <KpiStrip kpi={kpi} platformTab={platformTab} daysInWindow={daysInWindow} />

      <TrendChart rows={trend} />

      <CampaignTable
        rows={visibleCampaigns}
        selected={selectedCampaign}
        onSelect={(id) => setSelectedCampaign(id === selectedCampaign ? null : id)}
        daysInWindow={daysInWindow}
        distinctDays={kpi ? asNumber(kpi.distinct_days) : 0}
      />

      {selectedCampaign && (
        <DrillTable title="Ad sets" rows={adSets} />
      )}
      {selectedCampaign && (
        <DrillTable title="Ads" rows={ads} />
      )}
      {selectedCampaign && breakdown && (
        <BreakdownTable rows={breakdown} campaignName={campaigns.find((c) => c.campaign_id === selectedCampaign)?.campaign_name ?? selectedCampaign} />
      )}

      {platformTab === "meta" && <MetaScopeNote />}
      <GeoTable rows={geo} />
    </div>
  );
}

function KpiCell({ label, value, conf }: { label: string; value: string; conf?: ConfState }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[16px] font-bold">{value}</div>
      {conf && <ConfBadge conf={conf} />}
    </div>
  );
}

function KpiStrip({
  kpi,
  platformTab,
  daysInWindow,
}: {
  kpi: Kpi | null;
  platformTab: PlatformTab;
  daysInWindow: number;
}) {
  if (!kpi || kpi.row_count === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-[12.5px] text-muted-foreground">
        No spend rows for this window.
      </div>
    );
  }
  const conf = confOf(kpi, daysInWindow);
  const allUnavailable = conf.available_rows === 0;
  const ctr = kpi.impressions > 0 ? kpi.clicks / kpi.impressions : 0;
  const cpc = kpi.clicks > 0 ? kpi.spend_cents / kpi.clicks : 0;
  const cpm = kpi.impressions > 0 ? (kpi.spend_cents / kpi.impressions) * 1000 : 0;
  const costPerConv = kpi.conversions > 0 ? kpi.spend_cents / kpi.conversions : 0;
  const viewRate = kpi.impressions > 0 && kpi.video_views != null ? kpi.video_views / kpi.impressions : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      <KpiCell label="Spend" value={valueOrUnavailable(conf, money(kpi.spend_cents))} conf={conf} />
      <KpiCell label="Impressions" value={valueOrUnavailable(conf, asNumber(kpi.impressions).toLocaleString())} conf={conf} />
      <KpiCell label="Clicks" value={valueOrUnavailable(conf, asNumber(kpi.clicks).toLocaleString())} conf={conf} />
      <KpiCell label="CTR" value={valueOrUnavailable(conf, pct(ctr, 2))} conf={conf} />
      <KpiCell label="CPC" value={valueOrUnavailable(conf, money(cpc))} conf={conf} />
      <KpiCell label="CPM" value={valueOrUnavailable(conf, money(cpm))} conf={conf} />
      <KpiCell label="Conversions (campaign goal)" value={valueOrUnavailable(conf, asNumber(kpi.conversions).toLocaleString())} conf={conf} />
      <KpiCell label="All conversions (every action)" value={valueOrUnavailable(conf, allConv(kpi.all_conversions))} conf={conf} />
      <KpiCell
        label="Cost / conversion"
        value={allUnavailable ? "unavailable" : kpi.conversions > 0 ? money(costPerConv) : "no conversions"}
        conf={conf}
      />
      {platformTab === "google" && (kpi.impression_share != null || allUnavailable) && (
        <KpiCell label="Impression share" value={valueOrUnavailable(conf, kpi.impression_share != null ? pct(kpi.impression_share) : "no data")} conf={conf} />
      )}
      {(kpi.video_views != null && kpi.video_views > 0) && (
        <>
          <KpiCell label="Video views" value={valueOrUnavailable(conf, asNumber(kpi.video_views).toLocaleString())} conf={conf} />
          <KpiCell label="View rate" value={valueOrUnavailable(conf, viewRate != null ? pct(viewRate) : "no data")} conf={conf} />
        </>
      )}
      {kpi.reach != null && kpi.reach > 0 && (
        <KpiCell label="Reach" value={valueOrUnavailable(conf, asNumber(kpi.reach).toLocaleString())} conf={conf} />
      )}
      {kpi.frequency != null && (
        <KpiCell label="Frequency" value={valueOrUnavailable(conf, asNumber(kpi.frequency).toFixed(2))} conf={conf} />
      )}
    </div>
  );
}

function TrendChart({ rows }: { rows: TrendRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-[12px] text-muted-foreground">
        28-day spend trend: no rows.
      </div>
    );
  }
  // Zero-filled to all 28 calendar days by trendSql (LEFT JOIN against a
  // generated date series). every bar carries its value, the axis
  // carries ticks, the strip carries total / per day / high / low / dates.
  const daysWithData = rows.filter((r) => asNumber(r.available_rows) + asNumber(r.unavailable_rows) > 0).length;
  const points: SeriesPoint[] = rows.map((r) => {
    const hasData = asNumber(r.available_rows) + asNumber(r.unavailable_rows) > 0;
    const conf = confOf(r);
    const trueUnavailable = hasData && conf.available_rows === 0;
    const partial = hasData && !trueUnavailable && conf.unavailable_rows > 0;
    return {
      date: asDate(r.spend_date),
      value: !hasData || trueUnavailable ? null : asNumber(r.spend_cents) / 100,
      tone: trueUnavailable ? "unavailable" : partial ? "partial" : "ok",
      note: trueUnavailable
        ? `unavailable, ${conf.unavailable_reasons ?? "no available rows"}`
        : partial
        ? `partial, ${conf.unavailable_rows} row(s) excluded`
        : undefined,
    };
  });
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[12.5px] font-bold">28-day spend trend</span>
        <span className="text-[11px] text-[var(--warn)]">
          {daysWithData} of {rows.length} days
        </span>
      </div>
      <SeriesChart kind="bar" points={points} fmt={moneyDollars} fmtCompact={compactMoney} unit="spend" />
    </div>
  );
}

function CampaignTable({
  rows,
  selected,
  onSelect,
  daysInWindow,
  distinctDays,
}: {
  rows: CampaignRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  daysInWindow: number;
  distinctDays: number;
}) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => asNumber(b.spend_cents) - asNumber(a.spend_cents)),
    [rows]
  );

  const headerCoverage: ConfState = {
    available_rows: rows.length,
    unavailable_rows: 0,
    unavailable_reasons: null,
    lowest_confidence: "mapped",
    distinct_days: distinctDays,
    days_in_window: daysInWindow,
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold">
        <span>Campaigns (by campaign), sorted by spend</span>
        <ConfBadge conf={headerCoverage} />
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 text-left">Campaign</th>
              <th className="py-1 pr-3 text-left">Market</th>
              <th className="py-1 pr-3 text-right">Spend</th>
              <th className="py-1 pr-3 text-right">Clicks</th>
              <th className="py-1 pr-3 text-right">Conversions (campaign goal)</th>
              <th className="py-1 pr-3 text-right">All conversions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const conf = confOf(r);
              return (
                <tr
                  key={r.campaign_id}
                  onClick={() => onSelect(r.campaign_id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.campaign_id); } }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={selected === r.campaign_id}
                  className={
                    "cursor-pointer border-t border-border hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary " +
                    (selected === r.campaign_id ? "bg-secondary" : "")
                  }
                >
                  <td className="py-1 pr-3"><span aria-hidden="true" className="mr-1.5 text-muted-foreground">{selected === r.campaign_id ? "▾" : "▸"}</span>{r.campaign_name}</td>
                  <td className="py-1 pr-3">{r.market_label}</td>
                  <td className="py-1 pr-3 text-right">{valueOrUnavailable(conf, money(r.spend_cents))}</td>
                  <td className="py-1 pr-3 text-right">{valueOrUnavailable(conf, asNumber(r.clicks).toLocaleString())}</td>
                  <td className="py-1 pr-3 text-right">{valueOrUnavailable(conf, Math.round(asNumber(r.conversions)).toLocaleString())}</td>
                  <td className="py-1 pr-3 text-right" title={asNumber(r.all_conversions_null_rows) > 0 ? `${asNumber(r.all_conversions_null_rows)} day-row(s) published before all_conversions existed count as 0 here` : undefined}>
                    {valueOrUnavailable(conf, allConv(r.all_conversions))}
                  </td>
                  <td className="py-1 pl-2">
                    <ConfBadge conf={conf} />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-center text-muted-foreground">
                  No campaigns in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground">
        Conversions (campaign goal) is the number Google bids on, only the actions in that campaign&apos;s own goal. All conversions counts every enabled
        action, including the leads a campaign produced that its goal ignores. Click a row to drill into ad sets, ads, and the actions behind both numbers.
      </div>
    </div>
  );
}

function DrillTable({ title, rows }: { title: string; rows: DrillRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-[12.5px] font-bold">{title}</div>
      <div className="max-h-[240px] overflow-y-auto">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Name / id</th>
              <th className="py-1 text-right">Spend</th>
              <th className="py-1 text-right">Clicks</th>
              <th className="py-1 text-right">Conversions (campaign goal)</th>
              <th className="py-1 text-right">All conversions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const conf = confOf(r);
              return (
                <tr key={r.unit_id} className="border-t border-border">
                  <td className="py-1">{r.unit_name}</td>
                  <td className="py-1 text-right">{valueOrUnavailable(conf, money(r.spend_cents))}</td>
                  <td className="py-1 text-right">{valueOrUnavailable(conf, asNumber(r.clicks).toLocaleString())}</td>
                  <td className="py-1 text-right">{valueOrUnavailable(conf, Math.round(asNumber(r.conversions)).toLocaleString())}</td>
                  <td className="py-1 text-right">{valueOrUnavailable(conf, allConv(r.all_conversions))}</td>
                  <td className="py-1">
                    <ConfBadge conf={conf} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-muted-foreground">
                  No rows for this campaign in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// all_conversions is NULL on rows published before 2026-09-09 (the column did not
// exist); a NULL is "not pulled", never a zero.
function allConv(v: unknown): string {
  return v === null || v === undefined ? "not pulled" : asNumber(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function BreakdownTable({ rows, campaignName }: { rows: BreakdownRow[]; campaignName: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-[12.5px] font-bold">
        Conversion actions behind the numbers
        <span className="ml-2 font-normal text-[10.5px] text-muted-foreground">{campaignName}, this window</span>
      </div>
      <div className="max-h-[240px] overflow-y-auto">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Action</th>
              <th className="py-1 text-left">Category</th>
              <th className="py-1 text-left">Primary for account goal</th>
              <th className="py-1 text-right">Counted toward campaign goal</th>
              <th className="py-1 text-right">All conversions</th>
              <th className="py-1 text-right">Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.conversion_action_id} className="border-t border-border">
                <td className="py-1">{r.action_name}</td>
                <td className="py-1">{r.category ?? "unknown"}</td>
                <td className="py-1">{r.primary_for_goal === null ? "unknown" : r.primary_for_goal ? "yes" : "no"}</td>
                <td className="py-1 text-right">{asNumber(r.conversions).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="py-1 text-right">{asNumber(r.all_conversions).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="py-1 text-right">{asNumber(r.days)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-muted-foreground">
                  No conversion action fired for this campaign in this window (or the action feed has no rows for these days yet).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">
        A row with All conversions above zero and Counted toward campaign goal at zero is an action the campaign&apos;s bidding goal ignores.
      </div>
    </div>
  );
}

function GeoTable({ rows }: { rows: GeoRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-[12.5px] font-bold">
        Spend by city (top 25)
        <span className="ml-2 font-normal text-[10.5px] text-muted-foreground">
          city rows only: the platform reports the same delivery as city, postal and county in
          parallel, so a mixed table would show every dollar three times
        </span>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Location</th>
              <th className="py-1 text-left">Basis</th>
              <th className="py-1 text-right">Spend</th>
              <th className="py-1 text-right">Clicks</th>
              <th className="py-1 text-right">Conversions (campaign goal)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const conf = confOf(r);
              return (
                <tr key={`${r.geo_id}-${i}`} className="border-t border-border">
                  <td className="py-1">{r.geo_name}</td>
                  <td className="py-1">
                    {r.location_type === "physical" ? "physical" : r.location_type === "interest" ? "interest" : r.location_type}
                  </td>
                  <td className="py-1 text-right">{valueOrUnavailable(conf, money(r.spend_cents))}</td>
                  <td className="py-1 text-right">{valueOrUnavailable(conf, asNumber(r.clicks).toLocaleString())}</td>
                  <td className="py-1 text-right">{valueOrUnavailable(conf, Math.round(asNumber(r.conversions)).toLocaleString())}</td>
                  <td className="py-1">
                    <ConfBadge conf={conf} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-muted-foreground">
                  No geo rows for this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
