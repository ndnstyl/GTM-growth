"use client";
import { ReactNode } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { useSlider } from "@/lib/motion/nav";
import { useSeen } from "@/lib/motion";

export function PageFrame({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-4 px-5 py-4">
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {children}
      </div>
    </div>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange, idPrefix = "tab" }: { tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void; idPrefix?: string }) {
  const { box, ind } = useSlider<HTMLDivElement>(value);
  const move = (e: React.KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[n].key);
    document.getElementById(`${idPrefix}-${tabs[n].key}`)?.focus({ preventScroll: true });
  };
  return (
    <div ref={box} role="tablist" className="relative flex flex-wrap gap-1 border-b border-border">
      <span ref={ind} className="g-ind" style={{ bottom: -1 }} aria-hidden="true" />
      {tabs.map((t, i) => (
        <button
          key={t.key}
          id={`${idPrefix}-${t.key}`}
          role="tab"
          aria-selected={value === t.key}
          data-on={value === t.key ? "true" : undefined}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === t.key ? 0 : -1}
          onKeyDown={(e) => move(e, i)}
          onClick={() => onChange(t.key)}
          className={`-mb-px rounded-t-md px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary ${
            value === t.key ? "text-primary" : "text-[var(--ink2)] hover:bg-secondary/60 hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idPrefix = "tab", active, children }: { idPrefix?: string; active: string; children: ReactNode }) {
  return <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-${active}`} className="space-y-4"><div key={active} className="g-detail space-y-4">{children}</div></div>;
}

export function Card({ title, children, className = "", right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`g-elev g-fade rounded-xl border border-border bg-card p-4 ${className}`}>
      {title ? (
        <div className="mb-2 flex items-center">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink2)]">{title}</h2>
          <span className="ml-auto">{right}</span>
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A bar that grows from zero the first time it is on screen. `pct` is 0 to 100. */
export function GrowBar({ pct, className = "bg-primary", delay = 0 }: { pct: number; className?: string; delay?: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className={`h-full w-full ${seen ? "in" : ""}`}>
      <div className={`g-grow-x h-full w-full rounded ${className}`} style={{ transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`, ["--i" as string]: delay } as React.CSSProperties} />
    </div>
  );
}

export function Chip({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[12px] font-semibold ${tone}`}>{children}</span>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-6">
      <div className="g-skel h-[18px] w-1/3" />
      <div className="g-skel h-[64px] w-full" />
      <div className="g-skel h-[64px] w-full" />
    </div>
  );
}

export function Missing({ what }: { what: string }) {
  return <div className="rounded-lg border border-[var(--crit)]/50 p-4 text-[12.5px] text-[var(--crit)]">{what} did not load.</div>;
}
