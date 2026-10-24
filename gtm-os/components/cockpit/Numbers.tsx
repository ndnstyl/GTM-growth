"use client";

import { NavLink } from "@/lib/motion/nav";

import { Gauge } from "lucide-react";
import { Panel } from "./Panel";
import { KpiFeed, NumbersTile, fmtMoney } from "@/lib/feeds";
import { CountUp, stagger } from "@/lib/motion";

function mmdd(iso: string) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function fmtValue(t: NumbersTile, v: number | null = t.value): string {
  if (v == null) return "n/a";
  if (t.unit === "usd") return fmtMoney(Math.round(v));
  if (t.unit === "ratio") return `${v.toFixed(1)}x`;
  if (t.unit === "pct") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString();
}

// For cost-type tiles a drop is good; the tile key says which direction wins.
const LOWER_IS_BETTER = new Set(["cac", "cpl", "cost"]);

export function Numbers({ kpi, loading = false }: { kpi: KpiFeed | null; loading?: boolean }) {
  const n = kpi?.numbers ?? null;
  return (
    <Panel
      icon={<Gauge size={13} />}
      title="Key numbers"
      action={<NavLink href={"/reports/#overview"} className="hover:text-primary">Overview →</NavLink>}
    >
      {n ? (
        <>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">As of {mmdd(n.as_of)}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {n.tiles.map((t, ti) => {
              const d = t.delta_pct;
              const good = d == null ? null : LOWER_IS_BETTER.has(t.key) ? d <= 0 : d >= 0;
              return (
                <div key={t.key} className="g-fade min-w-0" style={stagger(ti + 2)}>
                  <div className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t.label}</div>
                  <div className="tick min-h-[28px] text-[20px] font-bold leading-[28px]">
                    {t.value == null ? "n/a" : <CountUp value={t.value} format={(v) => fmtValue(t, v)} delay={ti * 70} duration={900} />}
                  </div>
                  <div className="min-h-[16px] text-[11px] text-muted-foreground">
                    {d != null ? (
                      <span className={`g-pop inline-block ${good ? "text-[var(--good)]" : "text-[var(--crit)]"}`} style={{ ["--i" as string]: 14 + ti }}>
                        {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%
                      </span>
                    ) : null}
                    {t.detail ? <span className="ml-1">{t.detail}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {n.pace ? (
            <div className="mt-3 border-t border-border pt-2">
              <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <span>Month to date vs pace</span>
                <span>through {mmdd(n.pace.through)}</span>
              </div>
              <div className="mb-1 mt-1.5 h-[6px] overflow-hidden rounded bg-secondary">
                <div className="g-pace h-full w-full origin-left rounded bg-primary" style={{ transform: `scaleX(${Math.min(100, n.pace.pct_to_pace) / 100})` }} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {n.pace.pct_to_pace}% to pace · {fmtMoney(n.pace.actual)} of {fmtMoney(n.pace.goal)}
              </div>
            </div>
          ) : null}
        </>
      ) : loading ? (
        <div aria-hidden="true">
          <div className="h-[14px]" />
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="min-w-0">
                <div className="g-skel h-[14px] w-16" />
                <div className="g-skel mt-1 h-[28px] w-20" />
                <div className="g-skel mt-1 h-[15px] w-14" />
              </div>
            ))}
          </div>
          <div className="mt-3 h-[52px] border-t border-border" />
        </div>
      ) : (
        <div className="py-1 text-[13px] text-muted-foreground">The numbers are unavailable right now.</div>
      )}
    </Panel>
  );
}
