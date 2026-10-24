"use client";

import { NavLink } from "@/lib/motion/nav";
import { Gauge } from "lucide-react";
import { Panel } from "./Panel";
import { Kpi } from "@/components/shell/Kpi";
import { CountUp, stagger } from "@/lib/motion";
import { KpiKey, Win, dayLabel, deltaPct, fmt, metrics, value, win } from "@/lib/demo/metrics";

const TILES: { k: KpiKey; w: Win; label: string; note: string }[] = [
  { k: "leads", w: "yesterday", label: "Leads yesterday", note: "vs same day last week" },
  { k: "issued", w: "yesterday", label: "Appointments issued yesterday", note: "vs same day last week" },
  { k: "gross_revenue", w: "mtd", label: "Revenue, month so far", note: "partial month" },
  { k: "marketing_cost_pct", w: "mtd", label: "Marketing cost, share of revenue", note: "month so far, target 28%" },
  { k: "mer", w: "last7", label: "MER, last 7 days", note: "revenue ÷ ad spend" },
  { k: "cost_per_set", w: "last7", label: "Cost per set, last 7 days", note: "ad spend ÷ appointments set" },
];

export function Numbers({ loading = false }: { kpi?: unknown; loading?: boolean }) {
  const pace = metrics.pace;
  if (loading) return null;
  return (
    <Panel
      icon={<Gauge size={13} />}
      title="Key numbers"
      action={<NavLink href={"/reports/#overview"} className="hover:text-primary">Overview →</NavLink>}
    >
      <div className="text-[12px] text-muted-foreground">Data through {dayLabel(metrics.through)}</div>
      <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-2.5 min-[480px]:grid-cols-2">
        {TILES.map((t, ti) => {
          const d = t.k === "gross_revenue" ? null : deltaPct(t.w, t.k);
          const lowerBetter = metrics.kpis[t.k].lower_is_better;
          const v = value(t.w, t.k);
          return (
            <div key={t.k + t.w} className="g-fade min-w-0" style={stagger(ti + 2)}>
              <Kpi
                compact
                kpi={t.k}
                win={t.w}
                label={t.label}
                value={v == null ? "n/a" : <CountUp value={v} format={(x) => fmt(t.k, x)} delay={ti * 70} duration={900} />}
                delta={d}
                good={d == null ? null : lowerBetter ? d <= 0 : d >= 0}
                note={t.note}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-border pt-2">
        <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
          <span>Revenue against pace</span>
          <span>through {dayLabel(win("mtd").end)}</span>
        </div>
        <div className="mb-1 mt-1.5 h-[6px] overflow-hidden rounded bg-secondary">
          <div className="g-pace h-full w-full origin-left rounded bg-primary" style={{ transform: `scaleX(${Math.min(100, pace.pct_to_pace) / 100})` }} />
        </div>
        <div className="text-[12px] text-muted-foreground">
          {Math.round(pace.pct_to_pace)}% of pace: {fmt("gross_revenue", pace.actual)} booked against about {fmt("gross_revenue", pace.expected_by_today)} expected by now. Monthly goal {fmt("gross_revenue", pace.goal)}.
        </div>
      </div>
    </Panel>
  );
}
