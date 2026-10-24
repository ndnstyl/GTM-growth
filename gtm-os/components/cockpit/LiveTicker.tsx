"use client";

import { Activity } from "lucide-react";
import { CountUp, useActiveInterval, useReducedMotion } from "@/lib/motion";
import { advanceLive, useLiveEvent, useLiveLeads, useLivePrev } from "@/lib/motion/live";

const CADENCE_MS = 3800;

const DOT: Record<string, string> = {
  lead: "bg-[var(--good)]",
  appointment: "bg-primary",
  consent: "bg-[var(--magenta)]",
  spend: "bg-[var(--warn)]",
  run: "bg-[var(--ink2)]",
};

/**
 * One fixed-height line under the priority strip: a synthetic feed (seeded script, never data) that
 * rolls a new event in every few seconds, plus a leads-today counter that ticks with each new lead.
 * The height is reserved, so rolling in never moves anything. Stops when off screen or reduced motion.
 */
export function LiveTicker() {
  const reduced = useReducedMotion();
  const ev = useLiveEvent();
  const prev = useLivePrev();
  const leads = useLiveLeads();
  useActiveInterval(advanceLive, CADENCE_MS, { enabled: !reduced });

  return (
    <div className="mt-1.5 flex h-[26px] items-center gap-3 overflow-hidden rounded-lg border border-border/70 bg-card/60 px-2.5 text-[12px]" role="status" aria-label="Live activity, simulated">
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--good)]">
        <span key={ev ? ev.id : 0} aria-hidden="true" className={`g-live-dot relative h-[7px] w-[7px] rounded-full bg-[var(--good)] ${ev ? "ping" : ""}`} />
        Live
      </span>
      <span className="relative h-[18px] min-w-0 flex-1">
        {prev ? (
          <span key={`o${prev.id}`} className="g-tick-out absolute inset-0 flex items-center gap-2 truncate text-[var(--ink2)]">
            <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${DOT[prev.kind]}`} />
            <span className="truncate">{prev.text}</span>
          </span>
        ) : null}
        <span key={ev ? `i${ev.id}` : "i0"} className={`${ev ? "g-tick-in" : ""} absolute inset-0 flex items-center gap-2 truncate text-foreground`}>
          <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${ev ? DOT[ev.kind] : "bg-muted-foreground/50"}`} />
          <span className="truncate">{ev ? ev.text : "Simulated activity feed"}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5 text-[11px] text-muted-foreground">
        <Activity size={11} aria-hidden="true" className="self-center text-primary" />
        Leads today
        <b className="tick min-w-[2ch] text-right text-[13px] text-primary">
          <CountUp value={leads} format={(v) => String(Math.round(v))} duration={900} delay={500} />
        </b>
      </span>
    </div>
  );
}
