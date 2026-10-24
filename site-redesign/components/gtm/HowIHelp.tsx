import React, { useEffect, useRef, useState } from "react";
import { Reveal } from "./Primitives";
import { Accent, SectionLabel } from "./TextFx";
import IntegrationMap from "./IntegrationMap";
import Phases from "./Phases";
import { BrandIcon, type BrandId } from "./BrandIcons";
import { useMotionAllowed } from "./lib/useMotion";
import { cx } from "./lib/cx";

/** Sample events: synthetic, shown as such. They illustrate the kind of line the review reads, not real activity. */
const EVENTS: Array<{ brand: BrandId; text: string }> = [
  { brand: "googleads", text: "Google Ads · after-hours lead captured" },
  { brand: "elevenlabs", text: "AI phone line · summary emailed next morning" },
  { brand: "linkedin", text: "LinkedIn · post sent readers to the site" },
];

const CHANNELS: Array<{ name: string; segs: number }> = [
  { name: "Paid media", segs: 10 },
  { name: "Speed to lead", segs: 7 },
  { name: "Content", segs: 5 },
];

/**
 * "How I help you grow": the stack on orbit around GTM OS, three sample events the review reads, and the month's
 * qualified pipeline, then the three steps. One panel, one idea. The event pills cycle every few seconds (one lit, the
 * others dim) and stop when the panel is off screen, under reduced motion, or while the pointer or focus is on them.
 */
export default function HowIHelp() {
  const motion = useMotionAllowed();
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const ticks = useRef(0);
  const panel = useRef<HTMLDivElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setOnScreen(es[0].isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    // one pass through the three events, then rest: the one ambient loop on this panel is the orbit
    if (!motion || hold || !onScreen || ticks.current >= EVENTS.length) return;
    const t = window.setInterval(() => {
      ticks.current += 1;
      setActive((a) => (a + 1) % EVENTS.length);
      if (ticks.current >= EVENTS.length) window.clearInterval(t);
    }, 3200);
    return () => window.clearInterval(t);
  }, [motion, hold, onScreen]);

  return (
    <section id="method" className="g-section g-method" tabIndex={-1} aria-labelledby="g-method-h">
      <div className="g-wrap">
        <div className="g-method-head">
          <Reveal>
            <SectionLabel>Method</SectionLabel>
            <h2 id="g-method-h">
              How I work: <Accent>map, build, tune.</Accent>
            </h2>
          </Reveal>
          <Reveal i={1}>
            <p className="g-lede g-method-lede">
              I trace where your pipeline really comes from, build the systems that capture it, and change the plan every week from what the numbers show. Nothing in it is a black box.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <div className="g-panel-plain g-hairgrid" ref={panel}>
            <div className="g-method-grid">
              <div className="g-method-map">
                <IntegrationMap />
              </div>

              <div className="g-method-mid" onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}>
                <span className="g-bracket g-bracket--top">See what actually made pipeline</span>
                <ul className="g-events" aria-label="Sample events">
                  {EVENTS.map((e, i) => (
                    <li key={e.text} className={cx("g-event", i === active && "is-on")}>
                      <span className="g-event-line" aria-hidden="true" />
                      <span className="g-event-pill">
                        <BrandIcon id={e.brand} size={14} />
                        <span>{e.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <span className="g-bracket g-bracket--bottom">Move the money for next week</span>
                <span className="g-micro g-micro--dim g-sample">Sample events</span>
              </div>

              <div className="g-pipe">
                <div className="g-pipe-head">
                  <span className="g-micro">Where pipeline came from</span>
                  <span className="g-micro g-micro--dim">Last 30 days</span>
                </div>
                <div className="g-seg-total" aria-hidden="true">
                  {Array.from({ length: 22 }, (_, i) => (
                    <i key={i} className={i < 15 ? "on" : ""} />
                  ))}
                </div>
                <ul className="g-chan">
                  {CHANNELS.map((c) => (
                    <li key={c.name}>
                      <span>{c.name}</span>
                      <span className="g-seg" aria-hidden="true">
                        {Array.from({ length: 10 }, (_, i) => (
                          <i key={i} className={i < c.segs ? "on" : ""} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                <span className="g-next">
                  <b>Next</b> Ask approval to move spend
                </span>
                <span className="g-micro g-micro--dim">Sample view, no client data</span>
              </div>
            </div>
          </div>
        </Reveal>

        <Phases />
      </div>
    </section>
  );
}
