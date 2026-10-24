"use client";

// GTM OS motion system. One place owns three things every animated piece needs:
//   1. reduced motion (the OS setting, live),
//   2. the activity gate (the tab is visible AND the document is on screen inside the hero iframe),
//   3. the small hooks and components built on both (count-up, in-view, active interval).
// Tokens and keyframes live in app/globals.css and match the site's own motion system
// (--dur-fast 150, --dur-base 300, --dur-slow 600, the same three easings).
// Nothing here animates layout: callers only ever move transform, opacity and filter.

import { CSSProperties, createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

const RM_QUERY = "(prefers-reduced-motion: reduce)";

// ---------------------------------------------------------------- reduced motion

function subscribeRM(cb: () => void) {
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** true when the visitor asked for reduced motion. Live: reacts to the OS setting changing mid-session. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeRM, () => window.matchMedia(RM_QUERY).matches, () => false);
}

export const reducedMotionNow = (): boolean => typeof window !== "undefined" && window.matchMedia(RM_QUERY).matches;

// ---------------------------------------------------------------- activity gate

let docVisible = true;
let onScreen = true;
let frameLive = true;
let hostVisible = true;
let active = true;
let started = false;
const listeners = new Set<() => void>();

function recompute() {
  const next = docVisible && onScreen && frameLive && hostVisible;
  if (next === active) return;
  active = next;
  document.documentElement.classList.toggle("g-paused", !next);
  listeners.forEach((l) => l());
}

/**
 * Starts the gate once. `active` is false while the tab is hidden or while the document is scrolled
 * out of view (the hero iframe sitting below the fold). While inactive the root carries `g-paused`,
 * which freezes every CSS animation, and every JS loop built on useActive() stops.
 */
export function startActivityGate(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  docVisible = document.visibilityState === "visible";
  document.addEventListener("visibilitychange", () => {
    docVisible = document.visibilityState === "visible";
    recompute();
  });
  if (typeof IntersectionObserver !== "undefined") {
    // Assume off screen until the observer says otherwise: a frame scrolled far out of view is throttled and may never
    // deliver its first report, and "never reported" must read as not visible. A visible page reports within a frame.
    onScreen = false;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        onScreen = e.isIntersecting && e.intersectionRatio > 0;
        recompute();
      },
      { threshold: [0, 0.01, 0.1] },
    );
    io.observe(document.documentElement);
  }
  // The embedding page knows best whether the frame is on screen. It can post { gtmOs: "visibility", visible: boolean }
  // to this window (the site's CockpitFrame does, from its own observer); that wins over every inference below.
  window.addEventListener("message", (e) => {
    // Only the embedding page may pause the demo: not another frame, not an opener, not a foreign origin.
    if (e.source !== window.parent) return;
    const d = e.data as { gtmOs?: string; visible?: unknown } | null;
    if (!d || d.gtmOs !== "visibility" || typeof d.visible !== "boolean") return;
    hostVisible = d.visible;
    recompute();
  });
  // Escape with nothing of ours open belongs to the host page (it may close the frame's lightbox).
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || window.parent === window) return;
    if (document.querySelector('[role="dialog"], [data-state="open"][role="menu"]')) return;
    window.parent.postMessage({ gtmOs: "escape" }, "*");
  });
  // Liveness probe. A cross-origin iframe scrolled far off screen is throttled by the browser: it gets no animation
  // frames and no intersection updates, so the observer above never reports it left. Once a second ask for one frame;
  // if none arrives within 400 ms the demo is not being drawn and counts as off screen. A pending request fires the
  // moment the frame is drawn again, which flips it back at once. One timer and one callback a second.
  window.setInterval(() => {
    if (!docVisible) return;
    let fired = false;
    window.requestAnimationFrame(() => {
      fired = true;
      if (!frameLive) {
        frameLive = true;
        recompute();
      }
    });
    window.setTimeout(() => {
      if (!fired && frameLive) {
        frameLive = false;
        recompute();
      }
    }, 400);
  }, 1000);
  recompute();
}

function subscribeActive(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** true while the demo is on screen and the tab is visible. */
export function useActive(): boolean {
  return useSyncExternalStore(subscribeActive, () => active, () => true);
}

export const activeNow = (): boolean => active;

/**
 * setInterval that only ticks while the demo is active and `enabled`. On resume it can fire once
 * straight away (`catchUp`) so clocks and polls re-sync instead of waiting a full period.
 */
export function useActiveInterval(fn: () => void, ms: number, opts: { enabled?: boolean; catchUp?: boolean } = {}) {
  const { enabled = true, catchUp = false } = opts;
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  const isActive = useActive();
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (!enabled || !isActive) {
      wasActive.current = isActive;
      return;
    }
    if (catchUp && !wasActive.current) ref.current();
    wasActive.current = true;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled, isActive, catchUp]);
}

// ---------------------------------------------------------------- in view

/**
 * A SettleGate (components/shell/SettleGate.tsx) keeps its content hidden behind a skeleton until the content stops
 * changing. Anything that animates "the first time it is seen" must wait for the gate to open, or its entrance would
 * play behind the skeleton. Outside a gate the value is true.
 */
export const GateContext = createContext(true);

/** true once the element has been on screen. Adds nothing to the DOM; pair with a `.in` class. */
export function useSeen<T extends Element>(margin = "0px"): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  const gateOpen = useContext(GateContext);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || !gateOpen) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no observer in this browser, so the element counts as seen at once.
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, seen, gateOpen]);
  return [ref, seen];
}

/** Style helper for the stagger index every `.g-rise` / `.g-grow-*` class reads as `--i`. */
export const stagger = (i: number): CSSProperties => ({ ["--i" as string]: i }) as CSSProperties;

// ---------------------------------------------------------------- count up

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

type CountProps = {
  value: number;
  /** Formats one frame's value. Called with the final value for the width sizer. */
  format: (v: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
};

/**
 * A number that counts up the first time it is seen and glides to any later value with a brief highlight.
 * The final text is always in the DOM (invisible sizer, so the width never moves and screen readers read
 * the real number); the animated layer sits on top of it. With reduced motion the sizer is simply shown.
 */
export function CountUp({ value, format, duration = 800, delay = 0, className = "" }: CountProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const shown = useRef(0);
  const played = useRef(false);
  const lastValue = useRef(value);
  const [seenRef, seen] = useSeen<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const isActive = useActive();
  const [startText] = useState(() => format(0));
  const finalText = format(value);

  const setRefs = useCallback(
    (el: HTMLSpanElement | null) => {
      rootRef.current = el;
      seenRef.current = el;
    },
    [seenRef],
  );

  useEffect(() => {
    const el = liveRef.current;
    if (!el) return;
    if (reduced) {
      el.textContent = finalText;
      shown.current = value;
      lastValue.current = value;
      return;
    }
    if (!seen || !isActive) return;
    const changed = played.current && lastValue.current !== value;
    lastValue.current = value;
    const from = played.current ? shown.current : 0;
    const dur = played.current ? Math.min(600, duration) : duration;
    const wait = played.current ? 0 : delay;
    if (changed && rootRef.current) {
      const r = rootRef.current;
      r.classList.remove("g-bump");
      void r.offsetWidth;
      r.classList.add("g-bump");
    }
    played.current = true;
    let raf = 0;
    const t0 = performance.now() + wait;
    const tick = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / dur));
      const v = from + (value - from) * easeOutCubic(p);
      shown.current = v;
      el.textContent = p >= 1 ? finalText : format(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // format is a pure formatter of a number; re-running on identity change would restart the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, seen, isActive, reduced, duration, delay, finalText]);

  return (
    <span ref={setRefs} className={`g-count ${className}`}>
      <span className="g-count-final">{finalText}</span>
      <span ref={liveRef} className="g-count-live" aria-hidden="true">
        {startText}
      </span>
    </span>
  );
}

/** Splits "$47.3k", "32", "1,018", "4.4x" into prefix, number, suffix so a stat string can count up. */
export function parseStat(s: string): { prefix: string; num: number; decimals: number; suffix: string; grouped: boolean } | null {
  const m = s.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return null;
  const raw = m[2];
  const num = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { prefix: m[1], num, decimals, suffix: m[3], grouped: raw.includes(",") };
}

export function formatStat(p: NonNullable<ReturnType<typeof parseStat>>, v: number): string {
  const body = p.decimals ? v.toFixed(p.decimals) : Math.round(v).toString();
  const out = p.grouped ? Number(body).toLocaleString("en-US", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals }) : body;
  return p.prefix + out + p.suffix;
}

/** A stat string ("$47.3k", "6", "89%") that counts up when it parses as a number and renders as text when it does not. */
export function StatCount({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  const p = parseStat(text);
  if (!p) return <span className={className}>{text}</span>;
  return <CountUp className={className} value={p.num} format={(v) => formatStat(p, v)} delay={delay} duration={700} />;
}

// ---------------------------------------------------------------- tiny deterministic random

/** mulberry32: seeded, so the synthetic live feed plays the same story every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** false during the prerender and hydration, true after mount. For anything that reads the clock. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
