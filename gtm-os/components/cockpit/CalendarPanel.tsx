"use client";

// One Calendar panel: the clock and week strip from
// ClockNext, plus ONE deduped list of what needs the owner, ordered latch → draft → overdue
// (uncapped) → due within 14 days, from lib/needs.ts. Every row keeps the action its
// source panel offered: card dialog, Gmail draft URL, copy-path dialog for an alert.
// "What's next" was a strict subset of "Needs You"; this panel renders each card once.

import { useEffect, useState } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import { Panel, Row, usePanelCapacity } from "./Panel";
import { Card } from "@/lib/feeds";
import { Need, needKey, visibleCount } from "@/lib/needs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { realNow } from "@/lib/demo/clock";
import { useActiveInterval } from "@/lib/motion";

function weekOfYear(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1);
  // ISO-ish week number; the strip has 52 cells, so a late-December week 53 lights the last cell.
  return Math.min(52, Math.ceil(((d.getTime() - start.getTime()) / 864e5 + start.getDay() + 1) / 7));
}

// Row height (measured 31px). Chrome above the list: clock (~44px), timezone line (~18px),
// week strip (~24px incl. margin), section title (~18px) plus padding: ~110px. NeedsYou had 8.
const ROW_PX = 31;
const CHROME_PX = 110;

export function CalendarPanel({ needs, onCard }: { needs: Need[]; onCard: (c: Card) => void }) {
  const [now, setNow] = useState<Date | null>(null);
  const [pathNeed, setPathNeed] = useState<Need | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const { bodyRef, fit } = usePanelCapacity(ROW_PX, CHROME_PX);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe read: Date must not be read during the prerendered static export, only after mount.
    setNow(new Date(realNow()));
  }, []);
  // The clock ticks only while the demo is on screen, and re-syncs the moment it comes back.
  useActiveInterval(() => setNow(new Date(realNow())), 1000, { catchUp: true });

  const doCopy = async (path: string) => {
    const ok = await copyText(path);
    setCopyState(ok ? "ok" : "fail");
    setTimeout(() => setCopyState("idle"), 1200);
  };

  const wk = now ? weekOfYear(now) : 0;
  const shown = needs.slice(0, visibleCount(needs, fit));

  return (
    <>
      <Panel
        icon={<CalendarDays size={13} />}
        title="Calendar"
        action={
          <>
            {now ? (
              <span>
                Wk{wk} · {now.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}
              </span>
            ) : null}
            <span>{needs.length} open</span>
          </>
        }
        bodyRef={bodyRef}
      >
        <div className="tick pb-0.5 pt-0.5 text-[20px] font-semibold leading-none text-[var(--ink2)]">
          {now
            ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
            : <span className="g-skel inline-block h-[20px] w-[118px] align-middle" aria-label="Loading the time" />}
        </div>
        <div className="pb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{now ? Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ") : "local time"}</div>
        <div className="mb-3 flex flex-wrap gap-[3px]">
          {Array.from({ length: 52 }, (_, i) => (
            <span
              key={i}
              style={{ ["--i" as string]: i / 3 }}
              className={`g-pop h-[7px] w-[7px] rounded-[2px] ${
                i < wk - 1 ? "bg-muted-foreground/50" : i === wk - 1 ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>
        <div className="panel-title mb-1 !text-[11px]">Needs attention · alerts, media, then due dates</div>
        {shown.length ? (
          shown.map((n) => (
            <Row
              key={needKey(n)}
              onClick={() => {
                if (n.url) window.open(n.url, "_blank", "noopener,noreferrer");
                else if (n.card) onCard(n.card);
                else if (n.path) setPathNeed(n);
              }}
              left={
                <span
                  aria-hidden="true"
                  className={`h-[7px] w-[7px] self-center rounded-full ${n.overdue ? "bg-[var(--crit)]" : "bg-transparent"}`}
                />
              }
              primary={n.what}
              aux={n.who}
              right={
                <span className={`tick min-w-[42px] text-right text-[11px] font-bold ${n.overdue ? "text-[var(--crit)]" : "text-[var(--ink2)]"}`}>
                  {n.when}
                </span>
              }
            />
          ))
        ) : (
          <div className="py-1 text-[12px] text-muted-foreground">nothing needs attention</div>
        )}
      </Panel>
      <Dialog open={!!pathNeed} onOpenChange={(o) => { if (!o) { setPathNeed(null); setCopyState("idle"); } }}>
        <DialogContent className="max-w-xl">
          {pathNeed ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[15px] leading-snug">{pathNeed.what}</DialogTitle>
              </DialogHeader>
              <div className="break-all rounded-md bg-secondary px-3 py-2 font-mono text-[11px]">{pathNeed.path}</div>
              <Button variant="outline" size="sm" onClick={() => doCopy(pathNeed.path!)}>
                {copyState === "ok" ? (
                  <span className="flex items-center gap-1 text-[var(--good)]"><Check size={13} /> copied</span>
                ) : copyState === "fail" ? (
                  <span className="flex items-center gap-1 text-[var(--crit)]"><X size={13} /> copy failed</span>
                ) : (
                  "Copy path"
                )}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
