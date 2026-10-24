import React, { useEffect, useRef, useState } from "react";
import { Dialog, Sheet, useDialogs } from "./Dialogs";
import { CALENDLY_URL } from "./types";
import { ExternalIcon, SrOnly } from "./Icons";
import { useTheme } from "./lib/useTheme";
import { cx } from "./lib/cx";

type Phase = "choose" | "loading" | "ready" | "failed";
const LOAD_DEADLINE_MS = 25000;
const CALENDLY_ORIGIN = "https://calendly.com";

/**
 * Booking. Nothing from Calendly loads until the visitor asks. Two clear actions: open the calendar in a new tab
 * (no embed at all), or load it here after a one-line notice. If the embed does not report loaded in time, say so.
 */
function BookBody() {
  const [theme] = useTheme();
  const [phase, setPhase] = useState<Phase>("choose");
  const [src, setSrc] = useState("");
  const [height, setHeight] = useState(0);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The frame's own load event is the success signal: the browser fires it when the vendor page has arrived. A long
  // timer is only the fallback for a frame that never loads at all (a blocker, an outage).
  // Calendly's page-height messages, when they come, size the frame to the booking form.
  useEffect(() => {
    if (phase === "choose") return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== CALENDLY_ORIGIN) return;
      const d: any = e.data;
      if (d && d.event === "calendly.page_height" && d.payload && d.payload.height) {
        setHeight(Math.min(Number(d.payload.height) || 0, 1100));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [phase]);

  const load = () => {
    const q =
      theme === "light"
        ? "background_color=ffffff&text_color=0b0e22&primary_color=00677d"
        : "background_color=12132a&text_color=f4f5fb&primary_color=00e5ff";
    // embed_domain and embed_type tell Calendly it is inline on this site, so it reports its state and height
    setSrc(`${CALENDLY_URL}?embed_domain=${encodeURIComponent(window.location.hostname)}&embed_type=Inline&${q}`);
    setPhase("loading");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPhase((p) => (p === "ready" ? p : "failed")), LOAD_DEADLINE_MS);
  };

  const embedded = phase !== "choose";
  return (
    <Sheet label="Book a call" labelId="g-bk-l" className={cx("g-book", embedded && "g-book--embed")}>
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
      {phase === "choose" ? (
        <p className="g-note">Loading it here connects to Calendly, which sets its own cookies.</p>
      ) : (
        <div className="g-cal" data-phase={phase} style={height ? { minHeight: height } : undefined}>
          <div className="g-cal-skel" role="status" aria-live="polite">
            {phase === "failed" ? (
              <span>
                The calendar did not load. Open it in a new tab, or{" "}
                <button type="button" className="g-linkbtn" onClick={load}>
                  try again
                </button>
                .
              </span>
            ) : (
              <span>Loading the calendar&hellip;</span>
            )}
          </div>
          <iframe
            title="Book a 30-minute call"
            src={src}
            className={cx(phase === "ready" && "is-ready")}
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              window.clearTimeout(timer.current);
              setPhase("ready");
            }}
          />
        </div>
      )}
      {embedded ? (
        <p className="g-note g-note--close">
          <CloseLink />
        </p>
      ) : null}
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
