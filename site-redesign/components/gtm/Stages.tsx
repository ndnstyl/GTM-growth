import { Accent, SectionLabel } from "./TextFx";
import React, { useEffect, useRef, useState } from "react";
import { Reveal } from "./Primitives";
import { useDialogs } from "./Dialogs";
import { subscribeScroll, clamp, docTop } from "./lib/scrollBus";
import { useMediaQuery, useMotionAllowed } from "./lib/useMotion";
import { cx } from "./lib/cx";
import { useStats } from "./lib/stats";
import { useInView } from "./lib/useReveal";
import type { GtmHomeData, Kind, Stage } from "./types";
import StackMap from "./StackMap";

const PLURAL: Record<Kind, string> = { agent: "agents", playbook: "playbooks", loop: "loops", automation: "automations" };
const SINGLE: Record<Kind, string> = { agent: "an agent", playbook: "a playbook", loop: "a loop", automation: "an automation" };
const two = (n: number) => String(n + 1).padStart(2, "0");

export function stageMeta(s: Stage): string {
  const c: Partial<Record<Kind, number>> = {};
  s.items.forEach((i) => (c[i.kind] = (c[i.kind] || 0) + 1));
  const kinds = Object.keys(c) as Kind[];
  if (s.items.length === 1) return `1 system: ${SINGLE[kinds[0]]}`;
  return `${s.items.length} systems: ${kinds.map((k) => `${c[k]} ${c[k] === 1 ? k : PLURAL[k]}`).join(", ")}`;
}

export default function Stages({ data, children }: { data: GtmHomeData; children?: React.ReactNode }) {
  const { stages } = data;
  const N = stages.length;
  const { StageWord, stageWord } = useStats();
  const dialogs = useDialogs();
  const motion = useMotionAllowed();
  // the layout itself is decided in CSS (so the server render and the hydrated page are the same height);
  // these only decide whether the script drives the sequence
  const wide = useMediaQuery("(min-width: 701px) and (min-height: 600px)");
  const phone = useMediaQuery("(max-width: 700px)");
  const scrub = motion && (wide || phone);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [cur, setCur] = useState(0);
  const secRef = useInView<HTMLElement>("120px");

  /* scroll scrub: one measured read, one write per frame, state only when the stage actually changes */
  useEffect(() => {
    if (!scrub) return;
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    const rail = railRef.current;
    if (!wrap || !stage || !rail) return;
    let top = 0;
    let run = 1;
    let hh = 76;
    let tw = 0;
    let lastP = -1;
    let idx = 0;
    const rows = phone ? Array.from(wrap.querySelectorAll<HTMLElement>(".g-cells--out .g-cell")) : [];
    let rowTops: number[] = [];
    let rowEnd = 0;
    return subscribeScroll({
      measure() {
        if (phone) {
          rowTops = rows.map(docTop);
          const last = rows[rows.length - 1];
          rowEnd = last ? docTop(last) + last.offsetHeight : 0;
        }
        top = wrap.getBoundingClientRect().top + window.scrollY;
        run = Math.max(1, wrap.offsetHeight - stage.offsetHeight);
        hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--g-hh")) || 76;
        const track = rail.querySelector<HTMLElement>(".g-track");
        tw = track ? track.offsetWidth : 0;
        rail.style.setProperty("--tw", String(tw));
      },
      update(y) {
        if (phone) {
          // phones: the list scrolls under the pinned strip, and the strip follows the row passing beneath it
          const line = y + hh + stage.offsetHeight + 8;
          let n = 0;
          rowTops.forEach((t, k) => {
            if (t <= line) n = k;
          });
          const pp = clamp((line - rowTops[0]) / Math.max(1, rowEnd - rowTops[0]), 0, 1);
          if (Math.abs(pp - lastP) > 0.002) {
            lastP = pp;
            rail.style.setProperty("--p", pp.toFixed(4));
          }
          if (n !== idx) {
            idx = n;
            setCur(n);
          }
          return;
        }
        const p = clamp((y + hh - top) / run, 0, 1);
        if (Math.abs(p - lastP) > 0.002) {
          lastP = p;
          rail.style.setProperty("--p", p.toFixed(4));
        }
        const i = Math.min(N - 1, Math.floor(p * N));
        if (i !== idx) {
          idx = i;
          setCur(i);
        }
      },
    });
  }, [scrub, phone, N]);

  const jump = (i: number) => {
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;
    const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--g-hh")) || 76;
    const run = wrap.offsetHeight - stage.offsetHeight;
    const y = window.scrollY + wrap.getBoundingClientRect().top - hh + run * ((i + 0.5) / N);
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  const open = (i: number, e: React.MouseEvent<HTMLElement>) => dialogs.open("folder", { index: i }, e.currentTarget);

  const cells = (className: string) => (
    <ol className={cx("g-cells", className)}>
      {stages.map((s, i) => (
        <li key={s.name}>
          <button type="button" className={cx("g-cell", scrub && i === cur && "on")} aria-haspopup="dialog" onClick={(e) => open(i, e)}>
            <span className="g-num">{two(i)}</span>
            <span className="g-sr">, </span>
            <span className="g-cname">{s.name}</span>
            <span className="g-cout">{s.outcome}</span>
            {s.items.length > 1 ? (
              <>
                <span className="g-sr">, </span>
                <span className="g-ccount">{s.items.length} systems</span>
              </>
            ) : null}
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <section id="stages" className="g-section g-stages" tabIndex={-1} aria-labelledby="g-stages-h" ref={secRef}>
      <div className="g-wrap">
        <Reveal className="g-sec-head">
          <SectionLabel>{`The ${stageWord} stages`}</SectionLabel>
          <h2 id="g-stages-h">
            {StageWord} stages, <Accent>first touch to final report.</Accent>
          </h2>
          <p className="g-lede">Scroll through the stages, or open one to see the systems inside it.</p>
        </Reveal>

        <div className="g-scrub" ref={wrapRef} style={{ ["--n" as string]: N } as React.CSSProperties}>
          <div className="g-stage" ref={stageRef}>
            <div className="g-rail" ref={railRef} role="group" aria-label="Jump to a stage" aria-hidden={phone ? true : undefined}>
              <div className="g-track">
                <div className="g-fill" />
                <div className="g-beam" />
                <div className="g-pulse" />
              </div>
              <div className="g-nodes">
                {stages.map((s, i) => (
                  <button
                    key={s.name}
                    type="button"
                    className={cx("g-node", scrub && i === cur && "on", scrub && i < cur && "done")}
                    aria-label={`${two(i)} ${s.name}, stage ${i + 1} of ${N}`}
                    aria-current={scrub && i === cur ? "step" : undefined}
                    tabIndex={phone ? -1 : undefined}
                    onClick={() => jump(i)}
                  >
                    <span>{two(i)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="g-scrub-grid">
              <div className="g-glass g-active">
                {stages.map((s, i) => (
                  <div key={s.name} className={cx("g-ac", scrub && i === cur && "on", !scrub && i === 0 && "on")} aria-hidden={scrub && i === cur ? undefined : true}>
                    <span className="g-big">{two(i)}</span>
                    <p className="g-ac-title">{s.name}</p>
                    <p className="g-muted">{s.outcome}</p>
                    <span className="g-meta">{stageMeta(s)}</span>
                    <ul className="g-ac-sys" aria-label={`Systems in ${s.name}`}>
                      {s.items.slice(0, 5).map((it) => (
                        <li key={it.name}>{it.name}</li>
                      ))}
                      {s.items.length > 5 ? <li className="g-ac-more">{`and ${s.items.length - 5} more`}</li> : null}
                    </ul>
                    <button type="button" className="g-btn g-btn--primary g-btn--sm" aria-haspopup="dialog" onClick={(e) => open(i, e)} tabIndex={-1}>
                      Open this stage
                    </button>
                  </div>
                ))}
              </div>
              {cells("g-cells--in")}
            </div>
          </div>
          {/* phones: the list lives inside the sequence, so its rows scroll under the pinned strip */}
          {cells("g-cells--out")}
        </div>
        {/* phones: the list sits under the short sticky strip instead of inside it */}
        <Reveal className="g-stack-x">
          <StackMap data={data} />
        </Reveal>
        {children}
      </div>
    </section>
  );
}
