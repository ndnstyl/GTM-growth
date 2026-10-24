import React, { useCallback, useEffect, useRef, useState } from "react";
import CockpitPoster from "./CockpitPoster";
import { ExpandIcon } from "./Icons";
import { useDialogs } from "./Dialogs";
import { cx } from "./lib/cx";

export const DEMO_PATH = "/gtm-os/";
/** The app is laid out for a 1440px screen; on wider-than-phone frames it is drawn at that width and scaled to fit. */
const DESIGN_WIDTH = 1440;
const DESIGN_RATIO = 10 / 16;
type State = "waiting" | "probing" | "loading" | "ready" | "offline" | "paused";

/** One answer per page view: is the demo app deployed on this origin? A same-origin one-byte GET, nothing third-party. */
let probeCache: Promise<boolean> | null = null;
function probe(force = false): Promise<boolean> {
  if (!probeCache || force) {
    probeCache = fetch(DEMO_PATH, { method: "GET", headers: { Range: "bytes=0-0" }, cache: "no-store" })
      .then((r) => r.ok)
      .catch(() => false);
  }
  return probeCache;
}

const BADGE: Record<State, { text: string; tone: "ok" | "warn" | "bad" | "idle" }> = {
  waiting: { text: "standby", tone: "idle" },
  probing: { text: "connecting", tone: "warn" },
  loading: { text: "connecting", tone: "warn" },
  ready: { text: "live", tone: "ok" },
  offline: { text: "offline", tone: "bad" },
  paused: { text: "paused", tone: "idle" },
};

interface Props {
  variant: "inline" | "dialog";
  /** start loading when true (inline: scrolled into view and allowed to move; dialog: opened by the visitor) */
  start: boolean;
  /** reduced motion or data saver: wait for an explicit click before loading */
  requireClick?: boolean;
}

export default function CockpitFrame({ variant, start, requireClick = false }: Props) {
  const dialogs = useDialogs();
  const isDialog = variant === "dialog";
  const [state, setState] = useState<State>("waiting");
  const [slow, setSlow] = useState(false);
  const [armed, setArmed] = useState(false);
  const [fit, setFit] = useState<{ scale: number; h: number } | null>(null);
  const timer = useRef(0);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // while the full-screen demo is open the inline copy is unloaded, so only one engine runs at a time
  const suspended = !isDialog && dialogs.current?.name === "gtmos";

  const begin = useCallback((force = false) => {
    setState("probing");
    setSlow(false);
    probe(force).then((ok) => {
      if (!ok) {
        setState("offline");
        return;
      }
      setState("loading");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSlow(true), 6000);
    });
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (state !== "waiting" && state !== "paused") return;
    if (requireClick && !armed) {
      if (start) setState("paused");
      return;
    }
    if (start) begin();
  }, [start, requireClick, armed, state, begin]);

  // coming back from the full-screen demo: load the inline copy again
  const wasSuspended = useRef(false);
  useEffect(() => {
    if (wasSuspended.current && !suspended && state === "ready") setState("loading");
    wasSuspended.current = suspended;
  }, [suspended, state]);

  // the inline frame is a preview: no tab stops, no touches, no scroll trap. Only the full-screen demo is interactive.
  useEffect(() => {
    const f = frameRef.current;
    if (!f) return;
    if (isDialog) f.removeAttribute("inert");
    else f.setAttribute("inert", "");
  });

  // draw the app at its own width and scale it to the frame (not on phones, where the app's phone layout fills it)
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 700) setFit({ scale: w / DESIGN_WIDTH, h: el.clientHeight || Math.round(w * DESIGN_RATIO) });
      else setFit(null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape inside the frame never reaches the page: hand it up so the dialog still closes
  const onFrameLoad = () => {
    window.clearTimeout(timer.current);
    setState("ready");
    if (!isDialog) return;
    try {
      frameRef.current?.contentWindow?.addEventListener("keydown", (e) => {
        if (e.key === "Escape") dialogs.close();
      });
    } catch (err) {
      /* a cross-origin frame cannot be listened to; the Close button after the frame is the way out */
    }
  };

  const badge = BADGE[state];
  const showFrame = (state === "loading" || state === "ready") && !suspended;
  const frameStyle: React.CSSProperties | undefined = fit
    ? { width: DESIGN_WIDTH, height: Math.round(fit.h / fit.scale), transform: `scale(${fit.scale})`, transformOrigin: "0 0" }
    : undefined;

  return (
    <div className={cx("g-frame", isDialog && "g-frame--xl")} role="group" aria-label="GTM OS live demo">
      <div className="g-fbar">
        <i />
        <i />
        <i />
        <span className="g-url">
          <span className="g-url-long">gtm-os / cockpit</span>
          <span className="g-url-short">gtm-os</span>
        </span>
        <span className={cx("g-live", `is-${badge.tone}`)} role="status" aria-live="polite">
          <b aria-hidden="true" />
          {badge.text}
        </span>
        {!isDialog ? (
          <button type="button" className="g-expand" aria-label="Open the live demo full screen" onClick={(e) => dialogs.open("gtmos", null, e.currentTarget)}>
            <ExpandIcon />
          </button>
        ) : null}
      </div>
      <div className="g-mount" data-state={state} ref={mountRef}>
        <CockpitPoster />
        {showFrame ? (
          <iframe
            ref={frameRef}
            title="GTM OS live demo"
            src={DEMO_PATH}
            tabIndex={isDialog ? 0 : -1}
            className={cx(state === "ready" && "is-ready")}
            style={frameStyle}
            onLoad={onFrameLoad}
          />
        ) : null}
        {!isDialog && state === "ready" && !suspended ? (
          <button
            type="button"
            className="g-explore"
            tabIndex={-1}
            aria-hidden="true"
            onClick={(e) => dialogs.open("gtmos", null, e.currentTarget)}
          >
            <span>
              <span className="g-explore-touch">Tap to explore</span>
              <span className="g-explore-mouse">Click to explore</span>
            </span>
          </button>
        ) : null}
        {state !== "ready" ? (
          <div className="g-mount-msg">
            <div className="g-msg-card">
              {state === "offline" ? (
                <>
                  <b>The live demo is not reachable right now.</b>
                  <span>Reload to try again, or book a call and I will walk you through it.</span>
                  <span className="g-mount-actions">
                    <button type="button" className="g-btn g-btn--ghost g-btn--sm" onClick={() => begin(true)}>
                      Try again
                    </button>
                    <button type="button" className="g-btn g-btn--primary g-btn--sm" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
                      Book a Call
                    </button>
                  </span>
                </>
              ) : state === "paused" ? (
                <>
                  <b>GTM OS, the cockpit on sample data.</b>
                  <span>The demo waits for you, so nothing loads until you ask.</span>
                  <button type="button" className="g-btn g-btn--primary g-btn--sm" onClick={() => setArmed(true)}>
                    Load the live demo
                  </button>
                </>
              ) : (
                <>
                  <b>{isDialog ? "GTM OS, full screen." : "GTM OS, the cockpit on sample data."}</b>
                  <span>
                    {isDialog
                      ? "Loading the live demo."
                      : slow
                        ? "Still loading. If nothing appears, reload the page."
                        : "Loading the live demo. If nothing appears in a few seconds, reload the page."}
                  </span>
                  <span className="g-bar-load" aria-hidden="true" />
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
