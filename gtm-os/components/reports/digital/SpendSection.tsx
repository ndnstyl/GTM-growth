"use client";

// Spend: who runs it x market as a stacked bar with fees as a segment, the
// platform/account/campaign table with basis and confidence, the tools-and-retainers line,
// and the cross-foot (buckets by month with the tie-out verdict per month). Every table is
// the workbench's PivotPanel over a resolved saved view (one aggregation path, drill built
// in); the export runs the same pivot statement and writes the rows it returns.

import { useEffect, useState } from "react";
import { query } from "@/lib/reports/duck";
import { resolveTemplate, type DigitalTemplate, type RebaseMap } from "@/lib/reports/digital/rebase";
import type { FeedPresence } from "@/lib/reports/digital/feeds";
import type { SliceExport } from "@/lib/reports/digital/exportSlice";
import { findSource } from "@/lib/reports/workbench/sources";
import { buildPivot, dateWhereFor, type ViewFilter, type ViewSlice } from "@/lib/reports/workbench/pivotSql";
import type { View } from "@/lib/reports/workbench/viewSchema";
import { PivotPanel, fmt } from "@/components/reports/workbench/PivotPanel";
import { ChartPanel } from "@/components/reports/workbench/ChartPanel";
import { PanelFrame, Reason, RowsTable } from "./PanelFrame";

export type DrillAsk = { sourceKey: string; cellDims: Record<string, string | null>; measureKey: string; cellValue: number; filters: ViewFilter[] };

export function sliceOf(view: View): ViewSlice {
  const source = findSource(view.sourceKey)!;
  return { sourceKey: view.sourceKey, rows: view.rows, cols: view.cols, measures: view.measures, filters: view.filters, dateWhere: dateWhereFor(view.datePreset, source.dateExpr) };
}

/** Export of a pivot view: run the SAME pivot statement the panel renders and write its cell
 * rows (grouping tags dropped); null measures carry the measure's reason. */
export async function exportPivot(view: View, meta: { period: string; filters: Record<string, string | undefined>; dataThrough: string; confidence: string; nullReason: (measureKey: string) => string }): Promise<SliceExport | null> {
  const source = findSource(view.sourceKey);
  if (!source) return null;
  const plan = buildPivot(source, sliceOf(view));
  const stmt = plan.statements.find((s) => s.id === "pivot");
  if (!stmt) return null;
  const out = (await query(stmt.sql)) as Record<string, unknown>[];
  const dims = [...plan.rowDims, ...(plan.colDim ? [plan.colDim] : [])];
  const cells = out.filter((r) => dims.every((d) => Number(r[`__g_${d}`]) === 0));
  const columns = [
    ...dims.map((d) => ({ key: d, label: source.dims.find((x) => x.key === d)?.label ?? d })),
    ...plan.measureKeys.map((m) => ({ key: m, label: source.measures.find((x) => x.key === m)?.label ?? m })),
  ];
  const withheld: { where: string; reason: string }[] = [];
  const rows = cells.map((r) => {
    const o: Record<string, string | null> = {};
    for (const d of dims) o[d] = r[d] === null ? "(all)" : String(r[d]);
    for (const m of plan.measureKeys) {
      const mm = source.measures.find((x) => x.key === m)!;
      if (r[m] === null || r[m] === undefined) {
        o[m] = null;
        withheld.push({ where: `${dims.map((d) => String(r[d] ?? "")).join(" / ")} / ${mm.label}`, reason: meta.nullReason(m) });
      } else o[m] = fmt(r[m], mm.format);
    }
    return o;
  });
  for (const rm of plan.refusedMeasures) withheld.push({ where: rm.key, reason: `refused: ${rm.reason}` });
  return { title: view.name, period: meta.period, filters: meta.filters, dataThrough: meta.dataThrough, confidence: meta.confidence, columns, rows, withheld };
}

type TieRow = { period: string; check_id: string; expected: number | null; observed: number | null; result: string; evidence: string | null; feed_as_of: string | null };

export function SpendSection({
  templates,
  map,
  period,
  market,
  presence,
  dataThrough,
  onDrill,
}: {
  templates: Record<string, DigitalTemplate>;
  map: RebaseMap | null;
  period: string | null;
  market: string | undefined;
  presence: FeedPresence | null;
  dataThrough: string;
  onDrill: (ask: DrillAsk) => void;
}) {
  const [confidences, setConfidences] = useState<string[]>([]);
  const [tie, setTie] = useState<TieRow[] | null>(null);
  const missing = presence?.missing.includes("dm_spend_daily") ?? true;

  useEffect(() => {
    if (!presence || missing) return;
    let cancelled = false;
    (async () => {
      try {
        const c = (await query("SELECT DISTINCT confidence FROM dm_spend_daily ORDER BY 1")) as { confidence: string }[];
        if (!cancelled) setConfidences(c.map((x) => x.confidence));
        if (!presence.missing.includes("dm_tieout")) {
          const t = (await query(
            "SELECT period, check_id, expected, observed, result, evidence, feed_as_of FROM dm_tieout WHERE stage = 'spend' ORDER BY period DESC, check_id"
          )) as unknown as TieRow[];
          if (!cancelled) setTie(t);
        } else if (!cancelled) setTie([]);
      } catch {
        if (!cancelled) setTie([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presence, missing]);

  const extra: ViewFilter[] = [
    ...(period ? [{ dimKey: "period", op: "in" as const, values: [period] }] : []),
    ...(market ? [{ dimKey: "market", op: "in" as const, values: [market] }] : []),
  ];
  const resolve = (id: string, withExtra = extra) => (map && templates[id] ? resolveTemplate(templates[id], "spend", map, { extraFilters: withExtra }) : null);
  const chart = resolve("spend-by-owner-and-market");
  const table = resolve("spend-by-platform-account-campaign");
  const tools = resolve("spend-tools-and-retainers");
  const cross = resolve("spend-by-month-and-owner", market ? [{ dimKey: "market", op: "in", values: [market] }] : []);
  const filters = { period: period ?? undefined, market };
  const meta = { period: period ?? "all months", filters, dataThrough, confidence: confidences.length ? confidences.join(", ") : "not read", nullReason: () => "no spend rows for this slice" };
  const q = { dataThrough, confidence: confidences.length ? confidences.join(", ") : "loading", verdict: tie === null ? "tie-out loading" : tie.some((t) => t.result === "FAIL") ? "cross-foot FAIL on at least one month" : tie.length ? "cross-foot PASS" : "no cross-foot rows published" };
  const source = findSource("dm_spend")!;

  const panel = (res: ReturnType<typeof resolve>, id: string, title: string, chartMode = false) => (
    <PanelFrame
      id={id}
      title={title}
      qualifiers={q}
      exportSlice={res?.kind === "view" ? () => exportPivot(res.view, meta) : undefined}
    >
      {missing ? (
        <Reason text="Spend data is not loaded yet" tone="bad" />
      ) : !res ? (
        <Reason text="This panel did not load" tone="bad" />
      ) : res.kind !== "view" ? (
        <Reason text={res.kind === "invalid" ? res.errors.join("; ") : res.reason} tone="bad" />
      ) : chartMode ? (
        <ChartPanel view={res.view} state={null} />
      ) : (
        <PivotPanel source={source} slice={sliceOf(res.view)} state={null} onDrill={(cellDims, measureKey, cellValue) => onDrill({ sourceKey: "dm_spend", cellDims, measureKey, cellValue, filters: res.view.filters })} />
      )}
    </PanelFrame>
  );

  return (
    <div className="space-y-3" id="spend">
      {panel(chart, "spend-owner-market", "Paid and social spend: in-house vs vendor, by market (fees as a segment)", true)}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {panel(table, "spend-platform-account-campaign", "By platform, account and campaign, with basis and confidence")}
        {panel(tools, "spend-tools", "Tools and retainers (third line, outside the ad split)")}
      </div>
      <PanelFrame id="spend-crossfoot" title="Spend by owner against the total, per month" qualifiers={q} exportSlice={cross?.kind === "view" ? () => exportPivot(cross.view, meta) : undefined}>
        {missing ? (
          <Reason text="Spend data is not loaded yet" tone="bad" />
        ) : cross?.kind === "view" ? (
          <PivotPanel source={source} slice={sliceOf(cross.view)} state={null} onDrill={(cellDims, measureKey, cellValue) => onDrill({ sourceKey: "dm_spend", cellDims, measureKey, cellValue, filters: cross.view.filters })} />
        ) : (
          <Reason text="cross-foot template did not resolve" tone="bad" />
        )}
        <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Does each month add up?</div>
        {tie === null ? (
          <Reason text="Reading the checks" tone="muted" />
        ) : (
          <RowsTable
            columns={[
              { key: "period", label: "Month" },
              { key: "result", label: "Result" },
              { key: "expected", label: "Total", align: "right" },
              { key: "observed", label: "Bucket sum", align: "right" },
              { key: "evidence", label: "Evidence" },
              { key: "feed_as_of", label: "As of" },
            ]}
            rows={tie.map((t) => ({
              ...t,
              // the tie-out stores the bucket total and the feed total in cents; the row-count check stays a count
              expected: t.expected === null ? null : t.check_id === "spend.bucket_total" ? fmt(Number(t.expected) / 100, "dollars") : fmt(Number(t.expected), "count"),
              observed: t.observed === null ? null : t.check_id === "spend.bucket_total" ? fmt(Number(t.observed) / 100, "dollars") : fmt(Number(t.observed), "count"),
              period: t.period || "every month",
              feed_as_of: t.feed_as_of || "",
            }))}
            reasonFor={() => "not published"}
          />
        )}
      </PanelFrame>
    </div>
  );
}
