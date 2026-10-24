import React from "react";
import { fontVars } from "./fonts";
import { cx } from "./lib/cx";

export default function GtmFooter({ nested = false }: { nested?: boolean }) {
  // inside the home page root the tokens (and the light theme) are inherited; elsewhere the footer carries its own
  return (
    <div className={nested ? "g-chrome" : cx("gtm-root", "g-chrome", fontVars)}>
      <footer className="g-footer">
        <div className="g-wrap g-footer-in">
          <span className="g-lockup-foot">
            <span className="g-logo" aria-hidden="true" />
            <span className="g-wm">Mike Soto</span>
            <span className="g-quiet">&copy; 2026 The Innovative Native</span>
          </span>
          <nav aria-label="Footer">
            <a href="https://www.linkedin.com/in/michael-soto-7134ba158/" rel="noopener noreferrer" target="_blank">
              LinkedIn<span className="g-sr"> (opens in a new tab)</span>
            </a>
            {/* plain anchors: these pages use the older theme, which only loads on a full page load */}
            <a href="/privacy-policy">Privacy</a>
            <a href="/terms-and-conditions">Terms</a>
          </nav>
          <span className="g-quiet">
            Writing lives on the <a href="/blog">blog</a>.
          </span>
        </div>
      </footer>
    </div>
  );
}
