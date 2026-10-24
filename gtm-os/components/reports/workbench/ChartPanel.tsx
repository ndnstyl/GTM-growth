"use client";

// ChartPanel: the engine seam. THIS component owns the data:
// it runs the SAME buildPivot statements the table lane runs (single-definition
// gate (a withheld cell never reaches an engine as a number), and hands pure
// arrays to the selected engine adapter. The issued SQL is quoted on the
// surface: the bake-off PASS/FAIL is "renders only pivotSql-computed data,

import { useEffect, useMemo, useState } from "react";
import { query } from "@/lib/reports/duck";
import { buildPivot, dateWhereFor, type ViewSlice } from "@/lib/reports/workbench/pivotSql";
import { findSource } from "@/lib/reports/workbench/sources";
import type { View } from "@/lib/reports/workbench/viewSchema";
import { PIE_MAX_CATEGORIES, type ChartSpec, type ChartDatum, type ChartAdapterProps } from "@/lib/reports/workbench/chartSpec";
import { markersFor, type BatchState } from "@/lib/reports/workbench/markers";
import { ChartTanstack } from "@/components/reports/workbench/engines/ChartTanstack";

type Row = Record<string, unknown>;

export function ChartPanel({
  view,
  state,
  onSelection,
}: {
  view: View;
  state: BatchState | null;
  onSelection?: ChartAdapterProps["onSelection"];
}) {
  const source = findSource(view.sourceKey);
  const spec = view.chartSpec as ChartSpec | undefined;
  const slice: ViewSlice | null = useMemo(() => {
    if (!source) return null;
    return {
      sourceKey: view.sourceKey,
      rows: view.rows,
      cols: [],
      measures: view.measures,
      filters: view.filters,
      dateWhere: dateWhereFor(view.datePreset, source.dateExpr),
    };
  }, [view, source]);
  const plan = useMemo(() => (source && slice ? buildPivot(source, slice) : null), [source, slice]);
  const pivotStmt = plan?.statements.find((s) => s.id === "pivot");

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the prior chart result at the top of the same effect that re-runs the query.
    setRows(null);
    setError(null);
    if (!pivotStmt) return;
    (async () => {
      try {
        const r = (await query(pivotStmt.sql)) as Row[];
        if (!cancelled) setRows(r);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pivotStmt]);

  if (!source) return <Refusal msg={`source '${view.sourceKey}' is not declared`} />;
  if (!spec) return <Refusal msg="presentation is 'chart' but the view has no chartSpec" />;
  if (plan && plan.refusedMeasures.length && !plan.measureKeys.length) {
    return <Refusal msg={plan.refusedMeasures.map((r) => r.reason).join("; ")} />;
  }
  // [p2-review W5] the CHARTED measure must have survived the grain law: a
  // blank chart with no reason is a silent refusal
  if (plan && !plan.measureKeys.includes(spec.y)) {
    const r = plan.refusedMeasures.find((x) => x.key === spec.y);
    return <Refusal msg={r ? r.reason : `measure '${spec.y}' is not computable on this slice`} />;
  }
  if (plan && spec.y2 && !plan.measureKeys.includes(spec.y2)) {
    const r = plan.refusedMeasures.find((x) => x.key === spec.y2);
    return <Refusal msg={r ? r.reason : `measure '${spec.y2}' is not computable on this slice`} />;
  }
  if (!pivotStmt) return <Refusal msg="no computable statement for this slice" />;
  if (error) return <Refusal msg={`query failed: ${error}`} />;
  if (!rows) return <div className="text-[12.5px] text-muted-foreground">computing…</div>;

  const mMeta = source.measures.find((m) => m.key === spec.y);
  // detail rows only: every GROUPING() tag 0 (subtotals are table furniture)
  const detail = rows.filter((r) => view.rows.every((d) => Number(r[`__g_${d}`]) === 0));

  const data: ChartDatum[] = [];
  const withheldX: { x: string; reason: string }[] = [];
  const mtdX: string[] = [];
  const seenWithheld = new Set<string>();
  const seenMtd = new Set<string>();
  for (const r of detail) {
    const dims: Record<string, string | null> = {};
    for (const d of view.rows) dims[d] = r[d] === null ? null : String(r[d]);
    const ms = mMeta ? markersFor(mMeta, dims, state) : [];
    // [p2-review W8] the SECOND measure's markers gate too: a scatter point
    // is withheld if EITHER coordinate is
    const m2 = spec.y2 ? source.measures.find((mm) => mm.key === spec.y2) : undefined;
    if (m2) ms.push(...markersFor(m2, dims, state));
    const xVal = String(r[spec.x] ?? "");
    const w = ms.find((m) => m.kind === "withheld");
    if (w) {
      // the marker gate: a withheld cell NEVER reaches an engine as a number
      if (!seenWithheld.has(xVal)) {
        seenWithheld.add(xVal);
        withheldX.push({ x: xVal, reason: w.reason });
      }
      continue;
    }
    if (ms.some((m) => m.kind === "mtd") && !seenMtd.has(xVal)) {
      seenMtd.add(xVal);
      mtdX.push(xVal);
    }
    const y = r[spec.y];
    if (y === null || y === undefined) continue;
    const y2raw = spec.y2 ? r[spec.y2] : null;
    if (spec.kind === "scatter" && (y2raw === null || y2raw === undefined)) continue;
    data.push({
      x: xVal,
      y: Number(y),
      y2: y2raw === null || y2raw === undefined ? null : Number(y2raw),
      series: spec.series ? String(r[spec.series] ?? "") : null,
    });
  }

  // composition doctrine, the "only if" half: a pie past
  // five categories misleads: refuse at render, where the true count is known
  if (spec.kind === "pie" || spec.kind === "donut") {
    // [p2-review C3] a composition over a set with withheld members claims
    // 100% of a partial whole: the aggregate-inheritance law applies to the
    // pie's implicit total exactly as it does to a subtotal row
    if (withheldX.length) {
      return (
        <Refusal
          msg={`${spec.kind} refused: ${withheldX.length} member(s) withheld (${withheldX[0].reason}): slice shares over a partial whole would lie; use a bar of the present members instead`}
        />
      );
    }
    if (data.some((d) => d.y < 0)) {
      return <Refusal msg={`${spec.kind} refused: negative values have no slice share; use a bar`} />;
    }
    const cats = new Set(data.map((d) => d.x)).size;
    if (cats > PIE_MAX_CATEGORIES) {
      return (
        <Refusal
          msg={`${spec.kind} refused: ${cats} categories (max ${PIE_MAX_CATEGORIES}): proportions stop being readable; use bar (under ~7 items), bar_h (7-15), or stacked_bar for parts across groups`}
        />
      );
    }
  }

  const m2Meta = spec.y2 ? source.measures.find((m) => m.key === spec.y2) : undefined;
  const adapterProps: ChartAdapterProps = {
    spec,
    data,
    withheldX,
    mtdX,
    format: mMeta?.format ?? "dollars",
    yLabel: mMeta?.label ?? spec.y,
    y2Label: m2Meta?.label ?? spec.y2,
    y2Format: m2Meta?.format,
    onSelection,
  };

  return (
    <div data-testid="chart-tanstack">
      <ChartTanstack {...adapterProps} />
      {withheldX.length > 0 && (
        <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400" data-testid="chart-withheld-note" data-export-note>
          withheld: {withheldX.map((w) => w.x).join(", ")}
          {[...new Set(withheldX.map((w) => w.reason))].map((r, i) => (
            <span key={i} className="block">,  {r}</span>
          ))}
        </div>
      )}
      <details className="mt-2 text-[10.5px] text-muted-foreground">
        <summary className="cursor-pointer">Show the query</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 leading-snug">{pivotStmt.sql}</pre>
      </details>
    </div>
  );
}

function Refusal({ msg }: { msg: string }) {
  return (
    <div className="rounded bg-rose-500/10 p-3 text-[12.5px] text-rose-600 dark:text-rose-400">
      REFUSED: {msg}
    </div>
  );
}
