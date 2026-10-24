"use client";

import { useState } from "react";
import { Info, Zap, SlidersHorizontal, RefreshCw } from "lucide-react";
import { Feeds, loadFeeds, Card } from "@/lib/feeds";
import { STATIC_FEEDS } from "@/lib/demo/staticFeeds";
import { LiveTicker } from "@/components/cockpit/LiveTicker";
import { useActiveInterval } from "@/lib/motion";
import { RunPanel, useRunState } from "@/components/cockpit/RunPanel";
import { useLayout, LayoutEditSheet, SnapshotWidget } from "@/components/cockpit/LayoutEdit";
import { ResizableColumn } from "@/components/cockpit/ResizableColumn";
import { latched, running } from "@/lib/actions";
import { MicroApps } from "@/components/cockpit/MicroApps";
import { CalendarPanel } from "@/components/cockpit/CalendarPanel";
import { MediaPanel, MediaTodayPill } from "@/components/cockpit/MediaPanel";
import { Numbers } from "@/components/cockpit/Numbers";
import { buildNeeds } from "@/lib/needs";
import { ChatPanel } from "@/components/cockpit/ChatPanel";
import { Routines } from "@/components/cockpit/Routines";
import { ConsentOpsPanel } from "@/components/cockpit/ConsentOpsPanel";
import { GtmMap } from "@/components/cockpit/GtmMap";
import { CardDialog } from "@/components/cockpit/CardDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Cockpit() {
  const [feeds, setFeeds] = useState<Feeds | null>(STATIC_FEEDS);
  const [card, setCard] = useState<Card | null>(null);
  const [oneOpen, setOneOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshing, setRefreshing] = useState<"idle" | "running" | "failed">("idle");
  const refreshAll = async () => {
    if (refreshing === "running") return;
    setRefreshing("running");
    try {
      const r = await fetch("/api/actions/refresh", { method: "POST" });
      if (!r.ok && r.status !== 409) throw new Error(`HTTP ${r.status}`);
      for (let i = 0; i < 20; i++) {
        await new Promise((ok) => setTimeout(ok, 700));
        const s = await fetch("/api/actions/refresh", { cache: "no-store" }).then((x) => x.json());
        if (s.status === "done") { await loadFeeds().then(setFeeds); setRefreshing("idle"); return; }
        if (s.status === "failed") { setRefreshing("failed"); return; }
      }
      setRefreshing("failed");
    } catch {
      setRefreshing("failed");
    }
  };
  const { panels, snapshots, save, saveErr, saveErrSeq } = useLayout();
  const [dismissedErrSeq, setDismissedErrSeq] = useState(0);
  const renderPanel = (id: string) => {
    if (id === "microapps") return <MicroApps key={id} />;
    if (id === "clocknext") return <CalendarPanel key={id} needs={needs} onCard={setCard} />;
    if (id === "media") return <MediaPanel key={id} media={feeds?.initiatives ?? null} />;
    if (id === "numbers") return <Numbers key={id} kpi={feeds?.kpi ?? null} loading={!feeds} />;
    if (id === "chat" || id === "needsyou") return <ChatPanel key={id} />;
    if (id === "routines") return <Routines key={id} routines={feeds?.routines ?? null} />;
    if (id === "consentops") return <ConsentOpsPanel key={id} />;
    if (id.startsWith("snap:")) return <SnapshotWidget key={id} name={id.slice(5)} />;
    return null;
  };
  const runState = useRunState(runsOpen);
  const liveRuns = running(runState.runs).length;
  const latchedRuns = latched(runState.runs).length;

  // The first paint already holds the feeds (static import); this is only the five-minute refresh,
  // and it stops while the demo is off screen.
  useActiveInterval(() => loadFeeds().then(setFeeds), 5 * 60 * 1000);

  const needs = buildNeeds(feeds?.board ?? null, feeds?.routines ?? null, feeds?.initiatives ?? null);

  const meta = feeds?.meta;
  const services = feeds?.routines?.services ?? [];
  const up = services.filter((s) => s.listening).length;
  const latches = (feeds?.routines?.alerts ?? []).filter((a) => a.age_h < 72).length;
  const feedsDown = Object.values(meta?.feeds ?? {}).filter((s) => s !== "ok").length;
  const one = feeds?.kpi?.one_thing;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3.5 xl:overflow-hidden">
      {saveErr && saveErrSeq !== dismissedErrSeq ? (
        <div
          role="alert"
          className="mb-3.5 flex items-center gap-3 rounded-lg border border-[var(--crit)] bg-[var(--crit)]/10 px-3 py-1.5 text-[12px] font-semibold text-[var(--crit)]"
        >
          <span className="flex-1">{saveErr}</span>
          <button onClick={() => setDismissedErrSeq(saveErrSeq)} className="uppercase tracking-wide hover:underline">
            dismiss
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 xl:min-h-0 xl:flex-1 gap-3.5 xl:grid-cols-[300px_minmax(0,1fr)_330px] 2xl:grid-cols-[330px_minmax(0,1fr)_360px]">

      <div className="g-rise flex flex-col xl:order-2 xl:min-h-0" style={{ ["--i" as string]: 1 }}>
        <h1 className="sr-only">GTM OS command cockpit</h1>
        <div className="px-1 pt-0.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Larkspur Home Services</div>
            <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
              <button type="button" aria-label="Read today's priority" title="Today's priority" onClick={() => setOneOpen(true)} className="rounded p-1.5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"><Info size={15} /></button>
              <button type="button" aria-label="Edit layout" title="Edit layout" onClick={() => setEditOpen(true)} className="rounded p-1.5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"><SlidersHorizontal size={15} /></button>
              <button
                type="button"
                onClick={refreshAll}
                title={refreshing === "running" ? "Refreshing all feeds" : refreshing === "failed" ? "Refresh failed, click to retry" : "Refresh all feeds now"}
                aria-label="Refresh all feeds now"
                className="rounded p-1.5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
              >
                <RefreshCw size={15} className={refreshing === "running" ? "animate-spin text-primary" : refreshing === "failed" ? "text-[var(--crit)]" : ""} />
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">A sample company. Pick a stage, or ask the data below.</p>
          <button
            type="button"
            onClick={() => setOneOpen(true)}
            title={one?.text.replace(/\*\*/g, "")}
            className="mt-1 block min-h-[40px] w-full rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-left text-[13px] leading-snug text-[var(--ink2)] hover:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            <b className="mr-1.5 text-[11px] uppercase tracking-wider text-primary">Priority</b>
            <span className="line-clamp-2 inline">{one ? one.text.replace(/\*\*/g, "") : "\u00a0"}</span>
          </button>
          <MediaTodayPill media={feeds?.initiatives ?? null} />
          <LiveTicker />
        </div>
        <GtmMap />
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 text-[12px] text-muted-foreground">
          <span className={up === services.length && services.length ? "text-[var(--good)]" : "font-bold text-[var(--crit)]"}>
            {services.length ? (up === services.length ? "All systems on" : `${up} of ${services.length} systems on`) : "Checking systems"}
          </span>
          <span className={latches ? "font-bold text-[var(--crit)]" : ""}>{latches ? `${latches} open alert${latches > 1 ? "s" : ""}` : "No open alerts"}</span>
          <button
            type="button"
            onClick={() => setRunsOpen(true)}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary ${
              latchedRuns || runState.apiDown ? "border-[var(--crit)] font-bold text-[var(--crit)]" : "border-border"
            }`}
            title="Loop and playbook runs"
          >
            <Zap size={11} />
            {runState.apiDown
              ? "Run history unavailable"
              : latchedRuns ? `${latchedRuns} failed run${latchedRuns > 1 ? "s" : ""}` : liveRuns ? `${liveRuns} running` : "Run history"}
          </button>
          <span>Data through {feeds?.kpi?.numbers?.as_of ? new Date(feeds.kpi.numbers.as_of + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "…"}</span>
          {feedsDown ? <span className="font-bold text-[var(--crit)]">{feedsDown} feed(s) down</span> : null}
        </div>
      </div>

      <div className="grid xl:min-h-0 xl:grid-rows-[minmax(0,1fr)] xl:order-1">
  <ResizableColumn col="left" panels={panels} save={save} renderPanel={renderPanel} />
      </div>
      <div className="grid xl:min-h-0 xl:grid-rows-[minmax(0,1fr)] xl:order-3">
  <ResizableColumn col="right" panels={panels} save={save} renderPanel={renderPanel} />
      </div>
      </div>

      <CardDialog card={card} onClose={() => setCard(null)} />
      <RunPanel open={runsOpen} onOpenChange={setRunsOpen} state={runState} />
      <LayoutEditSheet open={editOpen} onOpenChange={setEditOpen} panels={panels} snapshots={snapshots} save={save} saveErr={saveErr} />
      <Dialog open={oneOpen} onOpenChange={setOneOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[11px] uppercase tracking-[0.2em] text-primary">
              Today&apos;s priority
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{one?.text.replace(/\*\*/g, "")}</p>
          <p className="text-[11px] text-muted-foreground">from the morning brief</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
