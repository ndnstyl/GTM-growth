"use client";

import { ArrowUpRight } from "lucide-react";
import { NavLink } from "@/lib/motion/nav";

/** The cockpit's way into the Second Brain: a slim card with a small orbit that turns unless motion is reduced. */
export function BrainCard() {
  return (
    <NavLink
      href="/brain/"
      title="Open the Second Brain"
      className="group mt-2 flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-primary"
    >
      <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true" className="shrink-0">
        <circle cx="20" cy="20" r="3.2" fill="#ff3df5" />
        <circle cx="20" cy="20" r="9" fill="none" stroke="#00e5ff" strokeOpacity="0.55" strokeWidth="1.2" />
        <circle cx="20" cy="20" r="16" fill="none" stroke="#8f94ff" strokeOpacity="0.5" strokeWidth="1.2" />
        <g className="origin-center motion-safe:animate-[spin_18s_linear_infinite]" style={{ transformOrigin: "20px 20px" }}>
          <circle cx="29" cy="20" r="2.1" fill="#00e5ff" />
          <circle cx="8" cy="12" r="1.8" fill="#f0b34a" />
          <circle cx="12" cy="33" r="1.8" fill="#33d6a0" />
        </g>
      </svg>
      <span className="min-w-0 flex-1">
        <b className="mr-1.5 text-[11px] uppercase tracking-wider text-primary">Second Brain</b>
        <span className="text-[13px] leading-snug text-[var(--ink2)]">Orbit the skills, hooks and memory behind this cockpit</span>
      </span>
      <ArrowUpRight size={15} className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
    </NavLink>
  );
}
