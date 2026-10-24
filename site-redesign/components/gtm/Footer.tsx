import React, { useEffect, useState } from "react";
import { fontVars } from "./fonts";
import { cx } from "./lib/cx";
import { setMotionPaused, useMotionAllowed } from "./lib/useMotion";

export default function GtmFooter({ nested = false }: { nested?: boolean }) {
  const motion = useMotionAllowed();
  // when the system already asks for reduced motion the toggle could not change anything, so it says so instead
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setSystem(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // inside the home page root the tokens (and the light theme) are inherited; elsewhere the footer carries its own
  return (
    <div className={nested ? "g-chrome" : cx("gtm-root", "g-chrome", "g-themed", fontVars)}>
      <footer className="g-footer">
        <div className="g-wrap g-footer-in">
          <span className="g-lockup-foot">
            <span className="g-logo" aria-hidden="true" />
            <span className="g-wm">Mike Soto</span>
            <span className="g-quiet">
            {system ? (
              <span>Motion is off in your system settings</span>
            ) : (
              <button type="button" className="g-linkbtn g-motion-toggle" aria-pressed={!motion} onClick={() => setMotionPaused(motion)}>
                {motion ? "Pause motion" : "Play motion"}
              </button>
            )}{" "}
            &middot;{" "}&copy; 2026 The Innovative Native</span>
          </span>
          <nav aria-label="Footer">
            <a href="https://www.linkedin.com/in/michael-soto-7134ba158/" rel="noopener noreferrer" target="_blank">
              LinkedIn<span className="g-sr"> (opens in a new tab)</span>
            </a>
            {/* plain anchors: these pages use the older theme, which only loads on a full page load */}
            <a href="/privacy-policy">Privacy</a>
            <a href="/terms-and-conditions">Terms</a>
            <a href="/blog">Blog</a>
            <a href="/guides/outside-consent-register">Consent register guide</a>
            <a href="/echo-os">ECHO OS</a>
          </nav>
          <span className="g-quiet">
            Direction on AI compliance. Not legal counsel, not legal advice. Writing lives on the <a href="/blog">blog</a>.
          </span>
        </div>
      </footer>
    </div>
  );
}
