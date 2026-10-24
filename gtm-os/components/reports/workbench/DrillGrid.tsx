"use client";

// DrillGrid + DrillPanel + RecordView.
// TanStack Table + Virtual over the declared row feed; the reconciliation
// line compares the cell's DuckDB value to the row set's DuckDB SUM and
// renders an ERROR naming both numbers on any mismatch: never a silent
// best-effort grid. rowCount always displays. A row opens its RecordView.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { query } from "@/lib/reports/duck";
import { buildDrill, type DrillOutcome, type DrillRequest } from "@/lib/reports/workbench/drill";
import type { DeclaredSource } from "@/lib/reports/workbench/sources";
import { markersFor, type BatchState, type Marker } from "@/lib/reports/workbench/markers";
import { MarkerChips } from "@/components/reports/workbench/PivotPanel";

type Row = Record<string, unknown>;

export function RecordView({
  source,
  row,
  onClose,
}: {
  source: DeclaredSource;
  row: Row;
  onClose: () => void;
}) {
  const fields = source.drill?.recordFields ?? [];
  const title = source.drill ? String(row[source.drill.recordTitle] ?? "record") : "record";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
        data-testid="record-view"
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-bold">{title}</div>
          <button className="text-[12px] text-muted-foreground hover:underline" onClick={onClose}>
            close
          </button>
        </div>
        <table className="w-full text-[12.5px]">
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className="border-b border-border/40 last:border-0">
                <td className="py-1 pr-3 text-muted-foreground">{f.label}</td>
                <td className="py-1 text-right tabular-nums">{String(row[f.key] ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[10px] text-muted-foreground">
          fields limited to the declared row feed (tier enumeration): nothing else is reachable
        </div>
      </div>
    </div>
  );
}

export function DrillPanel({
  source,
  batch,
  cellDims,
  measureKey,
  cellValue,
  state,
  viewBounds,
  onClose,
}: {
  source: DeclaredSource;
  batch: string;
  cellDims: Record<string, string | null>;
  measureKey: string;
  cellValue: number;
  state: BatchState | null;
  viewBounds?: DrillRequest["viewBounds"];
  onClose: () => void;
}) {
  const cellMarkers: Marker[] = useMemo(() => {
    if (!state) return [];
    const m = source.measures.find((x) => x.key === measureKey);
    return m ? markersFor(m, cellDims, state) : [];
  }, [source, cellDims, measureKey, state]);

  const outcome: DrillOutcome = useMemo(
    () => buildDrill({ source, cellDims, measureKey, cellValue, viewBounds }, cellMarkers),
    [source, cellDims, measureKey, cellValue, cellMarkers, viewBounds]
  );
  const [batchMismatch, setBatchMismatch] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [record, setRecord] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // must never render under cell B's header
    setBatchMismatch(null);
    setRows(null);
    setActual(null);
    setRecord(null);
    setError(null);
    if (outcome.kind !== "statements") return;
    let cancelled = false;
    (async () => {
      try {
        const bc = (await query(outcome.batchCheck.sql)) as Row[];
        const agg = String(bc[0]?.agg_batch ?? "");
        const row = String(bc[0]?.row_batch ?? "");
        if (agg !== row) {
          if (!cancelled)
            setBatchMismatch(
              `drill unavailable: feeds carry DIFFERENT export batches (aggregate: ${agg || "unstamped"}, rows: ${row || "unstamped"}); a mixed-batch directory cannot be reconciled honestly`
            );
          return;
        }
        const [r, rec] = await Promise.all([
          query(outcome.statements.rowsSql),
          query(outcome.statements.reconcileSql),
        ]);
        if (cancelled) return;
        setRows(r as Row[]);
        setActual(Number((rec as Row[])[0]?.actual ?? NaN));
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [outcome]);

  const fields = useMemo(() => source.drill?.recordFields ?? [], [source]);
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      fields.map((f) => ({
        accessorKey: f.key,
        header: f.label,
        cell: (info) => String(info.getValue() ?? ""),
      })),
    [fields]
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  const exact = actual !== null && Math.abs(actual - cellValue) < 0.005;

  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid="drill-panel">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-bold">
          Drill: {measureKey} @{" "}
          {Object.entries(cellDims)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => `${k}=${v}`)
            .join(" · ") || "grand total"}
          <span className="ml-2 text-[10px] font-normal text-muted-foreground">batch {batch}</span>
        </div>
        <button className="text-[12px] text-muted-foreground hover:underline" onClick={onClose}>
          close
        </button>
      </div>

      {outcome.kind === "refused" && (
        <div className="rounded bg-rose-500/10 p-3 text-[12.5px] text-rose-600 dark:text-rose-400">
          DRILL REFUSED: {outcome.reason}
          <MarkerChips markers={outcome.markers} />
        </div>
      )}
      {outcome.kind === "unavailable" && (
        <div className="rounded bg-amber-500/10 p-3 text-[12.5px] text-amber-700 dark:text-amber-400">
          {outcome.reason}
        </div>
      )}
      {outcome.kind === "statements" && batchMismatch && (
        <div className="rounded bg-amber-500/10 p-3 text-[12.5px] text-amber-700 dark:text-amber-400" data-testid="batch-mismatch">
          {batchMismatch}
        </div>
      )}
      {outcome.kind === "statements" && !batchMismatch && (
        <>
          {error && <div className="text-[12.5px] text-rose-600 dark:text-rose-400">query failed: {error}</div>}
          {rows && actual !== null && (
            <div
              className={
                "mb-2 rounded px-2 py-1 text-[12px] font-semibold " +
                (exact
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-400")
              }
              data-testid="reconciliation"
            >
              {exact
                ? `reconciles exactly: rows sum to ${actual.toLocaleString()} == cell ${cellValue.toLocaleString()} · ${rows.length.toLocaleString()} rows`
                : `RECONCILIATION ERROR: rows sum to ${actual.toLocaleString()} but the cell says ${cellValue.toLocaleString()} (${rows.length.toLocaleString()} rows). One of these is wrong; do not trust either until resolved.`}
            </div>
          )}
          <div ref={parentRef} className="max-h-80 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-card">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border text-left text-[10.5px] uppercase text-muted-foreground">
                    {hg.headers.map((h) => (
                      <th key={h.id} className="cursor-pointer py-1 pr-3" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody style={{ height: virtualizer.getTotalSize() }} className="relative">
                {virtualizer.getVirtualItems().map((vi) => {
                  const row = tableRows[vi.index];
                  return (
                    <tr
                      key={row.id}
                      className="absolute left-0 top-0 w-full cursor-pointer border-b border-border/30 hover:bg-muted/40"
                      style={{ transform: `translateY(${vi.start}px)` }}
                      onClick={() => setRecord(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="py-1 pr-3 tabular-nums">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows && (
            <div className="mt-1 text-[10.5px] text-muted-foreground">
              {rows.length.toLocaleString()} rows · click a row for its record view
            </div>
          )}
        </>
      )}
      {record && <RecordView source={source} row={record} onClose={() => setRecord(null)} />}
    </div>
  );
}
