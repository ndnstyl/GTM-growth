"use client";

// Pacing: per market for the picked metric, month to date,
// the budget status text, and elapsed/total working days on every row. A settled month
// shows the actual and reads settled. Every figure is read off one feed row.

import { useEffect, useState } from "react";
import { query } from "@/lib/reports/duck";
import { pickerMetric } from "@/lib/reports/digital/picker";
import type { RebaseMap } from "@/lib/reports/digital/rebase";
import { fmtValue, normalizeFormat, pacingSql, type PacingRow } from "@/lib/reports/digital/windows";
import type { FeedPresence } from "@/lib/reports/digital/feeds";
import type { SliceExport } from "@/lib/reports/digital/exportSlice";
import { PanelFrame, Reason, RowsTable } from "./PanelFrame";

export function PacingPanel({ metric, map, period, market, presence }: { metric: string; map: RebaseMap | null; period: string | null; market: string | undefined; presence: FeedPresence | null }) {
  const pm = pickerMetric(metric);
  const [rows, setRows] = useState<PacingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missing = presence?.missing.includes("dm_pacing") ?? true;
  const windowsMetric = map?.metrics[metric]?.windows_metric ?? metric;

  useEffect(() => {
    if (!presence || missing) return;
    let cancelled = false;
    (async () => {
      try {
        const r = (await query(pacingSql(windowsMetric, period ?? undefined))) as unknown as PacingRow[];
        if (!cancelled) setRows(market ? r.filter((x) => x.market === market || x.market === "ALL") : r);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presence, missing, windowsMetric, period, market]);

  const format = normalizeFormat(rows?.[0]?.format, pm?.format ?? "count");
  const settled = (r: PacingRow) => (r.settle_status ?? "").toUpperCase() === "SETTLED";
  const days = (r: PacingRow) =>
    r.working_days_elapsed === null || r.working_days_total === null
      ? null
      : `${Number(r.working_days_elapsed).toLocaleString(undefined, { maximumFractionDigits: 2 })} of ${Number(r.working_days_total).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const display = (rows ?? []).map((r) => ({
    market: r.market === "ALL" ? "Company" : r.market,
    month: r.month,
    mtd: fmtValue(r.mtd_value, format),
    rate: settled(r) ? "settled" : fmtValue(r.rate_per_working_day, format),
    projected: settled(r) ? `settled: ${fmtValue(r.mtd_value, format) ?? "actual not published"}` : fmtValue(r.projected_month, format),
    budget: r.budget === null ? r.budget_status ?? "no ruled budget line" : fmtValue(r.budget, format),
    pct: r.projected_pct_of_budget === null ? r.budget_status ?? "no ruled budget line" : `${Number(r.projected_pct_of_budget).toFixed(1)}%`,
    days: days(r),
    settle: r.settle_status ?? "settle status not published",
  }));
  const dataThrough = rows?.find((r) => r.data_through)?.data_through ?? "not published";
  const companyLabor = rows?.find((r) => r.scope_kind === "company" && r.labor_mtd !== null && r.labor_mtd !== undefined && Number(r.labor_mtd) > 0);
  const laborNote = companyLabor
    ? `Company month to date and projection include marketing labor at the ruled constant (${fmtValue(Number(companyLabor.labor_mtd), "dollars") ?? ""} month to date); the percent of budget compares ad spend to the ruled lines, without labor.`
    : null;
  const columns = [
    { key: "market", label: "Market" },
    { key: "month", label: "Month" },
    { key: "mtd", label: "Month to date", align: "right" as const },
    { key: "rate", label: "Per working day", align: "right" as const },
    { key: "projected", label: "Projected month", align: "right" as const },
    { key: "budget", label: "Ruled budget", align: "right" as const },
    { key: "pct", label: "Projected % of budget", align: "right" as const },
    { key: "days", label: "Working days elapsed of total" },
    { key: "settle", label: "Settle" },
  ];
  const reasonFor = (_r: Record<string, unknown>, key: string) =>
    key === "days" ? "working-day counts not published for this row" : key === "mtd" ? "month to date not published for this metric and market" : "projection withheld: the feed carries no figure for this row (a failed pull or an incomplete month refuses a projection)";

  const exportSlice = (): SliceExport | null =>
    !display.length || !pm
      ? null
      : {
          title: `Pacing, ${pm.label}`,
          period: period ?? "current month",
          filters: { market },
          metric: pm.label,
          dataThrough,
          confidence: "pacing",
          columns,
          rows: display,
          withheld: display.flatMap((d) => columns.filter((c) => d[c.key as keyof typeof d] === null).map((c) => ({ where: `${d.market} ${d.month} / ${c.label}`, reason: reasonFor(d, c.key) }))),
        };

  return (
    <PanelFrame
      id="pacing"
      title={`Pacing and run rate: ${pm?.label ?? metric}, per market against budget`}
      subtitle="Working days: about 26 a month, with Saturday and Sunday counted as half days"
      qualifiers={{ dataThrough, confidence: "pacing", verdict: "" }}
      exportSlice={exportSlice}
    >
      {missing ? (
        <Reason text="Pacing data is not loaded yet" tone="bad" />
      ) : error ? (
        <Reason text={`pacing query failed: ${error}`} tone="bad" />
      ) : !rows ? (
        <Reason text="reading pacing" tone="muted" />
      ) : !rows.length ? (
        <Reason text={`no pacing rows published for ${pm?.label ?? metric}${period ? ` in ${period}` : ""}; the pacing view carries this metric only where a month-to-date figure exists`} tone="bad" />
      ) : (
        <>
          <RowsTable columns={columns} rows={display} reasonFor={reasonFor} />
          {laborNote && <div className="mt-2 text-[11px] text-muted-foreground">{laborNote}</div>}
        </>
      )}
    </PanelFrame>
  );
}
