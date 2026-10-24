"use client";

import { HexBackdrop } from "@/components/cockpit/HexBackdrop";
import { centreInStrip } from "@/lib/motion/scroll";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Hexagon, CircleDot } from "lucide-react";
import { AREAS, type NavItem } from "@/lib/demo/nav";
import { NAV_EVENT, NavLink, useSlider } from "@/lib/motion/nav";
import { watchScrollRegions } from "@/lib/demo/a11y";
import { RingPanel } from "@/components/cockpit/Ring";

const norm = (p: string) => (p.endsWith("/") ? p : p + "/");

function useLoc() {
  const pathname = usePathname() ?? "/";
  const [loc, setLoc] = useState({ hash: "", search: "" });
  // epoch bumps when the query string changes on the same page (a different board), so the page re-reads it
  const [epoch, setEpoch] = useState(0);
  const lastSearch = useRef<string | null>(null);
  useEffect(() => {
    const read = () => {
      const search = window.location.search;
      if (lastSearch.current !== null && lastSearch.current !== search) setEpoch((e) => e + 1);
      lastSearch.current = search;
      setLoc({ hash: window.location.hash.replace(/^#/, ""), search });
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    window.addEventListener(NAV_EVENT, read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
      window.removeEventListener(NAV_EVENT, read);
    };
  }, [pathname]);
  return { pathname: norm(pathname), epoch, ...loc };
}

function itemActive(item: NavItem, loc: { pathname: string; hash: string; search: string }): boolean {
  const [pathAndQuery, ihash = ""] = item.href.split("#");
  const [ipath, iquery = ""] = pathAndQuery.split("?");
  if (norm(ipath) !== loc.pathname) return false;
  if (iquery) return loc.search.replace(/^\?/, "") === iquery;
  if (loc.pathname === "/reports/workbench/" && loc.search) return false;
  if (ihash) {
    const cur = loc.hash === "callcenter" ? "call_center" : loc.hash || (loc.pathname === "/reports/" ? "overview" : "");
    return cur.toLowerCase().replace(/-/g, "_") === ihash;
  }
  if (loc.pathname === "/reports/") return false;
  return true;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLoc();
  const [ringOpen, setRingOpen] = useState(false);
  useEffect(() => watchScrollRegions(), []);
  const activeArea =
    AREAS.find((a) => a.items.some((i) => itemActive(i, loc))) ??
    AREAS.find((a) => a.items.some((i) => norm(i.href.split(/[?#]/)[0]) === loc.pathname)) ??
    AREAS[0];
  const activeItem = activeArea.items.find((i) => itemActive(i, loc));
  const { box: topBox, ind: topInd } = useSlider<HTMLElement>(activeArea.id);
  const { box: subBox, ind: subInd } = useSlider<HTMLDivElement>(activeArea.id + "|" + (activeItem?.href ?? ""));

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-1.5 md:gap-3 md:px-3.5">
          <NavLink href="/" className="flex shrink-0 items-center gap-2 text-[15px] font-extrabold tracking-tight" aria-label="GTM OS home">
            <Hexagon size={18} className="text-primary transition-transform duration-500 [transition-timing-function:var(--ease-spring)] hover:rotate-[60deg]" />
            <span><span className="text-primary">GTM</span> OS</span>
          </NavLink>
          <div className="relative min-w-0 flex-1">
            <nav ref={topBox} aria-label="Areas" className="no-scrollbar relative flex items-center gap-0.5 overflow-x-auto scroll-smooth pb-[3px] [scroll-snap-type:x_proximity]">
              <span ref={topInd} className="g-ind" aria-hidden="true" />
              {AREAS.map((a) => {
                const on = a.id === activeArea.id;
                return (
                  <NavLink
                    key={a.id}
                    href={a.items[0].href}
                    data-on={on ? "true" : undefined}
                    aria-current={on ? "page" : undefined}
                    ref={(el) => { if (el && on) centreInStrip(el.parentElement, el); }}
                    className={
                      "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 [scroll-snap-align:start] " +
                      (on ? "bg-primary/15 text-primary" : "text-[var(--ink2)] hover:bg-secondary hover:text-foreground")
                    }
                  >
                    <span className="md:hidden">{a.short}</span>
                    <span className="hidden md:inline">{a.label}</span>
                  </NavLink>
                );
              })}
            </nav>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--background)] to-transparent md:hidden" />
          </div>
          <button
            onClick={() => setRingOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-[var(--ink2)] hover:border-primary hover:text-primary"
            title="Everything shipped, searchable"
            aria-label="Artifacts"
          >
            <CircleDot size={13} /> <span className="hidden sm:inline">Artifacts</span>
          </button>
          <span className="shrink-0 rounded-full border border-[var(--magenta)]/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--magenta)]">
            <span className="md:hidden">Demo</span><span className="hidden md:inline">Demo data</span>
          </span>
          <span className="hidden shrink-0 text-[11px] text-muted-foreground xl:inline">Fictional demo company</span>
        </div>
        <div className="relative border-t border-border/60">
          <div ref={subBox} className="no-scrollbar relative flex items-center gap-1 overflow-x-auto px-3.5 py-1 pb-[5px]">
            <span ref={subInd} className="g-ind" aria-hidden="true" />
            <span className="mr-2 hidden shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:inline">{activeArea.stage}</span>
            {activeArea.items.map((i) => {
              const on = itemActive(i, loc);
              return (
                <NavLink
                  key={i.href}
                  href={i.href}
                  title={i.desc}
                  data-on={on ? "true" : undefined}
                  aria-current={on ? "page" : undefined}
                  className={
                    "shrink-0 whitespace-nowrap rounded px-2 py-1 text-[13px] transition-colors duration-200 " +
                    (on ? "font-semibold text-accent-foreground" : "text-[var(--ink2)] hover:text-foreground")
                  }
                >
                  {i.label}
                </NavLink>
              );
            })}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--background)] to-transparent md:hidden" />
        </div>
      </header>
      {loc.pathname === "/" ? <HexBackdrop /> : null}
      <main id="main" className="min-h-0 flex-1 overflow-hidden">
        <div id="route-slot" key={`${loc.pathname}:${loc.epoch}`} className="g-route h-full">{children}</div>
      </main>
      <RingPanel open={ringOpen} onOpenChange={setRingOpen} />
    </div>
  );
}
