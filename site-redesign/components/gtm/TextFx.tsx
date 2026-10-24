import React, { useEffect, useRef, useState } from "react";
import { cx } from "./lib/cx";
import { useMotionAllowed } from "./lib/useMotion";

/*
 * Text effects, written for this site in the spirit of React Bits (reactbits.dev): Tech Text, TextType, ShinyText, and an
 * original shatter-and-snap-back effect. All are DOM text, so the words are always selectable and read aloud once: the
 * letters are aria-hidden and a visually hidden copy carries the sentence. The final width is reserved from the first
 * paint (letters are hidden with opacity, never removed), so nothing shifts. Each plays once when it enters view, and
 * under reduced motion (no `g-motion` class) none of it runs and the text simply sits there.
 */

/** one observer per call: fires `cb` once when the element is mostly in view */
function useOnceInView<T extends HTMLElement>(cb: () => void, threshold = 0) {
  const ref = useRef<T | null>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es[0].isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();
        cb();
      },
      { threshold, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

/**
 * Tech Text: each letter is picked out in turn, drawn first as a dashed outline inside a dashed selection frame, then
 * filled, left to right. Plays once on entering view.
 */
export function TechText({ text, gradient, className, as: Tag = "span", speed = 1 }: { text: string; gradient?: boolean; className?: string; as?: any; speed?: number }) {
  const motion = useMotionAllowed();
  const total = Array.from(text.replace(/ /g, "")).length;
  const [idx, setIdx] = useState(-1);
  const timer = useRef(0);
  const ref = useOnceInView<HTMLElement>(() => {
    if (!document.documentElement.classList.contains("g-motion")) {
      setIdx(total);
      return;
    }
    const step = Math.min(70, 1000 / Math.max(total, 1)) / speed;
    let i = 0;
    setIdx(0);
    timer.current = window.setInterval(() => {
      i += 1;
      setIdx(i);
      if (i >= total) window.clearInterval(timer.current);
    }, step);
  });
  useEffect(() => () => window.clearInterval(timer.current), []);
  useEffect(() => {
    if (!motion) setIdx(total);
  }, [motion, total]);
  return (
    <Tag ref={ref} className={cx("g-tt", idx >= 0 && "go", idx >= total && "done", className)} style={{ ["--tt-idx" as string]: idx } as React.CSSProperties}>
      {/* plain text in the HTML and until the label reaches the screen; the letters take over only to type it in */}
      {idx < 0 || idx >= total ? (
        text
      ) : (
        <>
          <span className="g-sr">{text}</span>
          <TechLetters text={text} gradient={gradient} idx={idx} />
        </>
      )}
    </Tag>
  );
}

function TechLetters({ text, gradient, idx }: { text: string; gradient?: boolean; idx: number }) {
  const words = text.split(" ");
  let n = 0;
  return (
    <>
      {words.map((w, wi) => (
        <React.Fragment key={wi}>
          <span className="g-lw" aria-hidden="true">
            {Array.from(w).map((c, ci) => {
              const i = n++;
              const state = idx < 0 ? "" : i < idx ? "on" : i === idx ? "sel" : "off";
              return (
                <span key={ci} className={cx("g-lt", gradient && "g-gw", state && `tt-${state}`)} data-c={c}>
                  {c}
                </span>
              );
            })}
          </span>
          {wi < words.length - 1 ? " " : ""}
        </React.Fragment>
      ))}
    </>
  );
}

/** The mono bracket label above a section heading, typed out once on entering view. */
export function SectionLabel({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cx("g-label", className)}>
      <TechText text={children} speed={1.4} />
    </span>
  );
}

/** The accent words of a heading: plain italic in the accent colour. (No sweep, no typing: one text effect on the page.) */
export function Accent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <em className={cx("g-accent", className)}>{children}</em>;
}
