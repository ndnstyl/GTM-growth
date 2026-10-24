import React, { useEffect, useRef, useState } from "react";
import { Reveal } from "./Primitives";
import { useMotionAllowed } from "./lib/useMotion";

const CODE: Array<Array<[string, "k" | "f" | "s" | "p" | "c"]>> = [
  [["def ", "k"], ["tune", "f"], ["(week):", "p"]],
  [["    pipe = ", "p"], ["read", "f"], ["(", "p"], ["\"qualified\"", "s"], [")", "p"]],
  [["    best = ", "p"], ["rank", "f"], ["(pipe.channels)", "p"]],
  [["    plan = ", "p"], ["propose", "f"], ["(budget, ", "p"], ["to", "k"], ["=best)", "p"]],
  [["    ", "p"], ["ask_approval", "f"], ["(plan, ", "p"], ["why", "k"], ["=", "p"], ["True", "k"], [")", "p"]],
];
const CODE_LEN = CODE.reduce((n, l) => n + l.reduce((m, t) => m + t[0].length, 0), 0);

function useOn<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setOn(es[0].isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on] as const;
}

/** Map: three steps light in turn. */
function MapUi({ on }: { on: boolean }) {
  return (
    <div className={`g-ui g-ui-map${on ? " on" : ""}`} aria-hidden="true">
      {["Ad click", "Call answered", "Lead in CRM"].map((s, i) => (
        <div key={s} className="g-step" style={{ ["--k" as string]: i } as React.CSSProperties}>
          <i />
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}

/** Build: a hub with lines out to four connected parts; a pulse runs along each. The tool logos live only in the orbit map. */
function BuildUi({ on }: { on: boolean }) {
  return (
    <div className={`g-ui g-ui-build${on ? " on" : ""}`} aria-hidden="true">
      <div className="g-hub">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M12 2.5l8 4.5v10l-8 4.5-8-4.5V7z" />
          <path d="M4 7l8 4.5L20 7M12 11.5v10" />
        </svg>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="g-spoke" style={{ ["--a" as string]: `${i * 90 + 45}deg`, ["--k" as string]: i } as React.CSSProperties}>
          <span className="g-spoke-line" />
          <span className="g-spoke-dot" />
          <span className="g-spoke-ico" />
        </span>
      ))}
    </div>
  );
}

/** Tune: a code panel that types itself line by line with a blinking caret. The whole panel's size is reserved. */
function TuneUi({ on }: { on: boolean }) {
  const motion = useMotionAllowed();
  const [n, setN] = useState(CODE_LEN);
  const started = useRef(false);
  useEffect(() => {
    if (!motion) {
      setN(CODE_LEN);
      return;
    }
    if (!on || started.current) return;
    started.current = true; // typed once, then it rests on the finished code
    let i = 0;
    setN(0);
    const t = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= CODE_LEN) window.clearInterval(t);
    }, 42);
  }, [on, motion]);
  let left = Math.max(0, n);
  const lens = CODE.map((l) => l.reduce((m, t) => m + t[0].length, 0));
  let cum = 0;
  let caretAt = lens.length - 1;
  for (let k = 0; k < lens.length; k++) {
    cum += lens[k];
    if (n < cum) {
      caretAt = k;
      break;
    }
  }
  return (
    <div className="g-ui g-ui-tune" aria-hidden="true">
      <pre>
        {CODE.map((line, li) => {
          const parts = line.map(([txt, kind], ti) => {
            const show = Math.min(left, txt.length);
            left -= show;
            return (
              <span key={ti} className={`c-${kind}`}>
                {txt.slice(0, show)}
                <span className="g-hide">{txt.slice(show)}</span>
              </span>
            );
          });
          return (
            <span key={li} className="g-codeline">
              {parts}
              {li === caretAt ? <span className="g-caret" /> : null}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

const CARDS = [
  { no: "01", title: "Map", text: "I trace where pipeline comes from, step by step, before anything is built.", ui: MapUi },
  { no: "02", title: "Build", text: "I connect the tools you already pay for into one running system.", ui: BuildUi },
  { no: "03", title: "Tune", text: "Each week I read the numbers and propose the next move. You get the reasons in writing.", ui: TuneUi },
] as const;

export default function Phases() {
  return (
    <div className="g-phases">
      <ol className="g-phase-grid">
        {CARDS.map((c, i) => {
          const Ui = c.ui;
          return (
            <PhaseCard key={c.no} i={i} no={c.no} title={c.title} text={c.text}>
              {(on: boolean) => <Ui on={on} />}
            </PhaseCard>
          );
        })}
      </ol>
    </div>
  );
}

function PhaseCard({ i, no, title, text, children }: { i: number; no: string; title: string; text: string; children: (on: boolean) => React.ReactNode }) {
  const [ref, on] = useOn<HTMLLIElement>();
  return (
    <li ref={ref} className="g-phase g-hairgrid-top">
      <Reveal i={i} className="g-phase-in">
        <div className="g-phase-ui">{children(on)}</div>
        <span className="g-micro">
          {no}
        </span>
        <h3>{title}</h3>
        <p className="g-muted">{text}</p>
      </Reveal>
    </li>
  );
}
