"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { GateContext } from "@/lib/motion";

// Report surfaces build themselves in several async steps (the engine boots, feeds register, queries return) and the
// parts arrive at different times, which pushes content that is already on screen. This gate keeps the surface behind
// a skeleton of fixed size until it has stopped changing (a quiet window, no loading text left, or a hard cap), then
// fades it in as one piece. What the reader sees never moves: the skeleton is absolutely positioned, the hidden
// content is not painted, and the reveal is opacity and a short rise.

const LOADING = /Loading|Building contract|Checking the data|computing|Reading the|unavailable right now/;

export function SettleGate({
  children,
  quiet = 220,
  max = 5000,
  skeleton = 420,
  pad = "",
  className = "",
}: {
  children: ReactNode;
  quiet?: number;
  max?: number;
  skeleton?: number;
  /** padding classes for the skeleton, to line it up with the surface it stands in for */
  pad?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      mo.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(cap);
      setOpen(true);
    };
    const settle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // still showing a loading line: the data has not arrived, keep waiting for the next change (or the cap)
        if (LOADING.test(el.textContent ?? "")) return;
        finish();
      }, quiet);
    };
    const mo = new MutationObserver(settle);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    const cap = window.setTimeout(finish, max);
    settle();
    return () => {
      finished = true;
      mo.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(cap);
    };
  }, [quiet, max]);

  return (
    <GateContext.Provider value={open}>
      <div className={`relative ${className}`}>
        <div ref={ref} className={open ? "g-detail" : "invisible"} aria-busy={!open}>
          {children}
        </div>
        {open ? null : (
          <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 space-y-3 ${pad}`} style={{ height: skeleton }}>
            <div className="g-skel h-[22px] w-48" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="g-skel h-[78px]" />)}
            </div>
            <div className="g-skel h-[180px] w-full" />
            <div className="g-skel h-[96px] w-full" />
          </div>
        )}
      </div>
    </GateContext.Provider>
  );
}
