"use client";

// Run surface: loops and playbooks the cockpit can start, with run history. Runs here are simulated
// on timers by the demo adapter; failures latch until acknowledged.

import { useCallback, useEffect, useState } from "react";
import { Play, Zap, AlertTriangle, Loader2 } from "lucide-react";
import { useActiveInterval } from "@/lib/motion";
import { realNow } from "@/lib/demo/clock";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { actions, latched, N8nButton, SkillRow, Run } from "@/lib/actions";

const POLL_MS = 30000;

/** A ring that fills over the run's real duration. Pure CSS: the delay is negative by the time already elapsed, so a
 *  reopened console picks the ring up mid-way. Runs with no known duration (seed history) fall back to a spinner. */
function RunRing({ started, estMs }: { started?: string; estMs?: number }) {
  if (!started || !estMs) return <Loader2 size={12} className="animate-spin" />;
  const t0 = Date.parse(started.includes("Z") || /[+-]\d{2}:\d{2}$/.test(started) ? started : started + "Z");
  const elapsed = Math.max(0, Math.min(estMs, realNow() - t0));
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="-rotate-90">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" pathLength={1}
        className="g-run-ring" style={{ animationDuration: `${estMs}ms`, animationDelay: `${-elapsed}ms` }} />
    </svg>
  );
}

function StatusPill({ status, started, estMs }: { status: string; started?: string; estMs?: number }) {
  // keyed by status: when a run settles the pill crossfades instead of flipping
  if (status === "failed" || status === "timeout_latched") {
    return <span key="f" className="g-pop inline-flex items-center rounded-full border border-[var(--crit)] px-2 py-0.5 text-[11px] font-bold text-[var(--crit)]">Failed</span>;
  }
  const running = status === "running";
  return (
    <span key={running ? "r" : "d"} className={`g-pop inline-flex items-center gap-1.5 text-[12px] ${running ? "text-[var(--ink2)]" : "text-[var(--good)]"}`}>
      {running ? <RunRing started={started} estMs={estMs} /> : <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--good)]" />}
      {running ? "Running" : "Done"}
    </span>
  );
}

const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.includes("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

export function useRunState(open: boolean) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [buttons, setButtons] = useState<N8nButton[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [apiDown, setApiDown] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRuns(await actions.runs());
      setApiDown(null);
    } catch (e) {
      setApiDown(String((e as Error).message)); // host down reads as down, never as idle
    }
    if (open) {
      try { setButtons(await actions.loopButtons()); } catch { setButtons([]); }
      try { setSkills(await actions.skills()); } catch { setSkills([]); }
    }
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe read: mount-time poll of the run registry.
    refresh();
  }, [refresh]);
  // 1 s while anything is running (a run settles within a second of finishing), 4 s otherwise; stopped while off screen
  const anyRunning = runs.some((r) => r.status === "running");
  useActiveInterval(refresh, anyRunning ? 1000 : POLL_MS, { catchUp: true });

  return { runs, buttons, skills, apiDown, refresh };
}

export function RunPanel({
  open, onOpenChange, state,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ReturnType<typeof useRunState>;
}) {
  const { runs, buttons, skills, apiDown, refresh } = state;
  const [flash, setFlash] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, label: string) {
    try {
      await fn();
      setFlash(null);
    } catch (e) {
      setFlash(`${label}: ${(e as Error).message}`); // refusals render, loudly
    }
    refresh();
  }

  const latchedRuns = latched(runs);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[560px] !max-w-[560px] overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-4 py-2">
          <SheetTitle className="flex items-baseline gap-2 text-sm">
            <Zap size={14} className="text-primary" /> Runs
            <span className="text-[11px] font-normal text-muted-foreground">
              simulated runs · a failure stays red until someone acknowledges it
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-3 text-[13px]">
          {apiDown ? (
            <div className="rounded-lg border border-[var(--crit)] px-3 py-2 text-[12px] font-semibold text-[var(--crit)]">
              run service unavailable: {apiDown}
            </div>
          ) : null}
          {flash ? (
            <div className="rounded-lg border border-[var(--warn,orange)] px-3 py-2 text-[12px]">{flash}</div>
          ) : null}

          {latchedRuns.length ? (
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-[var(--crit)]">
                <AlertTriangle size={12} /> failures to acknowledge
              </h3>
              {latchedRuns.map((r) => (
                <div key={r.run_id} className="mb-1.5 rounded-lg border border-[var(--crit)]/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <b>{r.label || r.target}</b>
                    <StatusPill status={r.status} />
                    <button
                      className="ml-auto rounded-full border border-border px-2 py-0.5 text-[12px] hover:border-primary hover:text-primary"
                      onClick={() => act(() => actions.ack(r.run_id), "ack")}
                    >
                      acknowledge
                    </button>
                  </div>
                  {r.detail ? <div className="mt-1 text-[11.5px] text-muted-foreground">{r.detail}</div> : null}
                </div>
              ))}
            </section>
          ) : null}

          <section>
            <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Loops
            </h3>
            {buttons.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">
                no loops registered
              </div>
            ) : (
              buttons.map((b) => (
                <div key={b.workflow_id} className="mb-1 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="font-semibold">{b.label}</span>
                  {b.state === "ready" ? (
                    <button
                      aria-label={`Run ${b.label}`}
                      className="ml-auto flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
                      onClick={() => act(() => actions.loopTrigger(b.workflow_id), b.label)}
                    >
                      <Play size={11} /> run
                    </button>
                  ) : (
                    <span className="ml-auto text-[11px] font-bold uppercase text-[var(--crit)]" title={b.detail}>
                      {b.state}
                    </span>
                  )}
                  {b.last_run ? (
                    <span title={`last: ${b.last_run.status}`}>
                      <StatusPill status={b.last_run.status} />
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </section>

          <section>
            <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Playbooks
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {skills.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="ml-auto" />
                  {s.running ? (
                    <Loader2 size={12} className="shrink-0 animate-spin text-primary" />
                  ) : s.runnable ? (
                    <button
                      className="shrink-0 rounded-full border border-border p-1 hover:border-primary hover:text-primary"
                      title={`run ${s.name}`}
                      onClick={() => act(() => actions.runSkill(s.name), s.name)}
                    >
                      <Play size={10} />
                    </button>
                  ) : (
                    <span
                      className="shrink-0 text-[11px] text-muted-foreground"
                      title="view only"
                    >
                      view
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Run history
            </h3>
            {runs.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">no runs yet</div>
            ) : (
              runs.slice(0, 30).map((r) => (
                <div key={r.run_id} className="g-detail mb-1 rounded-lg border border-border px-3 py-1.5 text-[13px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:ring-2 focus-visible:ring-primary"
                      aria-expanded={openRun === r.run_id}
                      onClick={() => setOpenRun(openRun === r.run_id ? null : r.run_id)}
                    >
                      <span className="truncate font-medium">{r.label || r.target}</span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{when(r.started)}</span>
                    </button>
                    <StatusPill status={r.status} started={r.started} estMs={r.est_ms} />
                    {(r.status === "failed" || r.status === "timeout_latched") && !r.acknowledged ? (
                      <button
                        className="rounded-full border border-border px-2 py-0.5 text-[12px] hover:border-primary"
                        onClick={() => act(() => actions.ack(r.run_id), "ack")}
                      >
                        Acknowledge
                      </button>
                    ) : null}
                  </div>
                  {openRun === r.run_id ? (
                    <div className="mt-1.5 border-t border-border/60 pt-1.5 text-[12px] text-[var(--ink2)]">
                      {r.detail ? <p>{r.detail}</p> : null}
                      {r.log_tail ? <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{r.log_tail}</pre> : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
