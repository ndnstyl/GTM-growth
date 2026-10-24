"use client";

import { scrollWithin } from "@/lib/motion/scroll";
import { NavLink } from "@/lib/motion/nav";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import gtm from "@/lib/demo/gtm.json";
import { areaForStage } from "@/lib/demo/nav";
import statsFile from "@/public/demo/stage_stats.json";
import { StatCount, stagger, useActiveInterval, useReducedMotion } from "@/lib/motion";

type Kind = "agent" | "skill" | "loop" | "automation";
type Item = { kind: Kind; name: string; outcome: string };
type Stage = { name: string; outcome: string; items: Item[] };
type StageStat = { name: string; headline: string; value: string; delta: string; status: "ok" | "watch" | "alert" };

const KIND_STYLE: Record<Kind, { label: string; dot: string; text: string }> = {
  agent: { label: "AI seats", dot: "bg-[#00e5ff]", text: "text-[#00e5ff]" },
  skill: { label: "Playbooks", dot: "bg-[#ff3df5]", text: "text-[#ff3df5]" },
  loop: { label: "Loops", dot: "bg-[#f0b34a]", text: "text-[#f0b34a]" },
  automation: { label: "Always-on", dot: "bg-[#33d6a0]", text: "text-[#33d6a0]" },
};
const KINDS = Object.keys(KIND_STYLE) as Kind[];
const STATUS_RING: Record<string, string> = { ok: "bg-[var(--good)]", watch: "bg-[var(--warn)]", alert: "bg-[var(--crit)]" };

const stages = gtm.stages as Stage[];
const STATS: Record<string, StageStat> = Object.fromEntries((statsFile as { stages: StageStat[] }).stages.map((s) => [s.name, s]));
// Where the travelling beam lights a chevron: after card i when the grid has one (not at a row end).
const hasChev = (i: number) => i < stages.length - 1 && (i + 1) % 5 !== 0;
const BEAM_SEQ: { kind: "card" | "chev"; i: number }[] = stages.flatMap((_, i) => (hasChev(i) ? [{ kind: "card" as const, i }, { kind: "chev" as const, i }] : [{ kind: "card" as const, i }]));
const BEAM_GAP = 44; // steps of rest between sweeps (about 16 s), so an idle cockpit is mostly still
const kinds = gtm.kinds as Record<Kind, string>;

/** The stat headline without the number it repeats ("6 objections tracked" with value "6" -> "objections tracked"). */
function label(st: StageStat): string {
  const h = st.headline.trim();
  return h.startsWith(st.value) ? h.slice(st.value.length).replace(/^[\s,;:]+/, "") : h;
}

/** The hero opens on the stage with the most items, so the first detail panel is full. */
const RICHEST = stages.reduce((best, st, i) => (st.items.length > stages[best].items.length ? i : best), 0);

export function GtmMap() {
  const [sel, setSel] = useState(RICHEST);
  const [filter, setFilter] = useState<Kind | null>(null);
  const stats = STATS;
  const detailRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLOListElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const cardEls = useRef<(HTMLButtonElement | null)[]>([]);
  const chevEls = useRef<(SVGSVGElement | null)[]>([]);
  const liEls = useRef<(HTMLLIElement | null)[]>([]);
  const reduced = useReducedMotion();

  const counts = useMemo(
    () => stages.map((s) => Object.fromEntries(KINDS.map((k) => [k, s.items.filter((i) => i.kind === k).length])) as Record<Kind, number>),
    [],
  );

  // The selection ring: one element that slides between cards (transform only), sized to the card.
  useLayoutEffect(() => {
    const ring = ringRef.current;
    const grid = gridRef.current;
    if (!ring || !grid) return;
    const place = (instant: boolean) => {
      const li = liEls.current[sel];
      if (!li) return;
      if (instant) ring.style.transition = "none";
      ring.style.width = li.offsetWidth + "px";
      ring.style.height = li.offsetHeight + "px";
      ring.style.transform = `translate3d(${li.offsetLeft}px, ${li.offsetTop - 3}px, 16px)`;
      if (instant) {
        void ring.offsetWidth;
        ring.style.transition = "";
      }
      requestAnimationFrame(() => ring.classList.add("ready"));
    };
    place(!ring.classList.contains("ready"));
    const ro = new ResizeObserver(() => place(true));
    ro.observe(grid);
    return () => ro.disconnect();
  }, [sel]);

  // The beam: one timer lights card, chevron, card, chevron down the ten stages, then rests. Class toggles only,
  // no re-render. Stops with the activity gate and never starts under reduced motion.
  const step = useRef(0);
  const lit = useRef<Element | null>(null);
  useActiveInterval(
    () => {
      lit.current?.classList.remove("beam");
      lit.current = null;
      const at = step.current++ % (BEAM_SEQ.length + BEAM_GAP);
      if (at >= BEAM_SEQ.length) return;
      const b = BEAM_SEQ[at];
      const el = b.kind === "card" ? cardEls.current[b.i] : chevEls.current[b.i];
      if (el) {
        el.classList.add("beam");
        lit.current = el;
      }
    },
    360,
    { enabled: !reduced },
  );

  // Pointer tilt: the hovered card leans toward the pointer. Style variables only, written on the card itself.
  const tilt = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
  };
  const tiltOn = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse") e.currentTarget.classList.add("hovering");
  };
  const tiltOff = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    el.classList.remove("hovering");
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  };

  const items = (st: Stage) => st.items.filter((i) => !filter || i.kind === filter);

  const choose = (i: number) => {
    setSel(i);
    window.setTimeout(() => scrollWithin(detailRef.current, !reduced), 30);
  };

  return (
    <div className="flex flex-1 flex-col gap-2 px-1 pb-2 pt-2 xl:min-h-0">
      <div className="g-stage-plane shrink-0">
        <ol ref={gridRef} className="g-stage-grid pointer-events-none relative grid grid-cols-2 gap-2 md:grid-cols-5">
          <span ref={ringRef} className="g-select-ring" aria-hidden="true" />
          {stages.map((s, i) => {
            const on = i === sel;
            const st = stats[s.name];
            const dim = filter && counts[i][filter] === 0;
            return (
              <li key={s.name} ref={(el) => { liEls.current[i] = el; }} className="g-pop pointer-events-none relative [transform-style:preserve-3d]" style={stagger(i)}>
                <button
                  ref={(el) => { cardEls.current[i] = el; }}
                  type="button"
                  onClick={() => choose(i)}
                  onPointerEnter={tiltOn}
                  onPointerMove={tilt}
                  onPointerLeave={tiltOff}
                  aria-pressed={on}
                  className={`g-card3d pointer-events-auto relative flex h-[112px] w-full flex-col overflow-hidden rounded-xl border p-2 text-left focus-visible:ring-2 focus-visible:ring-primary ${
                    on ? "sel border-primary bg-accent" : "recede border-border bg-card hover:border-primary/60"
                  } ${dim ? "opacity-35" : ""}`}
                >
                  <span className="g-glare" aria-hidden="true" />
                  <span className="flex items-center gap-1.5">
                    <span className={`tick flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold transition-colors duration-300 ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-[var(--ink2)]"}`}>{i + 1}</span>
                    <span title={s.name} className="min-w-0 flex-1 line-clamp-2 break-words text-[13px] font-bold leading-tight">{s.name}</span>
                    {st ? <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${STATUS_RING[st.status] ?? STATUS_RING.ok} ${st.status === "ok" ? "" : "g-ping"}`} /> : null}
                  </span>
                  <span className="mt-1 line-clamp-2 min-h-[30px] text-[11px] leading-snug text-[var(--ink2)]">{s.outcome}</span>
                  <span className="mt-auto flex min-h-[18px] min-w-0 items-baseline gap-1.5 overflow-hidden border-t border-border/60 pt-1" title={st ? `${st.value} ${label(st)} ${st.delta}` : undefined}>
                    {st ? (
                      <>
                        <StatCount text={st.value} delay={300 + i * 60} className="tick shrink-0 text-[13px] font-bold text-primary" />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink2)]">{label(st)}</span>
                        {st.delta ? <span className="max-w-[45%] shrink-0 truncate text-[11px] text-muted-foreground">{st.delta}</span> : null}
                      </>
                    ) : null}
                  </span>
                </button>
                {hasChev(i) ? (
                  <ChevronRight ref={(el) => { chevEls.current[i] = el; }} size={12} aria-hidden="true" className="g-chev pointer-events-none absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-primary/70 md:block" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <section ref={detailRef} aria-live="polite" className="flex flex-1 flex-col rounded-xl border border-border bg-card p-3 xl:min-h-[150px] xl:overflow-hidden">
        {/* every stage's detail sits in the same grid cell: the section is as tall as the tallest stage, so choosing a stage
            never moves the strip under it, and the swap is a crossfade in both directions */}
        <div className="grid min-h-0 flex-1 xl:grid-rows-[minmax(0,1fr)]">
          {stages.map((st, si) => {
            const a = areaForStage(st.name);
            const cur = si === sel;
            return (
              <div
                key={st.name}
                inert={!cur}
                aria-hidden={!cur}
                className={`col-start-1 row-start-1 flex min-h-0 flex-col transition-[opacity,transform,visibility] duration-[260ms] ease-[var(--ease-out)] ${
                  cur ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0 [transition-delay:0ms,0ms,260ms]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-[14px] font-bold">
                    <span className="tick mr-1.5 text-primary">{si + 1}.</span>
                    {st.name}
                  </h2>
                  <span className="min-w-0 flex-1 text-[12px] text-[var(--ink2)]">{st.outcome}</span>
                  {a ? (
                    <NavLink href={a.items[0].href} tabIndex={cur ? 0 : -1} className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-primary hover:underline">
                      Open {a.label} <ArrowUpRight size={13} />
                    </NavLink>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by kind">
                  {KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFilter(filter === k ? null : k)}
                      aria-pressed={filter === k}
                      title={kinds[k]}
                      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                        filter === k ? "border-primary bg-accent text-foreground" : "border-border text-[var(--ink2)] hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${KIND_STYLE[k].dot}`} />
                      {KIND_STYLE[k].label} <span className="tick text-muted-foreground">{counts[si][k]}</span>
                    </button>
                  ))}
                </div>
                <ul className="mt-2 grid min-h-0 flex-1 content-start gap-x-4 gap-y-1.5 overflow-y-auto md:grid-cols-2">
                  {items(st).map((it, ii) => (
                    <li key={it.name} className={`flex gap-2 text-[12px] leading-snug ${cur ? "g-fade" : ""}`} style={stagger(Math.min(ii, 10))}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[it.kind].dot}`} title={KIND_STYLE[it.kind].label} />
                      <span>
                        <b className="font-semibold">{it.name}:</b>
                        <span className="text-[var(--ink2)]"> {/^[A-Z][a-z]/.test(it.outcome) ? it.outcome.charAt(0).toLowerCase() + it.outcome.slice(1) : it.outcome}</span>
                      </span>
                    </li>
                  ))}
                  {items(st).length === 0 ? <li className="text-[12px] text-muted-foreground">Nothing of this kind in this stage.</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
