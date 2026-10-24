"use client";

// The comparison row: month to date, week over week, month over
// month, year over year for the picked metric at company scope, each printing the figure,
// the difference, and "on N working days vs M". A ratio prints its point difference. A row
// with withheld_reason prints the reason in the cell. Net revenue per issued appointment and marketing cost percent are
// month-grain and read the marketing cost target feed (see windows.ts).

import { useEffect, useState } from "react";
import { query } from "@/lib/reports/duck";
import { pickerMetric } from "@/lib/reports/digital/picker";
import { companyScopeFor, type RebaseMap } from "@/lib/reports/digital/rebase";
import {
  daysText,
  deltaText,
  GOLDEN_MONTH_METRICS,
  goldenWindows,
  normalizeFormat,
  signedCaveat,
  valueText,
  WINDOW_LABELS,
  windowOrder,
  windowsSql,
  windowSpan,
  type GoldenMonthRow,
  type WindowRow,
} from "@/lib/reports/digital/windows";
import type { FeedPresence } from "@/lib/reports/digital/feeds";
import type { SliceExport } from "@/lib/reports/digital/exportSlice";
import { PanelFrame, Reason } from "./PanelFrame";

export function useWindowRows(metric: string, map: RebaseMap | null, scopeKind: string, scope: string | undefined, period: string | null, presence: FeedPresence | null) {
  const [rows, setRows] = useState<WindowRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!map || !presence) return;
    const entry = map.metrics[metric];
    if (!entry) return;
    let cancelled = false;
    (async () => {
      try {
        if (GOLDEN_MONTH_METRICS.has(metric)) {
          if (presence.missing.includes("golden_rule__monthly")) {
            if (!cancelled) setRows([]);
            return;
          }
          const g = (await query(
            "SELECT period, office, universe, nsli_cents, nsli_plus_prenet_cents, marketing_cost_pct, settle_status, as_of, confidence FROM golden_rule__monthly WHERE universe = 'rep_assigned' ORDER BY period DESC"
          )) as unknown as GoldenMonthRow[];
          const current = period ?? g.find((r) => r.office === "COMPANY")?.period ?? "";
          const offices = scopeKind === "company" ? ["COMPANY"] : scope ? [scope] : [...new Set(g.map((r) => r.office))].filter((o) => o !== "COMPANY").sort();
          const out = offices.flatMap((o) => goldenWindows(g, metric as "nsli" | "marketing_cost_pct", o, current));
          if (!cancelled) setRows(out);
          return;
        }
        if (presence.missing.includes("dm_windows")) {
          if (!cancelled) setRows([]);
          return;
        }
        const r = (await query(windowsSql(entry.windows_metric, scopeKind, scope))) as unknown as WindowRow[];
        if (!cancelled) setRows(r);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metric, map, scopeKind, scope, period, presence]);
  return { rows, error };
}

export function ComparisonRow({ metric, map, period, presence }: { metric: string; map: RebaseMap | null; period: string | null; presence: FeedPresence | null }) {
  const pm = pickerMetric(metric);
  const cs = map ? companyScopeFor(metric, map) : null;
  const { rows, error } = useWindowRows(metric, map, cs?.scope_kind ?? "company", cs?.scope, period, presence);
  const format = normalizeFormat(rows?.[0]?.format, pm?.format ?? "count");
  const ordered = rows ? [...rows].sort((a, b) => windowOrder(a.window) - windowOrder(b.window)) : [];
  const dataThrough = rows?.find((r) => r.data_through)?.data_through ?? "not published";

  const exportSlice = (): SliceExport | null => {
    if (!rows?.length || !pm) return null;
    return {
      title: `${pm.label}, company comparison windows`,
      period: period ?? "current",
      filters: { scope: cs ? `${cs.scope_kind} ${cs.scope}` : "company" },
      metric: pm.label,
      dataThrough,
      confidence: "from the comparison windows",
      columns: [
        { key: "window", label: "Window" },
        { key: "value", label: pm.label },
        { key: "prior", label: "Prior window" },
        { key: "delta", label: pm.kind === "ratio" ? "Point difference" : "Change" },
        { key: "days", label: "Working days" },
        { key: "span", label: "Dates" },
      ],
      rows: ordered.map((r) => ({
        window: WINDOW_LABELS[r.window as keyof typeof WINDOW_LABELS] ?? r.window,
        value: r.withheld_reason ? null : valueText(r, format),
        prior: r.withheld_reason ? null : (r.prior_value === null ? "no prior window" : valueText({ ...r, value: r.prior_value, withheld_reason: null }, format)),
        delta: r.withheld_reason ? null : deltaText(r, pm.kind, format),
        days: daysText(r),
        span: windowSpan(r),
      })),
      withheld: ordered.filter((r) => r.withheld_reason).map((r) => ({ where: `${WINDOW_LABELS[r.window as keyof typeof WINDOW_LABELS] ?? r.window} / ${pm.label}`, reason: r.withheld_reason! })),
    };
  };

  return (
    <PanelFrame
      id="comparison"
      title={pm ? `${pm.label}: company, like-for-like working days` : "Comparison windows"}
      subtitle={cs && cs.scope_kind !== "company" ? `read at the ${cs.scope} platform scope` : "company scope"}
      qualifiers={{ dataThrough, confidence: "comparison windows", verdict: GOLDEN_MONTH_METRICS.has(metric) ? "month-grain, from the marketing cost target feed" : "from the comparison windows feed" }}
      exportSlice={exportSlice}
    >
      {error && <Reason text={`windows query failed: ${error}`} tone="bad" />}
      {!rows && !error && <Reason text="reading the comparison windows" tone="muted" />}
      {rows && !rows.length && <Reason text={`no comparison rows published for ${pm?.label ?? metric} at company scope; the feed carries no row for this metric yet`} tone="bad" />}
      {ordered.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="comparison-row">
          {ordered.map((r) => {
            const caveat = signedCaveat(r);
            return (
              <div key={r.window} className="min-w-0 rounded-lg border border-border/60 bg-background p-2.5" data-window={r.window}>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{WINDOW_LABELS[r.window as keyof typeof WINDOW_LABELS] ?? r.window}</div>
                {r.withheld_reason ? (
                  <div className="mt-0.5"><Reason text={r.withheld_reason} /></div>
                ) : (
                  <>
                    <div className="mt-0.5 text-[17px] font-semibold tabular-nums" data-testid="window-value">{valueText(r, format)}</div>
                    <div className="text-[12px] tabular-nums">{deltaText(r, pm?.kind ?? "sum", format)}{r.prior_value !== null && !Number.isNaN(Number(r.prior_value)) ? ` vs ${valueText({ ...r, value: r.prior_value, withheld_reason: null }, format)}` : ""}</div>
                  </>
                )}
                <div className="mt-1 text-[10.5px] text-muted-foreground">{daysText(r)}</div>
                <div className="text-[10px] text-muted-foreground">{windowSpan(r)}{r.partial ? " · window still open" : ""}</div>
                {caveat && <div className="mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">{caveat}</div>}
              </div>
            );
          })}
        </div>
      )}
    </PanelFrame>
  );
}
