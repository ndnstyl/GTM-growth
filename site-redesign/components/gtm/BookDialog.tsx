import React, { useEffect, useRef, useState } from "react";
import { Dialog, Sheet, useDialogs } from "./Dialogs";
import { CALENDLY_URL } from "./types";
import { ExternalIcon, SrOnly } from "./Icons";
import { useTheme } from "./lib/useTheme";
import { trackBooking } from "./lib/track";
import { cx } from "./lib/cx";

type Phase = "choose" | "loading" | "ready" | "failed";
/** Only the fallback for a frame that never loads and never errors; a blocker or outage fails sooner, on the network error. */
const LOAD_DEADLINE_MS = 15000;
const MESSAGE_GRACE_MS = 5000;
const CALENDLY_ORIGIN = "https://calendly.com";

/**
 * Booking. Nothing from Calendly loads until the visitor asks. Two clear actions: open the calendar in a new tab
 * (no embed at all), or load it here after a one-line notice.
 *
 * Ready means Calendly's own page has said so: its first `calendly.*` message (page height, event type viewed). A frame
 * fires `load` even for the browser's error page or a vendor 503, so `load` alone proves nothing. If the frame loads and
 * no message follows within a few seconds, or the network probe fails, the visitor sees the failure message (announced
 * as such), never a blank sheet and never "loaded". The sheet is one size from the moment it opens, so nothing jumps.
 * The sandbox keeps Calendly's own frames from running outside it, so they log blocked-script lines after the opt-in.
 * That is the sandbox working, and it is a recorded decision, not a defect.
 */
function BookBody() {
  const [theme] = useTheme();
  const [phase, setPhase] = useState<Phase>("choose");
  const [src, setSrc] = useState("");
  const [announce, setAnnounce] = useState("");
  const timer = useRef(0);
  const calRef = useRef<HTMLDivElement | null>(null);
  const probeOk = useRef<boolean | null>(null);
  const loaded = useRef(false);
  const phaseRef = useRef<Phase>("choose");
  phaseRef.current = phase;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (phase === "choose") return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== CALENDLY_ORIGIN) return;
      const d: any = e.data;
      if (!d || typeof d.event !== "string" || !d.event.startsWith("calendly.")) return;
      if (d.event === "calendly.event_scheduled") trackBooking("scheduled");
      if (phaseRef.current === "loading") settle("ready");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [phase]);

  const settle = (next: Phase) => {
    window.clearTimeout(timer.current);
    phaseRef.current = next;
    setPhase(next);
    setAnnounce(next === "ready" ? "Calendar loaded." : next === "failed" ? "The calendar did not load. Open it in a new tab." : "");
    window.setTimeout(() => calRef.current?.focus({ preventScroll: true }), 0);
  };

  const load = () => {
    trackBooking("load_calendar");
    const q =
      theme === "light"
        ? "background_color=ffffff&text_color=0b0e22&primary_color=00677d"
        : "background_color=12132a&text_color=f4f5fb&primary_color=00e5ff";
    probeOk.current = null;
    loaded.current = false;
    setSrc(
      `${CALENDLY_URL}?embed_domain=${encodeURIComponent(window.location.hostname)}&embed_type=Inline&hide_gdpr_banner=1&hide_event_type_details=0&${q}`,
    );
    setPhase("loading");
    window.setTimeout(() => calRef.current?.focus({ preventScroll: true }), 0);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => settle("failed"), LOAD_DEADLINE_MS);
    // a no-cors request resolves for any reachable server and rejects on a block or an outage
    fetch(CALENDLY_URL, { method: "HEAD", mode: "no-cors", cache: "no-store" })
      .then(() => {
        probeOk.current = true;
      })
      .catch(() => {
        probeOk.current = false;
        settle("failed");
      });
  };

  const onFrameLoad = () => {
    loaded.current = true;
    // the vendor page announces itself; if it never does, this was an error page
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (phaseRef.current === "loading") settle("failed");
    }, MESSAGE_GRACE_MS);
  };

  const embedded = phase !== "choose";
  return (
    <Sheet label="Book a call" labelId="g-bk-l" className="g-book">
      <h2 id="g-bk-t" className={cx("g-sheet-title", embedded && "g-sheet-title--one")}>
        Thirty minutes on your go-to-market.
      </h2>
      {!embedded ? <p className="g-sub">Pick a time on the calendar. Open it in a new tab, or load it here.</p> : null}

      <div className="g-book-actions">
        <a className="g-btn g-btn--primary" href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
          Open the calendar <ExternalIcon />
          <SrOnly>(opens in a new tab)</SrOnly>
        </a>
        {phase === "choose" ? (
          <button type="button" className="g-btn g-btn--ghost" onClick={load}>
            Load the calendar here
          </button>
        ) : null}
      </div>
      {phase === "choose" ? <p className="g-note">Loading it here connects to Calendly, which sets its own cookies.</p> : null}
      <div className="g-cal" data-phase={phase === "choose" ? "idle" : phase} ref={calRef} tabIndex={-1}>
        <div className="g-cal-skel">
          {phase === "failed" ? (
            <span>
              The calendar did not load. Open it in a new tab, or{" "}
              <button type="button" className="g-linkbtn" onClick={load}>
                try again
              </button>
              .
            </span>
          ) : phase === "choose" ? (
            <span>The calendar loads here when you ask.</span>
          ) : (
            <span>Loading the calendar&hellip;</span>
          )}
        </div>
        {phase === "loading" || phase === "ready" ? (
          <iframe
            title="Book a 30-minute call"
            src={src}
            className={cx(phase === "ready" && "is-ready")}
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={onFrameLoad}
          />
        ) : null}
      </div>
      <span className="g-sr" role="status" aria-live="polite">
        {announce}
      </span>
      <p className="g-note g-note--close">
        <CloseLink />
      </p>
    </Sheet>
  );
}

/** A visible Close that comes after the frame in tab order, because Escape does not work inside a vendor frame. */
function CloseLink() {
  const { close } = useDialogs();
  return (
    <button type="button" className="g-btn g-btn--ghost g-btn--sm" onClick={() => close()}>
      Close
    </button>
  );
}

export default function BookDialog() {
  return (
    <Dialog name="book" labelledBy="g-bk-t" className="g-d-book">
      <BookBody />
    </Dialog>
  );
}
