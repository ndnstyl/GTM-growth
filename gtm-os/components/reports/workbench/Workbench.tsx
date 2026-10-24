"use client";

// Workbench: the interactive data-surface route.
// Registers the spine batch feeds explicitly, shows the batch identity and
// STALE state, and lets the reader pick source × dims × measures (US1).

import { useEffect, useMemo, useState } from "react";
import { dayLabel } from "@/lib/demo/metrics";
import { registerParquet } from "@/lib/reports/duck";
import { SOURCES, findSource, type DeclaredSource } from "@/lib/reports/workbench/sources";
import { buildPivot, type ViewSlice } from "@/lib/reports/workbench/pivotSql";
import { staleHours, type BatchState } from "@/lib/reports/workbench/markers";
import { PivotPanel } from "@/components/reports/workbench/PivotPanel";
import { DrillPanel } from "@/components/reports/workbench/DrillGrid";
import { BoardRunner } from "@/components/reports/workbench/BoardRunner";
import { loadCanonBoards, loadPersonalBoards, savePersonalBoard, validateBoard, type Board, type ResolvedBoard } from "@/lib/reports/workbench/boardSchema";
import { PageHeader } from "@/components/shell/PageHeader";
import { ViewRunner } from "@/components/reports/workbench/ViewRunner";
import {
  loadCanonViews,
  loadPersonalViews,
  savePersonalView,
  validateView,
  type View,
} from "@/lib/reports/workbench/viewSchema";

type BatchManifest = {
  batch_id: string;
  as_of: string;
  feeds: Record<string, { rows: number; sha256: string }>;
};

const asOfLabel = (iso: string) => dayLabel(iso) + ", " + new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function Workbench() {
  const [ready, setReady] = useState(false);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchManifest | null>(null);
  const [state, setState] = useState<BatchState | null>(null);
  // ?source=<key> deep link
  // The deep link is read in an effect after mount so the first client render matches the prerender.
  const seed = (src: DeclaredSource | undefined) => ({
    rows: src?.dims[0] ? [src.dims[0].key] : [],
    measures: src ? src.measures.slice(0, 2).map((m) => m.key) : [],
  });
  const [sourceKey, setSourceKey] = useState(SOURCES[0]?.key ?? "");
  const source = useMemo(() => findSource(sourceKey), [sourceKey]);
  const [rows, setRows] = useState<string[]>(() => seed(SOURCES[0]).rows);
  const [cols, setCols] = useState<string[]>([]);
  const [measures, setMeasures] = useState<string[]>(() => seed(SOURCES[0]).measures);
  const [drill, setDrill] = useState<{
    cellDims: Record<string, string | null>;
    measureKey: string;
    cellValue: number;
  } | null>(null);
  const [canonViews, setCanonViews] = useState<View[]>([]);
  const [viewErrors, setViewErrors] = useState<string[]>([]);
  const [personal, setPersonal] = useState<View[]>([]);
  const [activeView, setActiveView] = useState<View | null>(null);
  const [canonBoards, setCanonBoards] = useState<ResolvedBoard[]>([]);
  const [personalBoards, setPersonalBoards] = useState<ResolvedBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<ResolvedBoard | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const errors: string[] = [];
      const feedNames = new Set<string>();
      for (const s of SOURCES) {
        for (const f of s.feeds) feedNames.add(JSON.stringify([f.name, f.url]));
        if (s.drill) feedNames.add(JSON.stringify([s.drill.rowFeed, s.drill.rowFeedUrl ?? `/data/reports/${s.drill.rowFeed}.parquet`]));
      }
      for (const nf of feedNames) {
        const [name, url] = JSON.parse(nf) as [string, string];
        const ok = await registerParquet(name, url);
        if (!ok) errors.push(name);
      }
      try {
        const b = await fetch("/data/reports/spine_batch.json", { cache: "no-store" });
        if (b.ok) setBatch((await b.json()) as BatchManifest);
        const st = await fetch("/data/reports/spine_state.json", { cache: "no-store" });
        // marker layer resolves each cell against ITS period
        if (st.ok) setState((await st.json()) as BatchState);
      } catch {
        /* absence renders below as UNAVAILABLE, never a crash */
      }
      const { views, errors: verrs } = await loadCanonViews();
      const { boards, errors: berrs } = await loadCanonBoards(views);
      verrs.push(...berrs);
      const pb = loadPersonalBoards(views);
      verrs.push(...pb.errors);
      if (!cancelled) {
        setCanonViews(views);
        setCanonBoards(boards);
        const want = new URLSearchParams(window.location.search).get("board");
        const hit = boards.find((b) => b.id === want) ?? (want ? undefined : boards.find((b) => b.id === "board-mer") ?? boards[0]);
        if (hit) setActiveBoard(hit);
        setPersonalBoards(pb.boards);
        setViewErrors(verrs);
        setPersonal(loadPersonalViews());
        setFeedErrors(errors);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rows, columns and measures change in the same handler as the source, seeded from that source's own first
  // dimension and measures, so no frame ever pairs one source with another source's selection.
  const pickSource = (key: string) => {
    const next = findSource(key);
    if (!next) return;
    const sd = seed(next);
    setSourceKey(key);
    setRows(sd.rows);
    setCols([]);
    setMeasures(sd.measures);
    setDrill(null);
  };

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("source");
    const next = want ? findSource(want) : undefined;
    if (!next) return;
    const sd = seed(next);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the ?source= deep link once after mount, which keeps hydration identical to the prerender.
    setSourceKey(next.key);
    setRows(sd.rows);
    setMeasures(sd.measures);
  }, []);

  const slice: ViewSlice | null = source
    ? { sourceKey, rows, cols, measures, filters: [] }
    : null;
  const sliceProblem = useMemo(() => {
    if (!source || !slice || rows.length === 0 || measures.length === 0) return null;
    try {
      buildPivot(source, slice);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "This slice cannot be built.";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sourceKey, rows, cols, measures]);

  const age = batch ? staleHours(batch.as_of) : null;

  const toggle = (list: string[], set: (v: string[]) => void, key: string, max?: number) => {
    if (list.includes(key)) set(list.filter((k) => k !== key));
    else set(max && list.length >= max ? [...list.slice(1), key] : [...list, key]);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6" data-testid="workbench-root">
      <PageHeader
        title="Workbench"
        subtitle={batch ? `Slice any feed. Refreshed ${asOfLabel(batch.as_of)}.` : "Slice any feed."}
        actions={
          <>
            <select
              aria-label="Open a saved view"
              className="max-w-[260px] rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
              value={activeView?.id ?? ""}
              onChange={(e) => {
                const v = [...canonViews, ...personal].find((x) => x.id === e.target.value);
                if (v) { setActiveView(v); setActiveBoard(null); setDrill(null); }
              }}
            >
              <option value="">Views ({canonViews.length + personal.length})</option>
              {[...canonViews, ...personal].map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button
              type="button"
              className="rounded-md border border-border px-2.5 py-1.5 text-[12px] text-[var(--ink2)] hover:border-primary hover:text-primary"
              onClick={() => { setActiveView(null); setActiveBoard(null); }}
            >
              Custom slice
            </button>
          </>
        }
      />

      {age !== null && age > 30 && (
        <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-[13px] font-semibold text-[var(--warn)]">
          This data is {Math.round(age)} hours old; a daily refresh was expected.
        </div>
      )}
      {feedErrors.length > 0 && (
        <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-[13px] text-[var(--warn)]">
          Some feeds did not load, so the sources that use them show a refusal, never a zero.
        </div>
      )}

      <div role="tablist" aria-label="Boards" className="flex flex-wrap gap-1 border-b border-border" data-testid="launch-views">
        {[...canonBoards, ...personalBoards].map((b) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={activeBoard?.id === b.id}
            className={
              "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-[13px] font-semibold transition-colors " +
              (activeBoard?.id === b.id ? "border-primary text-primary" : "border-transparent text-[var(--ink2)] hover:text-foreground")
            }
            onClick={() => { setActiveBoard(b); setActiveView(null); setDrill(null); }}
          >
            {b.name.replace(/^Board \d+: /, "")}
          </button>
        ))}
      </div>
      {viewErrors.length > 0 && (
        <div className="text-[12px] text-[var(--crit)]">Some views could not be opened.</div>
      )}

      {activeView ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <ViewRunner view={activeView} state={state} />
        </div>
      ) : null}

      {activeBoard ? (
        <div className="rounded-xl border border-border bg-card p-4" data-testid="board">
          {batch ? (
            <BoardRunner board={activeBoard} state={state} batch={batch.batch_id} />
          ) : (
            <div className="text-[12.5px] text-rose-600 dark:text-rose-400">
              The board is unavailable: the data manifest did not load.
            </div>
          )}
        </div>
      ) : null}

      <div className={"rounded-xl border border-border bg-card p-4" + (activeView ? " opacity-90" : "")}>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <label className="font-semibold">Source</label>
          <select
            aria-label="Source"
            className="rounded border border-border bg-background px-2 py-1"
            value={sourceKey}
            onChange={(e) => pickSource(e.target.value)}
          >
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        {source && !activeView && (
          <div className="mt-2 flex flex-wrap gap-2 text-[11.5px]">
            <button className="rounded border border-border px-2 py-0.5 hover:border-foreground"
              onClick={() => {
                const name = window.prompt("Name this view:");
                if (!name) return;
                const v: View = {
                  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "my-view",
                  name, sourceKey, rows, cols, measures, filters: [],
                  // save the question the SCREEN shows [p1-review F6]: the
                  // custom slice has no date filter, so the saved view says so
                  datePreset: "all", presentation: "table",
                  origin: "personal", created_by: "local", created_at: new Date().toISOString(),
                };
                const r = validateView(v);
                if (!r.ok) { window.alert("refused: " + r.errors.join("; ")); return; }
                savePersonalView(r.view);
                setPersonal(loadPersonalViews());
              }}>
              save as my view
            </button>
            <button className="rounded border border-border px-2 py-0.5 hover:border-foreground"
              onClick={() => {
                // one export payload: personal views AND personal boards
                const blob = JSON.stringify(
                  // canon panels export by REFERENCE (re-computable question,
                  [...loadPersonalViews(), ...personalBoards.map((b) => ({
                    ...b,
                    panels: b.panels.map((p) => (
                      p.view.origin === "canon" && canonViews.some((cv) => cv.id === p.view.id && cv.origin === "canon")
                        ? { viewId: p.view.id, layout: { span: p.span } }
                        : { inlineView: p.view, layout: { span: p.span } }
                    )),
                  }))],
                  null, 2
                );
                navigator.clipboard?.writeText(blob);
                window.alert("personal views + boards copied to clipboard as JSON");
              }}>
              export mine
            </button>
            <button className="rounded border border-border px-2 py-0.5 hover:border-foreground"
              onClick={() => {
                const raw = window.prompt("Paste views JSON:");
                if (!raw) return;
                try {
                  const arr = JSON.parse(raw) as unknown[];
                  let n = 0;
                  const refused: string[] = [];
                  for (const item of arr) {
                    // imported views/boards are ALWAYS personal [p1-review F7]
                    const stamped = { ...(item as object), origin: "personal" as const };
                    if ((stamped as Partial<Board>).panels) {
                      const rb = validateBoard(stamped, canonViews);
                      if (rb.ok) { savePersonalBoard(stamped as Board); n++; }
                      else refused.push(rb.errors[0] ?? "invalid board");
                      continue;
                    }
                    const r = validateView(stamped);
                    if (r.ok) { savePersonalView(r.view); n++; }
                    else refused.push(r.errors[0] ?? "invalid");
                  }
                  setPersonal(loadPersonalViews());
                  setPersonalBoards(loadPersonalBoards(canonViews).boards);
                  window.alert(`${n} imported` + (refused.length ? `; ${refused.length} refused: ${refused.slice(0, 3).join(" | ")}` : ""));
                } catch { window.alert("not valid JSON"); }
              }}>
              import
            </button>
          </div>
        )}
        {source && (
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-[12px]">
            <div>
              <div className="mb-1 text-[10.5px] font-bold uppercase text-muted-foreground">Rows</div>
              {source.dims.map((d) => (
                <label key={d.key} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={rows.includes(d.key)}
                    onChange={() => toggle(rows, setRows, d.key)} />
                  {d.label}
                </label>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[10.5px] font-bold uppercase text-muted-foreground">Column (one)</div>
              {source.dims.map((d) => (
                <label key={d.key} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={cols.includes(d.key)}
                    disabled={rows.includes(d.key)}
                    onChange={() => toggle(cols, setCols, d.key, 1)} />
                  {d.label}
                </label>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[10.5px] font-bold uppercase text-muted-foreground">Measures</div>
              {source.measures.map((m) => (
                <label key={m.key} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={measures.includes(m.key)}
                    onChange={() => toggle(measures, setMeasures, m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {ready && source && slice && !sliceProblem && rows.length > 0 && measures.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <PivotPanel
            source={source}
            slice={slice}
            state={state}
            onDrill={(cellDims, measureKey, cellValue) => setDrill({ cellDims, measureKey, cellValue })}
          />
        </div>
      ) : (
        <div className="text-[12.5px] text-muted-foreground">
          {!ready ? "Loading the workbench…" : sliceProblem ? `This combination cannot be shown: ${sliceProblem}` : "pick at least one row dimension and one measure"}
        </div>
      )}

      {drill && source && batch && (
        <DrillPanel
          source={source}
          batch={batch.batch_id}
          cellDims={drill.cellDims}
          measureKey={drill.measureKey}
          cellValue={drill.cellValue}
          state={state}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
