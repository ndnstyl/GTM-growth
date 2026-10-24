"use client";

import { useEffect, useState } from "react";
import { query } from "@/lib/reports/duck";
import {
  overviewByMarketSql,
  overviewTotalsSql,
  overviewTrend28Sql,
} from "@/lib/reports/sql/overview.sql";
import { FilterState } from "@/components/reports/FilterBar";
import { reportLog } from "@/lib/reports/log";
import { moneyDollars } from "@/lib/reports/format";
import { SeriesChart, compactMoney } from "@/components/reports/SeriesChart";

const RANK: Record<string, number> = {
  deterministic: 4,
  mapped: 3,
  provisional: 2,
  unavailable_low_n: 1,
  unavailable_grain: 1,
  unavailable_feed: 0,
};

function rank(c: string | null | undefined): number {
  if (!c) return 0;
  return RANK[c] ?? 1;
}

// One feed's coverage over a window: how many rows came back, how many of
// those are unavailable_*, and how many of the window's calendar days have
//  - 0 rows for the whole window -> unavailable, no number.
//  - every row is unavailable_* -> unavailable, no number, reason = the
//    worst-available confidence has nothing to report so the raw value
//    string carries the reason.
//  - SOME rows unavailable_*, or fewer distinct days than the window ->
//    partial, number shown, tooltip names what's excluded.
//  - otherwise ok, badge = lowest confidence among the (all-available) rows.
type Coverage = {
  rows: number;
  unavailableRows: number;
  distinctDays: number;
  daysInWindow: number;
  worstAvailableConfidence: string | null;
};

type Status = "ok" | "partial" | "unavailable";

type BadgeResult = { status: Status; label: string; tooltip: string };

function coverageBadge(feedLabel: string, c: Coverage): BadgeResult {
  if (c.rows === 0) {
    return {
      status: "unavailable",
      label: "unavailable_feed",
      tooltip: `${feedLabel}: 0 of ${c.daysInWindow} days`,
    };
  }
  const allUnavailable = c.unavailableRows === c.rows;
  if (allUnavailable) {
    return {
      status: "unavailable",
      label: "unavailable",
      tooltip: `${feedLabel}: all ${c.rows} rows unavailable`,
    };
  }
  const dayShort = c.distinctDays < c.daysInWindow;
  const rowsExcluded = c.unavailableRows > 0;
  if (dayShort || rowsExcluded) {
    const parts: string[] = [];
    if (dayShort) parts.push(`${c.distinctDays} of ${c.daysInWindow} days`);
    if (rowsExcluded) parts.push(`${c.unavailableRows} of ${c.rows} rows excluded (unavailable)`);
    return {
      status: "partial",
      label: c.worstAvailableConfidence ?? "provisional",
      tooltip: `${feedLabel}: ${parts.join("; ")}`,
    };
  }
  return {
    status: "ok",
    label: c.worstAvailableConfidence ?? "deterministic",
    tooltip: `${feedLabel}: ${c.distinctDays} of ${c.daysInWindow} days`,
  };
}

const STATUS_RANK: Record<Status, number> = { unavailable: 0, partial: 1, ok: 2 };

// Worst-of across every feed a tile depends on: unavailable beats partial
// beats ok; ties within "ok" are broken by the lowest confidence rank.
function combineBadges(badges: BadgeResult[]): BadgeResult {
  let worst = badges[0];
  for (const b of badges.slice(1)) {
    if (STATUS_RANK[b.status] < STATUS_RANK[worst.status]) worst = b;
    else if (
      b.status === worst.status &&
      b.status === "ok" &&
      rank(b.label) < rank(worst.label)
    )
      worst = b;
  }
  const tooltip = badges.map((b) => b.tooltip).join("; ");
  return { status: worst.status, label: worst.label, tooltip };
}

function badgeClass(status: Status, label: string): string {
  if (status === "unavailable") return "bg-[var(--crit)]/15 text-[var(--crit)]";
  if (status === "partial") return "bg-[var(--warn)]/15 text-[var(--warn)]";
  const r = rank(label);
  if (r >= 4) return "bg-[var(--good)]/15 text-[var(--good)]";
  if (r === 3) return "bg-[var(--warn)]/15 text-[var(--warn)]";
  return "bg-[var(--warn)]/15 text-[var(--warn)]";
}

function badgeText(status: Status, label: string): string {
  return status === "ok" ? label : status;
}

type Tile = {
  key: string;
  label: string;
  value: number | null;
  fmt: "usd" | "int" | "pct" | "ratio";
  badge: BadgeResult;
  asOf?: string | null;
};

function fmtValue(t: Tile): string {
  if (t.value === null || t.badge.status === "unavailable") return "unavailable";
  switch (t.fmt) {
    case "usd":
      return `$${t.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    case "pct":
      return `${(t.value * 100).toFixed(1)}%`;
    case "ratio":
      return `${t.value.toFixed(1)}x`;
    default:
      return t.value.toLocaleString();
  }
}

function KpiTile({ tile }: { tile: Tile }) {
  const down = tile.badge.status === "unavailable";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1 min-h-[30px] text-[12px] leading-tight text-[var(--ink2)]">{tile.label}</div>
      <div className="text-[20px] font-bold">{fmtValue(tile)}</div>
      {down ? <div className="mt-1 text-[12px] text-[var(--crit)]">{tile.badge.tooltip}</div> : null}
    </div>
  );
}

// every trend carries axis ticks, per-point values and a summary
// strip; a day with no row draws as a marked gap and is named in the strip.
function toneOf(conf: string | null): "ok" | "partial" | "unavailable" {
  if (!conf) return "ok";
  if (conf.startsWith("unavailable")) return "unavailable";
  if (conf === "provisional") return "partial";
  return "ok";
}

type TotalsRow = {
  spend_cents: number | null;
  spend_platforms: string | null;
  spend_as_of: string | null;
  spend_rows: number;
  spend_unavailable_rows: number;
  spend_distinct_days: number;
  spend_days_in_window: number;
  spend_worst_available_confidence: string | null;
  leads: number | null;
  sets: number | null;
  issues: number | null;
  demos: number | null;
  sales: number | null;
  gross_cents: number | null;
  net_cents: number | null;
  funnel_as_of: string | null;
  funnel_rows: number;
  funnel_unavailable_rows: number;
  funnel_distinct_days: number;
  funnel_days_in_window: number;
  funnel_worst_available_confidence: string | null;
};

type MarketRow = {
  market_id: string | null;
  market_name: string | null;
  spend_cents: number | null;
  spend_rows: number | null;
  spend_unavailable_rows: number | null;
  spend_distinct_days: number | null;
  spend_days_in_window: number | null;
  spend_worst_available_confidence: string | null;
  leads: number | null;
  sets: number | null;
  issues: number | null;
  sales: number | null;
  gross_cents: number | null;
  funnel_rows: number | null;
  funnel_unavailable_rows: number | null;
  funnel_distinct_days: number | null;
  funnel_days_in_window: number | null;
  funnel_worst_available_confidence: string | null;
};

type TrendRow = {
  date: string;
  spend_cents: number | null;
  spend_confidence: string | null;
  leads: number | null;
  funnel_confidence: string | null;
};

function coverageOf(row: {
  rows: number | null;
  unavailableRows: number | null;
  distinctDays: number | null;
  daysInWindow: number | null;
  worstAvailableConfidence: string | null;
}): Coverage {
  return {
    rows: row.rows ?? 0,
    unavailableRows: row.unavailableRows ?? 0,
    distinctDays: row.distinctDays ?? 0,
    daysInWindow: row.daysInWindow ?? 0,
    worstAvailableConfidence: row.worstAvailableConfidence,
  };
}

export function Overview({ filters, ready }: { filters: FilterState; ready: boolean }) {
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  // Which ad platforms the spend total actually contains; a missing platform makes every
  // spend-derived figure partial.
  const [spendPlatforms, setSpendPlatforms] = useState<string | null>(null);
  const [marketRows, setMarketRows] = useState<MarketRow[] | null>(null);
  const [trend, setTrend] = useState<TrendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const totalsSql = overviewTotalsSql({ preset: filters.preset, market: filters.market });
        const totalsRows = await query<TotalsRow>(totalsSql);
        const t = totalsRows[0];
        if (!t) return;

        const spendUsd = t.spend_cents !== null ? t.spend_cents / 100 : null;
        setSpendPlatforms(t.spend_platforms ?? null);
        const grossUsd = t.gross_cents !== null ? t.gross_cents / 100 : null;
        const asOf = t.spend_as_of ?? t.funnel_as_of ?? null;

        const spendCov = coverageOf({
          rows: t.spend_rows,
          unavailableRows: t.spend_unavailable_rows,
          distinctDays: t.spend_distinct_days,
          daysInWindow: t.spend_days_in_window,
          worstAvailableConfidence: t.spend_worst_available_confidence,
        });
        const funnelCov = coverageOf({
          rows: t.funnel_rows,
          unavailableRows: t.funnel_unavailable_rows,
          distinctDays: t.funnel_distinct_days,
          daysInWindow: t.funnel_days_in_window,
          worstAvailableConfidence: t.funnel_worst_available_confidence,
        });
        const spendBadge = coverageBadge("spend", spendCov);
        const funnelBadge = coverageBadge("funnel", funnelCov);
        const bothBadge = combineBadges([spendBadge, funnelBadge]);

        const leads = t.leads;
        const sets = t.sets;
        const issued = t.issues;
        const sales = t.sales;

        const built: Tile[] = [
          { key: "spend", label: "Spend", value: spendUsd, fmt: "usd", badge: spendBadge, asOf },
          { key: "leads", label: "Leads", value: leads, fmt: "int", badge: funnelBadge, asOf },
          {
            key: "cpl",
            label: "Cost per lead",
            value: spendUsd !== null && leads ? spendUsd / leads : null,
            fmt: "usd",
            badge: bothBadge,
            asOf,
          },
          { key: "sets", label: "Appointments set", value: sets, fmt: "int", badge: funnelBadge, asOf },
          {
            key: "cost_per_set",
            label: "Cost per set",
            value: spendUsd !== null && sets ? spendUsd / sets : null,
            fmt: "usd",
            badge: bothBadge,
            asOf,
          },
          { key: "issued", label: "Appointments issued", value: issued, fmt: "int", badge: funnelBadge, asOf },
          { key: "sales", label: "Sales", value: sales, fmt: "int", badge: funnelBadge, asOf },
          {
            key: "cost_per_sale",
            label: "Cost per sale",
            value: spendUsd !== null && sales ? spendUsd / sales : null,
            fmt: "usd",
            badge: bothBadge,
            asOf,
          },
          { key: "gross", label: "Gross revenue", value: grossUsd, fmt: "usd", badge: funnelBadge, asOf },
          {
            key: "mer_gross",
            label: "MER (revenue ÷ ad spend)",
            value: spendUsd && grossUsd !== null ? grossUsd / spendUsd : null,
            fmt: "ratio",
            badge: bothBadge,
            asOf,
          },
          {
            key: "gsli",
            label: "Gross revenue per issued appointment",
            value: grossUsd !== null && issued ? grossUsd / issued : null,
            fmt: "usd",
            badge: funnelBadge,
            asOf,
          },
          {
            key: "close_rate_issued",
            label: "Close rate, sales ÷ issued appointments",
            value: sales !== null && issued ? sales / issued : null,
            fmt: "pct",
            badge: funnelBadge,
            asOf,
          },
          {
            key: "close_rate_demos",
            label: "Close rate, sales ÷ meetings held",
            value: sales !== null && t.demos ? sales / t.demos : null,
            fmt: "pct",
            badge: funnelBadge,
            asOf,
          },
          {
            key: "net_volume",
            label: "Net revenue, after cancels",
            value: t.net_cents !== null ? t.net_cents / 100 : null,
            fmt: "usd",
            badge: funnelBadge,
            asOf,
          },
          {
            key: "mer_net",
            label: "Ad spend as a share of net revenue",
            value: spendUsd !== null && t.net_cents ? spendUsd / (t.net_cents / 100) : null,
            fmt: "pct",
            badge: bothBadge,
            asOf,
          },
          {
            key: "nsli",
            label: "Net revenue per issued appointment",
            value: t.net_cents !== null && issued ? t.net_cents / 100 / issued : null,
            fmt: "usd",
            badge: funnelBadge,
            asOf,
          },
        ];

        if (!cancelled) setTiles(built);
        for (const tl of built) {
          reportLog.info(
            `[reports] overview ${tl.key}=${fmtValue(tl)} (${badgeText(tl.badge.status, tl.badge.label)})`
          );
        }

        const marketSql = overviewByMarketSql({ preset: filters.preset });
        const mRows = await query<MarketRow>(marketSql);
        if (!cancelled) setMarketRows(mRows);

        const trendSql = overviewTrend28Sql({ market: filters.market });
        const tRows = await query<TrendRow>(trendSql);
        if (!cancelled) setTrend(tRows);
      } catch (e) {
        if (!cancelled) setError(`unavailable_feed: overview query failed (${String(e)})`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, filters.preset, filters.market]);

  if (!ready) {
    return <div className="text-[13px] text-muted-foreground">Building contract views...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-border bg-card p-4 text-[13px] text-[var(--crit)]">{error}</div>;
  }

  const KNOWN_PLATFORMS = ["google_ads", "meta", "microsoft_ads"];
  const PLATFORM_NAME: Record<string, string> = { google_ads: "Google Ads", meta: "Meta", microsoft_ads: "Microsoft Ads" };
  const present = (spendPlatforms ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const missing = KNOWN_PLATFORMS.filter((p) => !present.includes(p));

  return (
    <div className="flex flex-col gap-4">
      {tiles && (
        <div
          className={`rounded-md border px-3 py-2 text-[11.5px] ${
            missing.length
              ? "border-[var(--warn,#d90)] bg-[var(--warn,#d90)]/10"
              : "border-border text-muted-foreground"
          }`}
        >
          <b>Spend covers {present.length ? present.map((p) => PLATFORM_NAME[p] ?? p).join(", ") : "no platform"}</b>
          {missing.length > 0 && (
            <>
              {" "}· <b>missing: {missing.map((p) => PLATFORM_NAME[p] ?? p).join(", ")}</b>. Every figure below that uses spend reads lower than the truth until that platform's feed lands.
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles ? tiles.map((t) => <KpiTile key={t.key} tile={t} />) : (
          <div className="col-span-full text-[13px] text-muted-foreground">Loading overview...</div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-[13px] font-bold">
          28-day trend
          {trend ? (
            <span className="ml-2 text-[10.5px] font-normal uppercase tracking-wide text-muted-foreground">
              ({trend.filter((r) => r.spend_cents !== null || r.leads !== null).length} of {trend.length} days)
            </span>
          ) : null}
        </h3>
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              Spend ($)
            </div>
            {trend ? (
              <SeriesChart kind="line" points={trend.map((r) => ({ date: String(r.date).slice(0, 10), value: r.spend_cents !== null ? r.spend_cents / 100 : null, tone: toneOf(r.spend_confidence) }))} fmt={moneyDollars} fmtCompact={compactMoney} unit="spend" />
            ) : (
              <div className="text-[12px] text-muted-foreground">Loading...</div>
            )}
          </div>
          <div>
            <div className="mb-1 text-[12px] text-[var(--ink2)]">
              Leads
            </div>
            {trend ? (
              <SeriesChart kind="bar" points={trend.map((r) => ({ date: String(r.date).slice(0, 10), value: r.leads, tone: toneOf(r.funnel_confidence) }))} fmt={(v) => Math.round(v).toLocaleString()} color="#00e5ff" unit="leads" />
            ) : (
              <div className="text-[12px] text-muted-foreground">Loading...</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-[13px] font-bold">By market</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Market</th>
                <th className="py-1 pr-3">Spend</th>
                <th className="py-1 pr-3">Leads</th>
                <th className="py-1 pr-3">Cost per lead</th>
                <th className="py-1 pr-3">Appts set</th>
                <th className="py-1 pr-3">Appts issued</th>
                <th className="py-1 pr-3">Sales</th>
                <th className="py-1 pr-3">Gross revenue</th>
                <th className="py-1 pr-3">MER</th>
              </tr>
            </thead>
            <tbody>
              {(marketRows ?? []).map((r) => {
                const spendCov = coverageOf({
                  rows: r.spend_rows,
                  unavailableRows: r.spend_unavailable_rows,
                  distinctDays: r.spend_distinct_days,
                  daysInWindow: r.spend_days_in_window,
                  worstAvailableConfidence: r.spend_worst_available_confidence,
                });
                const funnelCov = coverageOf({
                  rows: r.funnel_rows,
                  unavailableRows: r.funnel_unavailable_rows,
                  distinctDays: r.funnel_distinct_days,
                  daysInWindow: r.funnel_days_in_window,
                  worstAvailableConfidence: r.funnel_worst_available_confidence,
                });
                // Coverage and its badge are per feed, never a row-wide verdict:
                // a market can have unavailable spend (campaign to market
                // mapping pending) and still show real funnel numbers.
                const spendBadge = coverageBadge("spend", spendCov);
                const funnelBadge = coverageBadge("funnel", funnelCov);
                const bothBadge = combineBadges([spendBadge, funnelBadge]);
                const spendUsd = r.spend_cents !== null ? r.spend_cents / 100 : null;
                const grossUsd = r.gross_cents !== null ? r.gross_cents / 100 : null;
                const cpl = spendUsd !== null && r.leads ? spendUsd / r.leads : null;
                const mer = spendUsd && grossUsd !== null ? grossUsd / spendUsd : null;
                const spendUnavailable = spendBadge.status === "unavailable";
                const funnelUnavailable = funnelBadge.status === "unavailable";
                const bothUnavailable = bothBadge.status === "unavailable";
                const cell = (val: string | number | null | undefined, unavailable: boolean) =>
                  unavailable || val === null || val === undefined ? "unavailable" : val;
                return (
                  <tr key={r.market_id ?? "unknown"} className="border-t border-border" title={`spend: ${spendBadge.tooltip} | funnel: ${funnelBadge.tooltip}`}>
                    <td className="py-1 pr-3">{r.market_name ?? r.market_id ?? "unknown"}</td>
                    <td className="py-1 pr-3" title={spendBadge.tooltip}>{cell(spendUsd?.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }), spendUnavailable)}</td>
                    <td className="py-1 pr-3" title={funnelBadge.tooltip}>{cell(r.leads, funnelUnavailable)}</td>
                    <td className="py-1 pr-3" title={bothBadge.tooltip}>{bothUnavailable || cpl === null ? "unavailable" : `$${cpl.toFixed(2)}`}</td>
                    <td className="py-1 pr-3" title={funnelBadge.tooltip}>{cell(r.sets, funnelUnavailable)}</td>
                    <td className="py-1 pr-3" title={funnelBadge.tooltip}>{cell(r.issues, funnelUnavailable)}</td>
                    <td className="py-1 pr-3" title={funnelBadge.tooltip}>{cell(r.sales, funnelUnavailable)}</td>
                    <td className="py-1 pr-3" title={funnelBadge.tooltip}>{cell(grossUsd?.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }), funnelUnavailable)}</td>
                    <td className="py-1 pr-3" title={bothBadge.tooltip}>{bothUnavailable || mer === null ? "unavailable" : `${mer.toFixed(1)}x`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
