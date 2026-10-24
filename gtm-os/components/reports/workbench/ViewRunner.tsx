"use client";

// ViewRunner: renders a saved View: plain views through
// PivotPanel; compare views (view 7's growth decomposition) through the
// compare statements DuckDB computes (prior-year join, guarded %, new-revenue
// split, variance, TTM pair: ALL SQL-side). Every canon view ENDS with its
// rendered narrative [conv C15 / r3 quickstart].

import { useEffect, useMemo, useState } from "react";
import { query } from "@/lib/reports/duck";
import { buildPivot, dateWhereFor, type ViewSlice } from "@/lib/reports/workbench/pivotSql";
import { findSource } from "@/lib/reports/workbench/sources";
import type { View } from "@/lib/reports/workbench/viewSchema";
import { markersFor, type BatchState, type Marker } from "@/lib/reports/workbench/markers";
import { MarkerChips, PivotPanel, fmt } from "@/components/reports/workbench/PivotPanel";
import { ChartPanel } from "@/components/reports/workbench/ChartPanel";

type Row = Record<string, unknown>;

function ComparePanel({
  view,
  state,
}: {
  view: View;
  state: BatchState | null;
}) {
  const source = findSource(view.sourceKey)!;
  const slice: ViewSlice = useMemo(
    () => ({
      sourceKey: view.sourceKey,
      rows: view.rows,
      cols: [],
      measures: view.measures,
      filters: view.filters,
      dateWhere: dateWhereFor(view.datePreset, source.dateExpr),
      compare: view.compare,
    }),
    [view, source]
  );
  const plan = useMemo(() => buildPivot(source, slice), [source, slice]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ttm, setTtm] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the prior view result at the top of the same effect that re-runs the query.
    setRows(null);
    setTtm(null);
    (async () => {
      try {
        const prior = plan.statements.find((s) => s.id === "compare-prior-year");
        const ttmStmt = plan.statements.find((s) => s.id === "compare-ttm-pair");
        if (prior) {
          const r = (await query(prior.sql)) as Row[];
          if (!cancelled) setRows(r);
        } else if (!cancelled) {
          setRows([]); // ttm_pair-only view: no prior-year grid [p1-r2 G4]
        }
        if (ttmStmt) {
          const t = (await query(ttmStmt.sql)) as Row[];
          if (!cancelled) setTtm(t[0] ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan]);

  const mk = view.measures[0];
  const mMeta = source.measures.find((x) => x.key === mk);
  const f = (v: unknown) => fmt(v, mMeta?.format ?? "dollars");
  // TTM footer honors the SAME withheld gate as the rows [p1-r2 G1]: company
  // grain = period null, which fails closed in missingPlatforms
  const ttmMarkers: Marker[] = mMeta ? markersFor(mMeta, { period: null }, state) : [];
  const ttmWithheld = ttmMarkers.find((m) => m.kind === "withheld");
  const rowMarkers = (r: Row): Marker[] => {
    const m = source.measures.find((x) => x.key === mk);
    const dims: Record<string, string | null> = {};
    for (const d of view.rows) dims[d] = r[d] === null ? null : String(r[d]);
    return m ? markersFor(m, dims, state) : [];
  };

  if (error) return <div className="text-[12.5px] text-rose-600 dark:text-rose-400">query failed: {error}</div>;
  if (plan.refusedMeasures.length && !plan.measureKeys.length) {
    return (
      <div className="rounded bg-rose-500/10 p-3 text-[12.5px] text-rose-600 dark:text-rose-400">
        {plan.refusedMeasures.map((r) => (
          <div key={r.key}>REFUSED: {r.reason}</div>
        ))}
      </div>
    );
  }
  if (!plan.statements.some((st) => st.id.startsWith("compare-"))) {
    return (
      <div className="text-[12.5px] text-amber-700 dark:text-amber-400">
        no comparison statements for this slice (compare needs the period dim): nothing to compute
      </div>
    );
  }
  if (!rows) return <div className="text-[12.5px] text-muted-foreground">computing comparisons…</div>;
  const isWithheldRow = (ms: Marker[]) => ms.some((m) => m.kind === "withheld");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]" data-testid="compare-grid">
        <thead>
          <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
            {view.rows.map((d) => (
              <th key={d} className="py-1 pr-3">{source.dims.find((x) => x.key === d)?.label}</th>
            ))}
            <th className="py-1 pr-3 text-right">This year</th>
            <th className="py-1 pr-3 text-right">Prior year</th>
            <th className="py-1 pr-3 text-right">Δ{mMeta?.format === "dollars" ? " $" : mMeta?.format === "pct" ? " pts" : ""}</th>
            <th className="py-1 pr-3 text-right">Δ %</th>
            {view.compare?.varianceFlag && <th className="py-1 pr-3">Variance</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isNew = Boolean(r[`${mk}_is_new`]);
            const ms = rowMarkers(r);
            return (
              <tr key={i} className={"border-b border-border/40 " + (isNew ? "bg-amber-500/5" : "")}>
                {view.rows.map((d) => (
                  <td key={d} className="py-1 pr-3">{String(r[d] ?? "")}</td>
                ))}
                {isWithheldRow(ms) ? (
                  <td className="py-1 pr-3 text-right" colSpan={view.compare?.varianceFlag ? 5 : 4}>
                    <span title={ms.find((m) => m.kind === "withheld")?.reason} className="text-rose-600 dark:text-rose-400">
                      withheld
                    </span>
                  </td>
                ) : (
                <>
                <td className="py-1 pr-3 text-right tabular-nums">{f(r[mk])}<MarkerChips markers={ms} /></td>
                <td className="py-1 pr-3 text-right tabular-nums">{isNew ? "no prior year" : f(r[`${mk}_prior`])}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {isNew ? f(r[mk]) : ms.some((x) => x.kind === "mtd") ? (
                    <span className="text-muted-foreground" title="Open month: a month-to-date delta against a FULL prior month misleads [p1-r3 W1]">mtd: withheld</span>
                  ) : f(r[`${mk}_delta_abs`])}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {isNew ? (
                    <span className="font-semibold text-amber-600 dark:text-amber-400" title="No prior-year baseline: reported as NEW revenue, dollars only: never a growth percentage.">
                      NEW
                    </span>
                  ) : ms.some((x) => x.kind === "mtd") ? (
                    <span className="text-muted-foreground" title="Open month: month-to-date vs a FULL prior month is not a growth rate [p1-r2 G6]">mtd: % withheld</span>
                  ) : r[`${mk}_delta_pct`] !== null && r[`${mk}_delta_pct`] !== undefined ? (
                    `${r[`${mk}_delta_pct`]}%`
                  ) : (
                    <span className="text-muted-foreground" title="% refused: no assertable prior baseline">withheld</span>
                  )}
                </td>
                {view.compare?.varianceFlag && (
                  <td className="py-1 pr-3 text-[11px]">{ms.some((x) => x.kind === "mtd") ? "month so far" : String(r[`${mk}_variance`] ?? "")}</td>
                )}
                </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {view.measures.length > 1 && (
        <div className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-400">
          comparison shows {mk} only: not shown: {view.measures.slice(1).join(", ")} [p1-review F4]
        </div>
      )}
      {ttm && ttmWithheld && (
        <div className="mt-2 rounded bg-rose-500/10 px-2 py-1 text-[12px]" data-testid="ttm-pair">
          <span className="font-semibold">TTM (company grain):</span>{" "}
          <span className="text-rose-600 dark:text-rose-400" title={ttmWithheld.reason}>withheld</span>
        </div>
      )}
      {ttm && !ttmWithheld && (
        <div className="mt-2 rounded bg-muted/40 px-2 py-1 text-[12px]" data-testid="ttm-pair">
          <span className="font-semibold">TTM (company grain):</span>{" "}
          {ttm[`${mk}_ttm_now`] !== null && ttm[`${mk}_ttm_now`] !== undefined
            ? f(ttm[`${mk}_ttm_now`])
            : `withheld (${String(ttm[`${mk}_ttm_now_n`] ?? 0)}/12 months)`}{" "}
          vs{" "}
          {ttm[`${mk}_ttm_prior`] !== null && ttm[`${mk}_ttm_prior`] !== undefined
            ? f(ttm[`${mk}_ttm_prior`])
            : `withheld (${String(ttm[`${mk}_ttm_prior_n`] ?? 0)}/12 months)`}{" "}
          prior
          {ttm[`${mk}_ttm_delta_pct`] !== null && ttm[`${mk}_ttm_delta_pct`] !== undefined ? (
            <> ({String(ttm[`${mk}_ttm_delta_pct`])}%)</>
          ) : (
            <span className="text-muted-foreground"> (% withheld: a TTM leg is incomplete)</span>
          )}
        </div>
      )}
      {state && state.effective_dates?.length > 0 && (
        <div className="mt-2 border-t border-border pt-1 text-[10.5px] text-muted-foreground" data-testid="method-notes">
          <span className="font-semibold uppercase">Method notes (permanent):</span>
          <ul className="mt-0.5 list-disc pl-4">
            {state.effective_dates.map((e, i) => (
              <li key={i}>
                {e.ruling === "open" ? "OPEN RULING: " : ""}
                {e.what} {e.ruling === "open" ? `(candidate date ${e.date}, ${e.source})` : `effective ${e.date} (${e.source})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ViewRunner({ view, state }: { view: View; state: BatchState | null }) {
  const source = findSource(view.sourceKey);
  if (!source) {
    return (
      <div className="text-[12.5px] text-rose-600 dark:text-rose-400">
        view {view.id}: source &apos;{view.sourceKey}&apos; is not declared: the view refuses rather than guessing
      </div>
    );
  }
  const slice: ViewSlice = {
    sourceKey: view.sourceKey,
    rows: view.rows,
    cols: view.cols,
    measures: view.measures,
    filters: view.filters,
    dateWhere: dateWhereFor(view.datePreset, source.dateExpr),
  };
  return (
    <div>
      <div className="mb-2">
        <div className="text-[14px] font-bold">{view.name}</div>
        {view.description && <div className="text-[11.5px] text-muted-foreground">{view.description}</div>}
      </div>
      {view.compare ? (
        <ComparePanel view={view} state={state} />
      ) : view.presentation === "chart" ? (
        // engine RATIFIED by the owner 2026-08-28: TanStack Charts (receipts/p2-bakeoff.md)
        <ChartPanel view={view} state={state} />
      ) : (
        <PivotPanel source={source} slice={slice} state={state} />
      )}
      {view.narrative && (
        <p className="mt-3 border-t border-border pt-2 text-[13px] leading-relaxed" data-testid="narrative">
          {view.narrative}
        </p>
      )}
    </div>
  );
}
