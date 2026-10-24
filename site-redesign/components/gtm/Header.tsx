import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Dialog, useDialogs, CloseButton } from "./Dialogs";
import BookDialog from "./BookDialog";
import { subscribeScroll } from "./lib/scrollBus";
import { useTheme } from "./lib/useTheme";
import { useMotionAllowed } from "./lib/useMotion";
import { cx } from "./lib/cx";
import { fontVars } from "./fonts";
import { navItems } from "@/data/navigation";

/** The four menu places, from the one navigation list ("/" is home, "/#story" is the story section). */
export const NAV = navItems
  .filter((n) => !n.isCta)
  .map((n) => ({ id: n.href === "/" ? "home" : n.href.replace("/#", ""), label: n.label }));

/** Sections that belong to a nav item (the ten stages sit under Services). */
const SECTION_GROUP: Record<string, string> = { home: "home", services: "services", stages: "services", story: "story", cases: "cases" };
const SECTION_IDS = ["home", "services", "stages", "story", "cases"];

/** A scroll that always takes about 700 ms however far it goes, then hands focus to the section. */
export function goToSection(id: string, smooth: boolean) {
  const t = document.getElementById(id);
  if (!t) return;
  const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--g-hh")) || 76;
  const from = window.scrollY;
  const to = Math.max(0, t.getBoundingClientRect().top + from - (hh + 12));
  history.replaceState(null, "", `#${id}`);
  const done = () => t.focus({ preventScroll: true });
  if (!smooth || Math.abs(to - from) < 4) {
    window.scrollTo(0, to);
    done();
    return;
  }
  const t0 = performance.now();
  const ms = 700;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    window.scrollTo(0, from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
}

function Lockup() {
  return (
    <>
      <span className="g-logo" role="img" aria-label="The Innovative Native logo" />
      <span className="g-wm">Mike Soto</span>
    </>
  );
}

function ThemeToggle({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const next = theme === "light" ? "dark" : "light";
  return (
    <button type="button" className={cx("g-toggle", className)} onClick={toggle} aria-label={`Switch to ${next} theme`}>
      {theme === "light" ? "Dark" : "Light"}
    </button>
  );
}

export default function GtmHeader({ home = false }: { home?: boolean }) {
  // the home page and the older pages are two documents with two stylesheets: moving between them is a full load
  const A: any = home ? Link : "a";
  const router = useRouter();
  const dialogs = useDialogs();
  const motion = useMotionAllowed();
  const headRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<string>("home");
  const menuBtn = useRef<HTMLButtonElement | null>(null);
  const menuOpen = dialogs.current?.name === "menu";

  // condensing bar + active section: reads cached offsets, writes one class
  useEffect(() => {
    if (!home) return;
    let tops: number[] = [];
    let cur = "home";
    return subscribeScroll({
      measure() {
        tops = SECTION_IDS.map((id) => {
          const el = document.getElementById(id);
          return el ? el.getBoundingClientRect().top + window.scrollY : Infinity;
        });
      },
      update(y, vh) {
        headRef.current?.classList.toggle("cond", y > 40);
        const line = y + vh * 0.4;
        let n = "home";
        SECTION_IDS.forEach((id, i) => {
          if (tops[i] <= line) n = id;
        });
        const group = SECTION_GROUP[n];
        if (group !== cur) {
          cur = group;
          setActive(group);
        }
      },
    });
  }, [home]);

  useEffect(() => {
    if (home) return;
    return subscribeScroll({ update: (y) => headRef.current?.classList.toggle("cond", y > 40) });
  }, [home]);

  const onNav = (e: React.MouseEvent, id: string) => {
    if (!home) return; // other pages: the link navigates to /#id and the router scrolls
    e.preventDefault();
    if (dialogs.current?.name === "menu") dialogs.close(() => goToSection(id, motion));
    else goToSection(id, motion);
  };

  const hrefFor = (id: string) => (id === "home" ? (home ? "#home" : "/") : home ? `#${id}` : `/#${id}`);

  return (
    <div className={home ? "g-chrome" : cx("gtm-root", "g-chrome", fontVars)}>
      <header className="g-top" ref={headRef}>
        <div className="g-bar">
          <A href={home ? "#home" : "/"} className="g-brand" onClick={(e: React.MouseEvent) => onNav(e, "home")}>
            <Lockup />
          </A>
          <nav className="g-links" aria-label="Primary">
            {NAV.map((n) => (
              <A
                key={n.id}
                href={hrefFor(n.id)}
                aria-current={home && active === n.id ? "location" : undefined}
                onClick={(e: React.MouseEvent) => onNav(e, n.id)}
              >
                {n.label}
              </A>
            ))}
          </nav>
          <div className="g-right">
            {home ? <ThemeToggle className="g-toggle--bar" /> : null}
            <button type="button" className="g-btn g-btn--primary g-btn--pill" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
              Book a Call
            </button>
            <button
              ref={menuBtn}
              type="button"
              className="g-menu-btn"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="g-menu"
              onClick={(e) => dialogs.open("menu", null, e.currentTarget)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <Dialog name="menu" id="g-menu" label="Menu" className="g-d-menu" exitProp="clip-path">
        <div className="g-menu-inner">
          <div className="g-menu-top">
            <span className="g-brand g-brand--static">
              <Lockup />
            </span>
            <CloseButton label="Close menu" />
          </div>
          {NAV.map((n, k) => (
            <A
              key={n.id}
              href={hrefFor(n.id)}
              className="g-menu-link"
              style={{ ["--k" as string]: k } as React.CSSProperties}
              onClick={(e: React.MouseEvent) => {
                if (home) onNav(e, n.id);
                else dialogs.close();
              }}
            >
              <small>{String(k + 1).padStart(2, "0")}</small>
              {n.label}
            </A>
          ))}
          <div className="g-menu-actions">
            <button type="button" className="g-btn g-btn--primary g-btn--block" onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
              Book a Call
            </button>
            {home ? <ThemeToggle className="g-toggle--menu" /> : null}
          </div>
        </div>
      </Dialog>
      <BookDialog />
    </div>
  );
}
