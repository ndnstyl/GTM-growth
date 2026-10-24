"use client";

// The marketing cost strip, above the fold. Every figure is read from lib/demo/metrics.ts for the chosen month, so
// it can never disagree with the cockpit, the overview or the executive readout. Only the "matches the CRM" line
// reads a feed (the board's own checks).

import { useEffect, useState } from "react";
import { query } from "@/lib/reports/duck";
import type { FeedPresence } from "@/lib/reports/digital/feeds";
import { Kpi } from "@/components/shell/Kpi";
import { PanelFrame } from "./PanelFrame";
import { TARGET_PCT, dayLabel, fmt, metrics, monthName, monthValue, type KpiKey } from "@/lib/demo/metrics";

export function TargetStrip({ period, presence }: { period: string | null; presence: FeedPresence | null }) {
  const p = period && metrics.months[period] ? period : Object.keys(metrics.months)[0];
  const m = metrics.months[p];
  const [checks, setChecks] = useState<{ n: number; fails: number } | null>(null);

  useEffect(() => {
    if (!presence || presence.missing.includes("efficiency__tieout")) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = (await query(`SELECT result FROM efficiency__tieout WHERE period = '${p}'`)) as unknown as { result: string }[];
        if (!cancelled) setChecks({ n: rows.length, fails: rows.filter((r) => r.result === "FAIL").length });
      } catch {
        if (!cancelled) setChecks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presence, p]);

  const v = (k: KpiKey) => monthValue(p, k);
  const toolsPay = (v("marketing_tools") ?? 0) + (v("marketing_payroll") ?? 0);

  return (
    <PanelFrame
      id="efficiency-target"
      title="Marketing cost against target"
      subtitle={`${monthName(p)} ${p.slice(0, 4)}, whole company${m.partial ? `, month so far through ${dayLabel(m.end)}` : ""}`}
      qualifiers={{ dataThrough: m.end, confidence: "", verdict: checks && checks.fails ? `Does not match the CRM, ${checks.fails} checks` : "" }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="target-strip">
        <Kpi
          kpi="marketing_cost_pct"
          win={p}
          label="Marketing cost as a share of net revenue"
          value={fmt("marketing_cost_pct", v("marketing_cost_pct"))}
          note={`target ${TARGET_PCT}%: all-in cost ${fmt("marketing_cost", v("marketing_cost"))} (ad spend ${fmt("ad_spend", v("ad_spend"))}, tools and payroll ${fmt("marketing_cost", toolsPay)}) over net revenue ${fmt("net_revenue", v("net_revenue"))}`}
        />
        <Kpi kpi="revenue_per_marketing_dollar" win={p} label="Revenue per marketing dollar" value={fmt("revenue_per_marketing_dollar", v("revenue_per_marketing_dollar"))} note="net revenue for each dollar of all-in marketing cost" />
        <Kpi kpi="net_per_issued" win={p} label="Net revenue per issued appointment" value={fmt("net_per_issued", v("net_per_issued"))} note="net revenue ÷ appointments issued" />
        <Kpi kpi="mer" win={p} label="MER" value={fmt("mer", v("mer"))} note="revenue ÷ ad spend" />
      </div>
      {checks ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {checks.fails ? `${checks.fails} of ${checks.n} checks against the CRM differ.` : `Matches the CRM on all ${checks.n} checks.`}
        </p>
      ) : null}
    </PanelFrame>
  );
}
