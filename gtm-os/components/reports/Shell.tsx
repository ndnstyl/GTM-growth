"use client";

import { useEffect, useState } from "react";
import {
  getDb,
  loadManifest,
  Manifest,
  registerParquet,
} from "@/lib/reports/duck";
import { FilterBar, FilterState } from "@/components/reports/FilterBar";
import { Health, type HealthDoc, type JobHealthDoc } from "@/components/reports/Health";
import { FreshnessStrip } from "@/components/reports/FreshnessStrip";
import { LeadMap } from "@/components/reports/LeadMap";
import { Organic } from "@/components/reports/Organic";
import { PaidMedia } from "@/components/reports/PaidMedia";
import { Pivot } from "@/components/reports/Pivot";
import { CallCenter } from "@/components/reports/CallCenter";
import { Overview } from "@/components/reports/Overview";
import { PageHeader } from "@/components/shell/PageHeader";
import { SettleGate } from "@/components/shell/SettleGate";
import { buildContractViews, buildHierarchyViews, ContractResolution } from "@/lib/reports/sql/_contract_views";
import { reportLog } from "@/lib/reports/log";

// Maps a Shell tab to the compass.yaml view(s) it should render at the
// bottom of the panel. A tab spanning several compass views (Paid Media,
// Organic) renders all of them, stacked.
const TAB_SUB: Record<string, string> = {
  overview: "Funnel and spend across every market and channel",
  paid_media: "Google, Meta and Microsoft Ads by campaign",
  organic: "Search and website traffic",
  leads_geo: "Where leads come from, by market and zip",
  explore: "Pivot any feed by any dimension",
  call_center: "Connect rates, dials and revenue per appointment",
  health: "Feed and job freshness",
};

type TabKey =
  | "overview"
  | "paid_media"
  | "organic"
  | "leads_geo"
  | "explore"
  | "call_center" | "health";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "paid_media", label: "Paid Media" },
  { key: "organic", label: "Organic" },
  { key: "leads_geo", label: "Leads & Geo" },
  { key: "explore", label: "Explore" },
  { key: "call_center", label: "Sales floor" },
  { key: "health", label: "Health" },
];

export function Shell() {
  const [tab, setTab] = useState<TabKey>("overview");
  // Deep links: /reports/#callcenter (the retired lp.html redirect) and
  // /reports/#<tab_key>. The hash follows the active tab so a view is shareable.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace(/^#/, "").toLowerCase().replace(/-/g, "_");
      const key = h === "callcenter" ? "call_center" : h;
      if (TABS.some((t) => t.key === key)) setTab(key as TabKey);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  useEffect(() => {
    const want = tab === "overview" ? "" : `#${tab}`;
    if (window.location.hash !== want) {
      history.replaceState(null, "", `${window.location.pathname}${want}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, [tab]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [filters, setFilters] = useState<FilterState>({ preset: "mtd" });
  const [geoOptions, setGeoOptions] = useState<{ market: string[]; source: string[] }>({
    market: [],
    source: [],
  });
  const [contractResolution, setContractResolution] = useState<ContractResolution | null>(null);
  // Health + live refresh: _health.json is rewritten by every scheduler run.
  // Poll it every 5 minutes; when the store's as_of or manifest sha set changes,
  // reload so DuckDB re-registers the new parquet (the page is a static export,
  // a full reload is the honest refresh). The pill shows the overall state.
  const [health, setHealth] = useState<HealthDoc | null>(null);
  // Job-level health is a peer session's collector (the nightly job); it writes a
  // byte-identical second copy into the served data dir. Separate file, separate concern.
  const [jobHealth, setJobHealth] = useState<JobHealthDoc | null>(null);
  useEffect(() => {
    let stamp: string | null = null;
    let stopped = false;
    const check = async () => {
      try {
        const r = await fetch(`/data/reports/_feed_health.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const h = (await r.json()) as HealthDoc;
        if (stopped) return;
        setHealth(h);
        try {
          const jr = await fetch(`/data/reports/_job_health.json?t=${Date.now()}`, { cache: "no-store" });
          if (jr.ok && !stopped) setJobHealth((await jr.json()) as JobHealthDoc);
        } catch {
          /* the collector is another session's job; its absence is not our failure */
        }
        const next = `${h.as_of}|${h.generated_at}`;
        if (stamp === null) stamp = next;
        else if (next !== stamp && document.visibilityState === "visible") window.location.reload();
      } catch {
        /* offline or not yet produced: keep the last pill */
      }
    };
    check();
    const id = window.setInterval(check, 5 * 60 * 1000);
    return () => { stopped = true; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await loadManifest();
      if (cancelled) return;
      setManifest(m);
      try {
        const t0 = performance.now();
        await getDb();
        const t1 = performance.now();
        reportLog.info(`[reports] duckdb init: ${(t1 - t0).toFixed(0)}ms`);
        const resolution = await buildContractViews(m);
        await buildHierarchyViews();
        reportLog.info(
          `[reports] contract views: resolved=[${resolution.resolved.join(",")}] empty=[${resolution.empty.join(",")}]`
        );
        if (!cancelled) setContractResolution(resolution);
        // spine feeds: registered outside the manifest (which
        // build_reports.py regenerates); absence logs, never throws
        for (const spineFeed of ["spine_funnel_monthly", "spine_spend_monthly"]) {
          const ok = await registerParquet(spineFeed, `/data/reports/${spineFeed}.parquet`);
          if (!ok) {
            reportLog.warn(`[reports] unavailable_feed: ${spineFeed}.parquet`);
          }
        }
      } catch (e) {
        reportLog.error(`[reports] unavailable_feed: duckdb init failed (${String(e)})`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFeed = TABS.find((t) => t.key === tab)!;

  return (
    <div className="reports-shell flex h-full flex-col">
      <div className="space-y-2 border-b border-border px-6 pb-3 pt-4">
        <PageHeader
          title={activeFeed.label}
          subtitle={TAB_SUB[activeFeed.key]}
          actions={
            <button
              type="button"
              onClick={() => setTab("health")}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)] hover:border-primary hover:text-primary"
              title={health ? `Data as of ${health.as_of}` : "Health not available"}
            >
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${!health ? "bg-muted-foreground" : health.overall === "ok" ? "bg-[var(--good)]" : health.overall === "stale" ? "bg-[var(--warn)]" : "bg-[var(--crit)]"}`} />
              {health ? (health.overall === "ok" ? "All feeds healthy" : health.overall === "stale" ? "Some feeds are late" : "A feed is down") : "Health"}
            </button>
          }
        />
        <FreshnessStrip manifest={manifest} />
        <FilterBar
          value={filters}
          onChange={setFilters}
          options={tab === "leads_geo" ? { market: geoOptions.market } : {}}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden" aria-hidden="true">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "rounded-md px-3 py-2 text-left text-[12.5px] font-medium " +
                (tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <SettleGate key={activeFeed.key} skeleton={460}>
          {activeFeed.key === "overview" ? (
            <Overview filters={filters} ready={contractResolution !== null} />
          ) : activeFeed.key === "paid_media" ? (
            <PaidMedia filters={filters} ready={contractResolution !== null} />
          ) : activeFeed.key === "explore" ? (
            <Pivot ready={contractResolution !== null} filters={filters} />
          ) : activeFeed.key === "leads_geo" ? (
            <LeadMap filters={filters} onOptions={setGeoOptions} />
          ) : activeFeed.key === "organic" ? (
            <Organic filters={filters} />
          ) : activeFeed.key === "call_center" ? (
            <CallCenter preset={filters.preset} />
          ) : activeFeed.key === "health" ? (
            <Health doc={health} jobs={jobHealth} />
          ) : null}
          </SettleGate>
        </div>
      </div>
    </div>
  );
}
