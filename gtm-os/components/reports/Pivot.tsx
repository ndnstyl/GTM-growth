"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download, Save } from "lucide-react";
import { query } from "@/lib/reports/duck";
import { PIVOT_SOURCES, findSource, PivotDim } from "@/lib/reports/sql/_pivot_sources";
import { DatePreset, FilterState } from "@/components/reports/FilterBar";

type SavedView = {
  name: string;
  sourceKey: string;
  rowKeys: string[];
  colKey: string;
  measureKeys: string[];
};

const STORAGE_KEY = "gtm_reports_pivot_saved_views_v1";

// Some published parquet files store date columns as VARCHAR rather than a
// native DATE type (contract-typed, but not every producer casts on write),
// so the comparison side is always TRY_CAST'd to DATE here too.
function presetToDateSql(dateExprRaw: string, preset: DatePreset): string {
  const dateExpr = `TRY_CAST(${dateExprRaw} AS DATE)`;
  const d = (expr: string) => `CAST(${expr} AS DATE)`;
  switch (preset) {
    case "yesterday":
      return `${dateExpr} = current_date - INTERVAL 1 DAY`;
    case "wtd":
      return `${dateExpr} >= ${d("date_trunc('week', current_date)")} AND ${dateExpr} <= current_date`;
    case "mtd":
      return `${dateExpr} >= ${d("date_trunc('month', current_date)")} AND ${dateExpr} <= current_date`;
    case "last7":
      return `${dateExpr} >= current_date - INTERVAL 7 DAY AND ${dateExpr} < current_date`;
    case "last28":
      return `${dateExpr} >= current_date - INTERVAL 28 DAY AND ${dateExpr} < current_date`;
    case "mom":
      return `${dateExpr} >= ${d("date_trunc('month', current_date - INTERVAL 1 MONTH)")} AND ${dateExpr} < ${d("date_trunc('month', current_date)")}`;
    case "ytd":
      return `${dateExpr} >= ${d("date_trunc('year', current_date)")} AND ${dateExpr} <= current_date`;
    default:
      return "1=1";
  }
}

const PLATFORM_NAME: Record<string, string> = { google_ads: "Google Ads", meta: "Meta", microsoft_ads: "Microsoft Ads", offline: "Offline", non_media: "Other" };
function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const s = String(v);
  return PLATFORM_NAME[s] ?? s;
}

function confidenceLabel(rank: number | null): { text: string; cls: string } {
  if (rank === null || Number.isNaN(rank)) return { text: "n/a", cls: "bg-secondary text-muted-foreground" };
  if (rank >= 4) return { text: "deterministic", cls: "bg-[var(--good)]/15 text-[var(--good)]" };
  if (rank === 3) return { text: "mapped", cls: "bg-[var(--warn)]/15 text-[var(--warn)]" };
  if (rank === 2) return { text: "provisional", cls: "bg-[var(--warn)]/15 text-[var(--warn)]" };
  return { text: "unavailable", cls: "bg-[var(--crit)]/15 text-[var(--crit)]" };
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(esc).join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(r[c])).join(","));
  return lines.join("\n");
}

// Lays grouped tuples (row dims + one column dim + measures) out as a grid.
// Cell = the tuple's measure value; a missing tuple stays null (rendered
// blank). No arithmetic happens here; every number came out of DuckDB.
function crossTab(
  tuples: Record<string, unknown>[],
  rowKeys: string[],
  colKey: string,
  measureKeys: string[]
): { rows: Record<string, unknown>[]; cols: string[] } {
  const colValues: string[] = [];
  const seenCol = new Set<string>();
  for (const t of tuples) {
    const cv = t[colKey] === null || t[colKey] === undefined ? "(null)" : String(t[colKey]);
    if (!seenCol.has(cv)) {
      seenCol.add(cv);
      colValues.push(cv);
    }
  }
  const cellKey = (cv: string, m: string) => (measureKeys.length > 1 ? `${cv} · ${m}` : cv);
  const byRow = new Map<string, Record<string, unknown>>();
  for (const t of tuples) {
    const rk = rowKeys.map((k) => String(t[k] ?? "")).join("\u0001");
    let row = byRow.get(rk);
    if (!row) {
      row = {};
      for (const k of rowKeys) row[k] = t[k];
      for (const cv of colValues) for (const m of measureKeys) row[cellKey(cv, m)] = null;
      row.__conf_rank = t.__conf_rank;
      byRow.set(rk, row);
    }
    const cv = t[colKey] === null || t[colKey] === undefined ? "(null)" : String(t[colKey]);
    for (const m of measureKeys) row[cellKey(cv, m)] = t[m];
    const r = typeof t.__conf_rank === "number" ? (t.__conf_rank as number) : null;
    const cur = typeof row.__conf_rank === "number" ? (row.__conf_rank as number) : null;
    if (r !== null && (cur === null || r < cur)) row.__conf_rank = r;
  }
  const cols = [...rowKeys, ...colValues.flatMap((cv) => measureKeys.map((m) => cellKey(cv, m)))];
  return { rows: Array.from(byRow.values()), cols };
}

export function Pivot({
  ready,
  filters,
}: {
  ready: boolean;
  filters: FilterState;
}) {
  const [sourceKey, setSourceKey] = useState(PIVOT_SOURCES[0].key);
  const source = useMemo(() => findSource(sourceKey)!, [sourceKey]);

  const [rowKeys, setRowKeys] = useState<string[]>([]);
  const [colKey, setColKey] = useState<string>("");
  const [measureKeys, setMeasureKeys] = useState<string[]>([]);

  const [sql, setSql] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [resultCols, setResultCols] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveName, setSaveName] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets pivot selection when the user picks a new source; source is chosen inline (no parent to key by), so remount-by-key does not apply here.
    setRowKeys(source.dims.some((d) => d.key === "platform") ? ["platform"] : source.dims.slice(0, 1).map((d) => d.key));
    setColKey("");
    setMeasureKeys(source.measures.slice(0, 1).map((m) => m.key));
    setRows(null);
    setResultCols([]);
    setRunError(null);
  }, [source]);

  // Explore answers on selection, not on a button: any change to the source,
  // the dims, the measures or the date window re-runs the query (D7:
  // the tab read as "no data" because nothing rendered until Run was clicked).
  const selectionKey = `${sourceKey}|${rowKeys.join(",")}|${colKey}|${measureKeys.join(",")}|${filters.preset}`;
  useEffect(() => {
    if (!ready || measureKeys.length === 0) return;
    const handle = window.setTimeout(() => {
      void run();
    }, 150);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectionKey is the full dependency set, run is stable per render
  }, [ready, selectionKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe read: localStorage cannot be read during the prerendered static export, only after mount.
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {
      setSavedViews([]);
    }
  }, []);

  function persistSavedViews(views: SavedView[]) {
    setSavedViews(views);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    } catch {
      // localStorage unavailable; saved views are session-only
    }
  }

  function dimByKey(key: string): PivotDim | undefined {
    return source.dims.find((d) => d.key === key);
  }

  function buildSql(): string {
    const rowDims = rowKeys.map((k) => dimByKey(k)).filter(Boolean) as PivotDim[];
    const colDim = colKey ? dimByKey(colKey) : undefined;
    const measures = source.measures.filter((m) => measureKeys.includes(m.key));
    const where = [presetToDateSql(source.dateExpr, filters.preset)];
    const confExpr = `${source.confidenceExpr}`;

    // Cross-tab: the column dim is grouped like any other dim and the client
    // lays the grid out from the grouped tuples. DuckDB's PIVOT statement was
    // used here before and failed on EVERY column choice in the shipped WASM
    // engine ("PIVOT expression cannot contain qualified columns": the USING
    // clause re-aggregated `s.amount_cents` outside the subquery that owned
    // the alias), which is why Explore returned nothing with a Column set
    //. Laying out from tuples also never adds
    // numbers on the client, so derived measures (ratios) stay honest.
    const dims = colDim ? [...rowDims, colDim] : rowDims;
    const selectCols = [
      ...dims.map((d) => `${d.expr} AS ${d.key}`),
      ...measures.map((m) => `${m.expr} AS ${m.key}`),
      `MIN(${confExpr}) AS __conf_rank`,
    ];
    const groupBy = dims.length > 0 ? `GROUP BY ${dims.map((d) => d.expr).join(", ")}` : "";
    const orderBy = dims.length > 0 ? dims.map((_, i) => String(i + 1)).join(", ") : "1";
    return `SELECT ${selectCols.join(",\n  ")}
FROM ${source.from}
WHERE ${where.join(" AND ")}
${groupBy}
ORDER BY ${orderBy}`;
  }

  async function run() {
    setRunning(true);
    setRunError(null);
    const generated = buildSql();
    setSql(generated);
    try {
      const res = await query(generated);
      const laid = colKey ? crossTab(res, rowKeys, colKey, measureKeys) : { rows: res, cols: res.length > 0 ? Object.keys(res[0]).filter((c) => c !== "__conf_rank") : [] };
      setRows(laid.rows);
      setResultCols(laid.cols);
    } catch (e) {
      setRows(null);
      setResultCols([]);
      setRunError(String(e));
    } finally {
      setRunning(false);
    }
  }

  function toggleRow(key: string) {
    setRowKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  }

  function toggleMeasure(key: string) {
    setMeasureKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function downloadCsv() {
    if (!rows) return;
    const csv = toCsv(rows, resultCols);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pivot_${source.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveView() {
    if (!saveName.trim()) return;
    const view: SavedView = { name: saveName.trim(), sourceKey, rowKeys, colKey, measureKeys };
    persistSavedViews([...savedViews.filter((v) => v.name !== view.name), view]);
    setSaveName("");
  }

  function loadView(v: SavedView) {
    setSourceKey(v.sourceKey);
    setRowKeys(v.rowKeys);
    setColKey(v.colKey);
    setMeasureKeys(v.measureKeys);
  }

  const totals = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const t: Record<string, number> = {};
    for (const c of resultCols) {
      if (rowKeys.includes(c) || c === colKey) continue;
      const isNumeric = rows.every((r) => typeof r[c] === "number" || r[c] === null);
      if (!isNumeric) continue;
      t[c] = rows.reduce((acc, r) => acc + (typeof r[c] === "number" ? (r[c] as number) : 0), 0);
    }
    return t;
  }, [rows, resultCols, rowKeys, colKey]);

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
        <div>
          <div className="mb-1 text-[12px] font-semibold text-[var(--ink2)]">Source</div>
          <select
            aria-label="Source"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
          >
            {PIVOT_SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1 text-[12px] font-semibold text-[var(--ink2)]">Rows (up to 3)</div>
          <div className="flex flex-wrap gap-1">
            {source.dims.map((d) => (
              <button
                key={d.key}
                onClick={() => toggleRow(d.key)}
                className={
                  "rounded px-2 py-1 text-[12px] " +
                  (rowKeys.includes(d.key)
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground")
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[12px] font-semibold text-[var(--ink2)]">Column (0-1)</div>
          <select
            aria-label="Column"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
            value={colKey}
            onChange={(e) => setColKey(e.target.value)}
          >
            <option value="">none</option>
            {source.dims
              .filter((d) => !rowKeys.includes(d.key))
              .map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
          </select>
        </div>

        <div>
          <div className="mb-1 text-[12px] font-semibold text-[var(--ink2)]">Measures</div>
          <div className="flex flex-wrap gap-1">
            {source.measures.map((m) => (
              <button
                key={m.key}
                onClick={() => toggleMeasure(m.key)}
                className={
                  "rounded px-2 py-1 text-[12px] " +
                  (measureKeys.includes(m.key)
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={!ready || running || measureKeys.length === 0}
          className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {running ? "Running..." : "Re-run"}
        </button>
        <button
          onClick={() => setShowSql((s) => !s)}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showSql ? <ChevronDown size={12} /> : <ChevronRight size={12} />} SQL
        </button>
        {rows && (
          <button
            onClick={downloadCsv}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Download size={12} /> CSV
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="save view as..."
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
          />
          <button
            onClick={saveView}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Save size={12} /> Save
          </button>
        </div>
      </div>

      {savedViews.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {savedViews.map((v) => (
            <button
              key={v.name}
              onClick={() => loadView(v)}
              className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {showSql && sql && (
        <div className="relative rounded-xl border border-border bg-card p-3">
          <button
            onClick={() => navigator.clipboard.writeText(sql)}
            className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
          >
            <Copy size={11} /> Copy
          </button>
          <pre className="overflow-x-auto whitespace-pre-wrap text-[11.5px]">{sql}</pre>
        </div>
      )}

      {runError && <div className="text-[var(--crit)]">{runError}</div>}

      {rows && rows.length === 0 && !runError && (
        <div className="rounded-xl border border-border bg-card p-3 text-[13px] text-muted-foreground">
          0 rows for {source.label} in the {filters.preset.toUpperCase()} window. The feed is registered and the query ran;
          the window holds no rows for this source (try Last 28 or MoM).
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 bg-secondary">
              <tr>
                {resultCols.map((c) => (
                  <th key={c} className="border-b border-border px-2 py-1.5 text-left font-semibold">
                    {PLATFORM_NAME[c] ?? c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                return (
                  <tr key={i} className="odd:bg-transparent even:bg-secondary/30">
                    {resultCols.map((c) => (
                      <td key={c} className="border-b border-border px-2 py-1">
                        {fmtCell(r[c])}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {totals && (
                <tr className="font-semibold">
                  {resultCols.map((c, i) => (
                    <td key={c} className="border-t-2 border-border px-2 py-1">
                      {i === 0 ? "Total" : totals[c] !== undefined ? fmtCell(totals[c]) : ""}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}
