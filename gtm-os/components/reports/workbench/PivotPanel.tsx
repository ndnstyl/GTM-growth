"use client";

// PivotPanel: renders the tuples pivotSql/DuckDB computed.
// Layout ONLY: this component maps rows to a cross-tab grid and never adds a
// number. Grain refusals and withheld measures render their reasons; every
// cell and every aggregate row carries its markers, and an aggregate over a
// withheld member REFUSES [conv R4, r2 R-H6].

import { useEffect, useMemo, useState } from "react";
import { query } from "@/lib/reports/duck";
import { buildPivot, type PivotPlan, type ViewSlice } from "@/lib/reports/workbench/pivotSql";
import type { DeclaredSource } from "@/lib/reports/workbench/sources";
import {
  inheritMarkers,
  markersFor,
  type BatchState,
  type Marker,
} from "@/lib/reports/workbench/markers";
import { moneyDollars, count as formatCount, UNAVAILABLE } from "@/lib/reports/format";

type Row = Record<string, unknown>;

export function fmt(v: unknown, format: string): string {
  if (v === null || v === undefined) return UNAVAILABLE;
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (format === "dollars") return moneyDollars(n);
  // pivot pct measures are already percent-scale (e.g. 12.3), not a 0-1
  // fraction, so this is NOT the shared format.ts pct (which expects a
  // fraction): same unit as before this consolidation.
  if (format === "pct") return n.toFixed(2) + "%";
  return formatCount(n);
}

export function MarkerChips({ markers: all }: { markers: Marker[] }) {
  // method notes are TABLE-LEVEL context: rendered once as the permanent
  // footnote, never as a per-cell chip (five chips per cell is clutter that
  const markers = all.filter((m) => m.kind !== "method-note");
  if (!markers.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {markers.map((m, i) => (
        <span
          key={i}
          title={m.reason}
          className={
            "rounded px-1 py-0.5 text-[9px] font-bold uppercase " +
            (m.kind === "withheld"
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400")
          }
        >
          {m.kind}
        </span>
      ))}
    </span>
  );
}

export function PivotPanel({
  source,
  slice,
  state,
  onDrill,
}: {
  source: DeclaredSource;
  slice: ViewSlice;
  state: BatchState | null;
  onDrill?: (cellDims: Record<string, string | null>, measureKey: string, cellValue: number) => void;
}) {
  const plan: PivotPlan = useMemo(() => buildPivot(source, slice), [source, slice]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the prior pivot result at the top of the same effect that re-runs the query.
    setRows(null);
    setError(null);
    (async () => {
      try {
        const pivotStmt = plan.statements.find((s) => s.id === "pivot");
        if (!pivotStmt) return;
        const result = await query(pivotStmt.sql);
        if (!cancelled) setRows(result as Row[]);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan]);

  const colDomain = useMemo(() => {
    if (!plan.colDim || !rows) return null;
    const values = new Set<string>();
    for (const r of rows) {
      const g = Number(r[`__g_${plan.colDim}`]);
      if (g === 0 && r[plan.colDim] !== null) values.add(String(r[plan.colDim]));
    }
    return [...values].sort();
  }, [rows, plan]);

  if (plan.refusedMeasures.length && !plan.measureKeys.length) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-[12.5px] text-rose-600 dark:text-rose-400">
        {plan.refusedMeasures.map((r) => (
          <div key={r.key}>REFUSED: {r.reason}</div>
        ))}
      </div>
    );
  }
  if (error) {
    return <div className="p-3 text-[12.5px] text-rose-600 dark:text-rose-400">query failed: {error}</div>;
  }
  if (!rows) return <div className="p-3 text-[12.5px] text-muted-foreground">computing…</div>;

  const measureOf = (key: string) => source.measures.find((m) => m.key === key)!;

  const dimsOf = (r: Row): Record<string, string | null> => {
    const dims: Record<string, string | null> = {};
    for (const d of plan.rowDims) dims[d] = r[d] === null ? null : String(r[d]);
    if (plan.colDim) dims[plan.colDim] = r[plan.colDim] === null ? null : String(r[plan.colDim]);
    return dims;
  };
  const measureMarkers = (r: Row, mk: string): Marker[] =>
    markersFor(measureOf(mk), dimsOf(r), state);
  const cellMarkers = (r: Row): Marker[] =>
    plan.measureKeys.flatMap((mk) => measureMarkers(r, mk));
  const isWithheld = (ms: Marker[]) => ms.some((m) => m.kind === "withheld");
  const WithheldCell = ({ ms }: { ms: Marker[] }) => (
    <span
      title={ms.find((m) => m.kind === "withheld")?.reason}
      className="text-rose-600 dark:text-rose-400"
      data-testid="withheld-cell"
    >
      withheld
    </span>
  );

  // group returned tuples by grouping tags
  const isCell = (r: Row) =>
    plan.rowDims.every((d) => Number(r[`__g_${d}`]) === 0) &&
    (!plan.colDim || Number(r[`__g_${plan.colDim}`]) === 0);
  const isRowSubtotal = (r: Row) =>
    plan.colDim !== null &&
    plan.rowDims.every((d) => Number(r[`__g_${d}`]) === 0) &&
    Number(r[`__g_${plan.colDim}`]) === 1;
  const isGrand = (r: Row) =>
    plan.rowDims.every((d) => Number(r[`__g_${d}`]) === 1) &&
    (!plan.colDim || Number(r[`__g_${plan.colDim}`]) === 1);

  const cells = rows.filter(isCell);
  const subtotals = rows.filter(isRowSubtotal);
  const grand = rows.find(isGrand) ?? null;

  // simple layout: no column dim → flat table; column dim → cross-tab per first measure
  const mk = plan.measureKeys[0];

  const rowKeyOf = (r: Row) => plan.rowDims.map((d) => String(r[d])).join("␟");
  const rowKeys = [...new Set((plan.colDim ? subtotals : cells).map(rowKeyOf))];

  const cellFor = (rowKey: string, col: string): Row | undefined =>
    cells.find((r) => rowKeyOf(r) === rowKey && String(r[plan.colDim!]) === col);

  const aggregateRow = (label: string, r: Row) => {
    // lookup matched nothing and left the most-read number unmarked
    const members =
      label === "grand"
        ? cells.map((cr) => cellMarkers(cr))
        : plan.colDim
          ? (colDomain ?? []).map((c) => cellFor(rowKeyOf(r), c)).filter(Boolean).map((cr) => cellMarkers(cr as Row))
          : [cellMarkers(r)];
    const { markers, refused } = inheritMarkers(members);
    return { label, r, markers, refused };
  };

  return (
    <div className="overflow-x-auto">
      {plan.refusedMeasures.map((rm) => (
        <div key={rm.key} className="mb-2 rounded bg-rose-500/10 px-2 py-1 text-[11.5px] text-rose-600 dark:text-rose-400">
          {rm.key}: REFUSED: {rm.reason}
        </div>
      ))}
      <table className="w-full text-[12.5px]" data-testid="pivot-grid">
        <thead>
          <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
            {plan.rowDims.map((d) => (
              <th key={d} className="py-1 pr-3">{source.dims.find((x) => x.key === d)?.label}</th>
            ))}
            {plan.colDim && colDomain
              ? colDomain.map((c) => <th key={c} className="py-1 pr-3 text-right">{c}</th>)
              : plan.measureKeys.map((k) => (
                  <th key={k} className="py-1 pr-3 text-right">{measureOf(k).label}</th>
                ))}
            {plan.colDim && <th className="py-1 pr-3 text-right font-bold">Total</th>}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk) => {
            const base = (plan.colDim ? subtotals : cells).find((r) => rowKeyOf(r) === rk)!;
            const agg = plan.colDim ? aggregateRow("subtotal", base) : null;
            return (
              <tr key={rk} className="border-b border-border/40">
                {plan.rowDims.map((d) => (
                  <td key={d} className="py-1 pr-3">{String(base[d])}</td>
                ))}
                {plan.colDim && colDomain
                  ? colDomain.map((c) => {
                      const cr = cellFor(rk, c);
                      const v = cr?.[mk];
                      const cms = cr ? measureMarkers(cr, mk) : [];
                      if (cr && isWithheld(cms)) {
                        return (
                          <td key={c} className="py-1 pr-3 text-right">
                            <WithheldCell ms={cms} />
                          </td>
                        );
                      }
                      return (
                        <td key={c} className="py-1 pr-3 text-right tabular-nums">
                          {cr && v !== null && v !== undefined ? (
                            <button
                              className="underline-offset-2 hover:underline"
                              onClick={() =>
                                onDrill?.(
                                  Object.fromEntries([
                                    ...plan.rowDims.map((d) => [d, String(cr[d])]),
                                    [plan.colDim!, c],
                                  ]),
                                  mk,
                                  Number(v)
                                )
                              }
                            >
                              {fmt(v, measureOf(mk).format)}
                            </button>
                          ) : (
                            ""
                          )}
                          <MarkerChips markers={cms} />
                        </td>
                      );
                    })
                  : plan.measureKeys.map((k) => {
                      const ms = measureMarkers(base, k);
                      return (
                        <td key={k} className="py-1 pr-3 text-right tabular-nums">
                          {isWithheld(ms) ? (
                            <WithheldCell ms={ms} />
                          ) : base[k] === null || base[k] === undefined ? (
                            <span className="text-muted-foreground"></span>
                          ) : (
                            <>
                              <button
                                className="underline-offset-2 hover:underline"
                                onClick={() =>
                                  onDrill?.(
                                    Object.fromEntries(plan.rowDims.map((d) => [d, String(base[d])])),
                                    k,
                                    Number(base[k])
                                  )
                                }
                              >
                                {fmt(base[k], measureOf(k).format)}
                              </button>
                              <MarkerChips markers={ms} />
                            </>
                          )}
                        </td>
                      );
                    })}
                {plan.colDim && agg && (
                  <td className="py-1 pr-3 text-right font-semibold tabular-nums">
                    {agg.refused ? (
                      <span title={agg.refused.reason} className="text-rose-600 dark:text-rose-400">withheld</span>
                    ) : (
                      <>
                        {fmt(base[mk], measureOf(mk).format)}
                        <MarkerChips markers={agg.markers} />
                      </>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {grand && (
            <tr className="border-t-2 border-border font-bold" data-testid="grand-total">
              <td className="py-1 pr-3" colSpan={plan.rowDims.length}>
                Grand total
              </td>
              {(() => {
                const agg = aggregateRow("grand", grand);
                const cols = plan.colDim && colDomain ? colDomain.length + 1 : plan.measureKeys.length;
                if (agg.refused) {
                  return (
                    <td className="py-1 pr-3 text-right text-rose-600 dark:text-rose-400" colSpan={cols}>
                      <span title={agg.refused.reason}>withheld: {agg.refused.reason}</span>
                    </td>
                  );
                }
                return plan.colDim ? (
                  <td className="py-1 pr-3 text-right tabular-nums" colSpan={cols}>
                    {fmt(grand[mk], measureOf(mk).format)}
                    <MarkerChips markers={agg.markers} />
                  </td>
                ) : (
                  plan.measureKeys.map((k) => (
                    <td key={k} className="py-1 pr-3 text-right tabular-nums">
                      {fmt(grand[k], measureOf(k).format)}
                      <MarkerChips markers={agg.markers} />
                    </td>
                  ))
                );
              })()}
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-1 text-[10.5px] text-muted-foreground">
        {cells.length} cells, computed in the browser from the feed
        {plan.colDim && plan.measureKeys.length > 1 && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            cross-tab shows {measureOf(mk).label} only: not shown: {plan.measureKeys.slice(1).map((k) => measureOf(k).label).join(", ")}
          </span>
        )}
      </div>
      {state && state.effective_dates?.length > 0 &&
        plan.measureKeys.some((k) => (measureOf(k).markers ?? []).includes("method_note")) && (
        <div className="mt-1 border-t border-border pt-1 text-[10.5px] text-muted-foreground" data-testid="method-notes">
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
