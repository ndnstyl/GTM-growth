"use client";

import { useEffect, useState } from "react";
import { query, registerParquet } from "@/lib/reports/duck";
import { overviewByMarketSql, overviewTrend28Sql } from "@/lib/reports/sql/overview.sql";
import { FilterState } from "@/components/reports/FilterBar";
import { moneyDollars } from "@/lib/reports/format";
import { SeriesChart, compactMoney } from "@/components/reports/SeriesChart";
import { Kpi } from "@/components/shell/Kpi";
import { KpiKey, PRESET_TO_WIN, dayLabel, deltaPct, fmt, metrics, value, win } from "@/lib/demo/metrics";

type MarketRow = {
  market_id: string | null;
  market_name: string | null;
  spend_cents: number | null;
  leads: number | null;
  sets: number | null;
  issues: number | null;
  sales: number | null;
  gross_cents: number | null;
};

type TrendRow = { date: string; spend_cents: number | null; leads: number | null };

// Every headline tile reads lib/demo/metrics.ts for the window the preset names; the chart and the by-market table
// below read the same recorded spend and funnel rows that module totals, so none of them can disagree with a tile.
const PRIMARY: KpiKey[] = ["ad_spend", "leads", "cost_per_lead", "sets", "cost_per_set", "issued", "sales", "mer"];
const MORE: KpiKey[] = ["cost_per_sale", "gross_revenue", "gross_per_issued", "close_rate", "set_rate", "net_revenue", "marketing_cost_pct", "net_per_issued"];

export function Overview({ filters, ready }: { filters: FilterState; ready: boolean }) {
  const [marketRows, setMarketRows] = useState<MarketRow[] | null>(null);
  const [trend, setTrend] = useState<TrendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const w = PRESET_TO_WIN[filters.preset] ?? "mtd";
  const wd = win(w);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        await registerParquet("dm_spend_daily", "/data/reports/dm_spend_daily.parquet");
        const mRows = await query<MarketRow>(overviewByMarketSql({ preset: filters.preset }));
        if (!cancelled) setMarketRows(mRows);
        const tRows = await query<TrendRow>(overviewTrend28Sql({ market: filters.market }));
        if (!cancelled) setTrend(tRows);
      } catch {
        if (!cancelled) setError("The overview could not load. Reload the page.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, filters.preset, filters.market]);

  if (error) {
    return <div className="rounded-xl border border-border bg-card p-4 text-[13px] text-[var(--crit)]">{error}</div>;
  }

  const tile = (k: KpiKey) => {
    const d = w === "ytd" ? null : deltaPct(w, k);
    const lower = metrics.kpis[k].lower_is_better;
    return (
      <Kpi key={k} kpi={k} win={w} label={metrics.kpis[k].label} value={fmt(k, value(w, k))} delta={d} good={d == null ? null : lower ? d <= 0 : d >= 0}
        note={k === "mer" ? "revenue ÷ ad spend" : undefined} />
    );
  };

  const money = (c: number | null) => (c == null ? "n/a" : `$${Math.round(c / 100).toLocaleString("en-US")}`);
  const num = (v: number | null) => (v == null ? "n/a" : Math.round(v).toLocaleString("en-US"));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">
        {wd.label}, {dayLabel(wd.start)} to {dayLabel(wd.end)}
        {wd.partial ? ", a partial period" : ""}. Ad spend means online media, agency fees and offline media.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{PRIMARY.map(tile)}</div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-[13px] font-bold">Last 28 days</h2>
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 text-[12px] text-[var(--ink2)]">Ad spend ($)</div>
            {trend ? (
              <SeriesChart kind="line" points={trend.map((r) => ({ date: String(r.date).slice(0, 10), value: r.spend_cents !== null ? r.spend_cents / 100 : null }))} fmt={moneyDollars} fmtCompact={compactMoney} unit="spend" />
            ) : (
              <div className="g-skel h-[170px]" aria-hidden="true" />
            )}
          </div>
          <div>
            <div className="mb-1 text-[12px] text-[var(--ink2)]">Leads</div>
            {trend ? (
              <SeriesChart kind="bar" points={trend.map((r) => ({ date: String(r.date).slice(0, 10), value: r.leads }))} fmt={(v) => Math.round(v).toLocaleString()} color="#00e5ff" unit="leads" />
            ) : (
              <div className="g-skel h-[170px]" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-[13px] font-bold">More figures for this window</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{MORE.map(tile)}</div>
      </details>

      <details className="rounded-xl border border-border bg-card p-4" open>
        <summary className="cursor-pointer text-[13px] font-bold">By market</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[var(--ink2)]">
                <th className="py-1 pr-3">Market</th>
                <th className="py-1 pr-3 text-right">Ad spend</th>
                <th className="py-1 pr-3 text-right">Leads</th>
                <th className="py-1 pr-3 text-right">Cost per lead</th>
                <th className="py-1 pr-3 text-right">Appts set</th>
                <th className="py-1 pr-3 text-right">Appts issued</th>
                <th className="py-1 pr-3 text-right">Sales</th>
                <th className="py-1 pr-3 text-right">Gross revenue</th>
                <th className="py-1 pr-3 text-right">MER</th>
              </tr>
            </thead>
            <tbody>
              {(marketRows ?? []).map((r) => {
                const cpl = r.spend_cents != null && r.leads ? r.spend_cents / 100 / r.leads : null;
                const mer = r.spend_cents && r.gross_cents != null ? r.gross_cents / r.spend_cents : null;
                return (
                  <tr key={r.market_id ?? "unknown"} className="border-t border-border">
                    <td className="py-1 pr-3">{r.market_name ?? r.market_id ?? "Unassigned"}</td>
                    <td className="py-1 pr-3 text-right">{money(r.spend_cents)}</td>
                    <td className="py-1 pr-3 text-right">{num(r.leads)}</td>
                    <td className="py-1 pr-3 text-right">{cpl == null ? "n/a" : `$${cpl.toFixed(2)}`}</td>
                    <td className="py-1 pr-3 text-right">{num(r.sets)}</td>
                    <td className="py-1 pr-3 text-right">{num(r.issues)}</td>
                    <td className="py-1 pr-3 text-right">{num(r.sales)}</td>
                    <td className="py-1 pr-3 text-right">{money(r.gross_cents)}</td>
                    <td className="py-1 pr-3 text-right">{mer == null ? "n/a" : `${mer.toFixed(1)}x`}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-1 pr-3">All markets</td>
                <td className="py-1 pr-3 text-right">{fmt("ad_spend", value(w, "ad_spend"))}</td>
                <td className="py-1 pr-3 text-right">{fmt("leads", value(w, "leads"))}</td>
                <td className="py-1 pr-3 text-right">{fmt("cost_per_lead", value(w, "cost_per_lead"))}</td>
                <td className="py-1 pr-3 text-right">{fmt("sets", value(w, "sets"))}</td>
                <td className="py-1 pr-3 text-right">{fmt("issued", value(w, "issued"))}</td>
                <td className="py-1 pr-3 text-right">{fmt("sales", value(w, "sales"))}</td>
                <td className="py-1 pr-3 text-right">{fmt("gross_revenue", value(w, "gross_revenue"))}</td>
                <td className="py-1 pr-3 text-right">{fmt("mer", value(w, "mer"))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
