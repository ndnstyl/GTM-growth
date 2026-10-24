import React, { useEffect, useRef } from "react";
import { Reveal, Expander } from "./Primitives";
import { useDialogs } from "./Dialogs";
import { subscribeScroll, clamp, docTop } from "./lib/scrollBus";
import { useMotionAllowed } from "./lib/useMotion";
import { ExternalIcon, SrOnly } from "./Icons";

interface Era {
  no: string;
  title: string;
  sum: string;
  body: (total: number, stages: number) => string;
}

const ERAS: Era[] = [
  {
    no: "01 / Inside the system",
    title: "Twenty years in growth systems that look fine and quietly fail",
    sum: "I am built on pattern recognition, not channels or tactics.",
    body: () => "The team is busy and the reporting is reassuring while the outcomes decay. I start by asking what is actually causal.",
  },
  {
    no: "02 / High-stakes fields",
    title: "Legal, professional services, SaaS and other high-constraint work",
    sum: "Places where being wrong compounds quickly and belief is more dangerous than doing nothing.",
    body: () => "In those rooms I slow the system down, find what drives outcomes, keep what compounds and remove what only looks productive.",
  },
  {
    no: "03 / Diagnose and rebuild",
    title: "Find where the reporting is comforting, then rebuild so performance is explainable",
    sum: "I make the hard calls early, with the economics and the operating plan to back them.",
    body: () =>
      "Some parts work for reasons no one fully understands. Some are protected because they feel validating. Most reporting tells a comforting story. My job is telling which is which. I say no to popular ideas, and when a rebuild is needed I do it deliberately.",
  },
  {
    no: "04 / Orchestration",
    title: "Systems that survive misuse",
    sum: "Automation treated as infrastructure: one responsibility per workflow, failure expected and surfaced.",
    body: () =>
      "I write clear contracts between systems and recovery paths that need no tribal knowledge. If the original builder has to maintain it, it is not finished. Boring systems survive and scale.",
  },
  {
    no: "05 / Now",
    title: "AI infrastructure under the growth work",
    sum: "A full go-to-market stack I run in production, now offered as your fractional CAIO and CTO.",
    body: (t, n) =>
      `${t} systems across ${n} stages: AI seats, playbooks, scheduled loops and always-on systems. I assume things will break. The AI is the engine; hard rules and alarms are the brakes, and I do not ship one without the other.`,
  },
];

export default function Story({ total, stages }: { total: number; stages: number }) {
  const dialogs = useDialogs();
  const motion = useMotionAllowed();
  const tl = useRef<HTMLDivElement | null>(null);
  const eraRefs = useRef<Array<HTMLElement | null>>([]);

  /* each era arrives from depth as it nears the middle of the screen; the spine fills as you read */
  useEffect(() => {
    const root = tl.current;
    if (!root || !motion) return;
    const eras = eraRefs.current.filter(Boolean) as HTMLElement[];
    let tops: number[] = [];
    let heights: number[] = [];
    let rootTop = 0;
    let rootH = 1;
    const last: number[] = eras.map(() => -1);
    let lastSp = -1;
    return subscribeScroll({
      measure() {
        // layout offsets, not rects: the entry transform on each era must not skew where it sits
        tops = eras.map(docTop);
        heights = eras.map((e) => e.offsetHeight);
        rootTop = docTop(root);
        rootH = Math.max(1, root.offsetHeight);
      },
      update(y, vh) {
        eras.forEach((e, i) => {
          const rectTop = tops[i] - y;
          // begins as the card's top reaches the bottom edge, finished by 55% of the viewport
          const p = clamp((vh - rectTop) / (vh * 0.45 + heights[i] * 0.1), 0, 1);
          if (Math.abs(p - last[i]) > 0.005 || p === 1 || p === 0) {
            if (p !== last[i]) e.style.setProperty("--pp", p.toFixed(3));
            last[i] = p;
          }
        });
        const sp = clamp((y + vh * 0.6 - rootTop) / rootH, 0, 1);
        if (Math.abs(sp - lastSp) > 0.002) {
          lastSp = sp;
          root.style.setProperty("--sp", sp.toFixed(3));
        }
      },
    });
  }, [motion]);

  return (
    <section id="story" className="g-section g-story" tabIndex={-1} aria-labelledby="g-story-h">
      <div className="g-wrap">
        <div className="g-story-top">
        <Reveal className="g-sec-head">
          <span className="g-label">My story</span>
          <h2 id="g-story-h">
            Twenty years of growth marketing, <em className="g-accent">now building AI infrastructure under it.</em>
          </h2>
          <p className="g-lede">
            I am brought in when leadership senses something is wrong and cannot say why. My job is to find what is actually causal, keep what compounds and scrap what only looks productive.
          </p>
          <div className="g-principles">
            {["Economic durability", "Decision clarity under uncertainty", "Systems that explain themselves"].map((p) => (
              <span className="g-chip" key={p}>
                <i />
                {p}
              </span>
            ))}
          </div>
        </Reveal>
          <Reveal i={1} className="g-sig-cell">
            <div className="g-glass g-sig g-dotgrid" role="group" aria-label="About Mike Soto">
              <span className="g-logo g-logo--lg" aria-hidden="true" />
              <p className="g-sig-name">Mike Soto</p>
              <p className="g-sig-by">Fractional CAIO and CTO &middot; twenty years in growth &middot; runs the stack above in production</p>
              <p className="g-sig-quote">&ldquo;I am brought in when leadership senses something is wrong and cannot say why.&rdquo;</p>
              <a className="g-btn g-btn--ghost g-btn--sm" href="https://www.linkedin.com/in/michael-soto-7134ba158/" target="_blank" rel="noopener noreferrer">
                See me on LinkedIn <ExternalIcon />
                <SrOnly>(opens in a new tab)</SrOnly>
              </a>
            </div>
          </Reveal>
        </div>
        <div className="g-tl" ref={tl}>
          <div className="g-spine" aria-hidden="true">
            <i />
          </div>
          <ol className="g-eras">
            {ERAS.map((e, i) => (
              <li
                key={e.no}
                className="g-era"
                ref={(el) => {
                  eraRefs.current[i] = el;
                }}
              >
                <div className="g-glass g-card">
                  <span className="g-no">{e.no}</span>
                  <h3>{e.title}</h3>
                  <p className="g-sum g-muted">{e.sum}</p>
                  <Expander id={`g-e${i + 1}`} closedLabel="Read more">
                    <p className="g-muted">{e.body(total, stages)}</p>
                  </Expander>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="g-story-cta">
          <button type="button" className="g-btn g-btn--primary" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
            Book a Call
          </button>
        </div>
      </div>
    </section>
  );
}
