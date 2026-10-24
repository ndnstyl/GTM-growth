"use client";

// The Digital Marketing board: one tile, one route, in this order: the marketing cost target
// strip, the metric picker, the comparison row, the re-based panels, spend, the source chain,
// pacing, and health. Feeds register explicitly (never through the manifest); an absent feed is an
// UNAVAILABLE reason in the panels, never a crash. Light and dark; phone width never
// overflows horizontally (every table scrolls inside its own panel).

import { useEffect, useState } from "react";
import { getDb, query } from "@/lib/reports/duck";
import { reportLog } from "@/lib/reports/log";
import { registerDigitalFeeds, type FeedPresence } from "@/lib/reports/digital/feeds";
import { loadRebaseMap, loadDigitalTemplates, type DigitalTemplate, type RebaseMap } from "@/lib/reports/digital/rebase";
import { loadPickedMetric, DEFAULT_METRIC } from "@/lib/reports/digital/picker";
import { findSource } from "@/lib/reports/workbench/sources";
import { DrillPanel } from "@/components/reports/workbench/DrillGrid";
import { PageHeader } from "@/components/shell/PageHeader";
import { TargetStrip } from "./TargetStrip";
import { MetricPicker } from "./MetricPicker";
import { ComparisonRow } from "./ComparisonRow";
import { RebasedPanels } from "./RebasedPanels";
import { SpendSection, type DrillAsk } from "./SpendSection";
import { SourceChainSection } from "./SourceChainSection";
import { PacingPanel } from "./PacingPanel";
import { HealthPanel, readFeedAsOf, type FeedAsOf } from "./HealthPanel";
import { Reason } from "./PanelFrame";

export function DigitalBoard() {
  const [metric, setMetric] = useState<string>(DEFAULT_METRIC);
  const [presence, setPresence] = useState<FeedPresence | null>(null);
  const [map, setMap] = useState<RebaseMap | null>(null);
  const [templates, setTemplates] = useState<Record<string, DigitalTemplate>>({});
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [period, setPeriod] = useState<string | null>(null);
  const [market, setMarket] = useState<string | undefined>(undefined);
  const [asOf, setAsOf] = useState<FeedAsOf[] | null>(null);
  // the last data day each feed carries: a feed's as_of is the export clock, which reads one
  // day later than the data it carries (the spend and CRM rows run through yesterday)
  const [lastDay, setLastDay] = useState<{ spend: string | null; chain: string | null } | null>(null);
  const [batch, setBatch] = useState<string>("unstamped");
  const [drill, setDrill] = useState<DrillAsk | null>(null);

  useEffect(() => {
    // the picked metric is a per-viewer convenience (localStorage, try/catch inside); it is
    // read after mount so the static export and the first client render agree
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once after mount
    setMetric(loadPickedMetric());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const errors: string[] = [];
      try {
        await getDb();
        const p = await registerDigitalFeeds();
        if (cancelled) return;
        setPresence(p);
        const [{ map: m, errors: me }, { templates: t, errors: te }] = await Promise.all([loadRebaseMap(), loadDigitalTemplates()]);
        if (cancelled) return;
        setMap(m);
        setTemplates(t);
        errors.push(...me, ...te);
        if (!p.missing.includes("dm_spend_daily")) {
          try {
            const mo = (await query("SELECT DISTINCT substr(spend_date, 1, 7) AS month FROM dm_spend_daily ORDER BY 1 DESC")) as { month: string }[];
            const mk = (await query("SELECT DISTINCT market FROM dm_spend_daily WHERE market IS NOT NULL AND market <> 'ALL' ORDER BY 1")) as { market: string }[];
            const b = (await query("SELECT export_batch_id FROM dm_spend_daily LIMIT 1")) as { export_batch_id: string }[];
            if (cancelled) return;
            setMonths(mo.map((x) => x.month));
            setMarkets(mk.map((x) => x.market));
            setPeriod(mo[0]?.month ?? null);
            setBatch(b[0]?.export_batch_id ?? "unstamped");
          } catch (e) {
            errors.push(`month and market lists: ${String(e)}`);
          }
        }
        setAsOf(await readFeedAsOf(p));
        try {
          const lastOf = async (feed: string, col: string) =>
            p.missing.includes(feed)
              ? null
              : (((await query(`SELECT CAST(${col} AS VARCHAR) AS d FROM ${feed} ORDER BY ${col} DESC LIMIT 1`)) as { d: string }[])[0]?.d ?? null);
          const spendDay = await lastOf("dm_spend_daily", "spend_date");
          const chainDay = await lastOf("dm_source_chain_daily", "date");
          if (!cancelled) setLastDay({ spend: spendDay, chain: chainDay });
        } catch (e) {
          errors.push(`last data day: ${String(e)}`);
        }
      } catch (e) {
        errors.push(`engine: ${String(e)}`);
        reportLog.error(`[reports] digital board init failed (${String(e)})`);
      }
      if (!cancelled) setLoadErrors(errors);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dataThrough = lastDay?.spend ?? "not published";
  const drillSource = drill ? findSource(drill.sourceKey) : undefined;

  return (
    <div className="reports-shell min-h-full">
      <div className="min-h-full bg-background text-foreground">
        <div className="mx-auto max-w-[1600px] px-3 pt-4 sm:px-4">
          <PageHeader
            title="Digital marketing"
            subtitle="Spend, pacing and results by market, from our database"
            actions={
              <>
                <select value={period ?? ""} onChange={(e) => setPeriod(e.target.value || null)} className="rounded-md border border-border bg-background px-2 py-1.5 text-[13px]" aria-label="Month">
                  {months.length ? months.map((m) => <option key={m} value={m}>{new Date(m + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>) : <option value="">Loading months</option>}
                </select>
                <select value={market ?? ""} onChange={(e) => setMarket(e.target.value || undefined)} className="rounded-md border border-border bg-background px-2 py-1.5 text-[13px]" aria-label="Market">
                  <option value="">All markets</option>
                  {markets.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </>
            }
          />
        </div>

        <div className="mx-auto max-w-[1600px] space-y-3 px-3 py-3 sm:px-4">
          {loadErrors.length > 0 && (
            <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-[13px] text-[var(--warn)]">
              {loadErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {presence && presence.missing.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 text-[11.5px] text-muted-foreground">
              Some data is not loaded yet; each panel that needs it says so in place.
            </div>
          )}
          {!presence && <Reason text="Preparing the data" tone="muted" />}

          <TargetStrip period={period} presence={presence} />
          <MetricPicker value={metric} onChange={setMetric} />
          <ComparisonRow metric={metric} map={map} period={period} presence={presence} />
          <RebasedPanels templates={templates} metric={metric} map={map} period={period} presence={presence} />
          <SpendSection templates={templates} map={map} period={period} market={market} presence={presence} dataThrough={dataThrough} onDrill={setDrill} />
          <SourceChainSection templates={templates} map={map} period={period} market={market} presence={presence} dataThrough={lastDay?.chain ?? "not published"} onDrill={setDrill} />
          <PacingPanel metric={metric} map={map} period={period} market={market} presence={presence} />

          <HealthPanel presence={presence} asOf={asOf} />

          {drill && drillSource && (
            <DrillPanel
              source={drillSource}
              batch={batch}
              cellDims={drill.cellDims}
              measureKey={drill.measureKey}
              cellValue={drill.cellValue}
              state={null}
              viewBounds={{ filters: drill.filters.map((f) => ({ dimKey: f.dimKey, values: f.values })) }}
              onClose={() => setDrill(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
