"use client";

// Boards: the three kept boards (marketing cost against target, MER, the AI front door). Each board is a set of
// ruled views; nothing here lets a reader build their own slice.

import { useEffect, useState } from "react";
import { registerParquet } from "@/lib/reports/duck";
import { SOURCES } from "@/lib/reports/workbench/sources";
import { staleHours, type BatchState } from "@/lib/reports/workbench/markers";
import { BoardRunner } from "@/components/reports/workbench/BoardRunner";
import { loadCanonBoards, type ResolvedBoard } from "@/lib/reports/workbench/boardSchema";
import { loadCanonViews } from "@/lib/reports/workbench/viewSchema";
import { PageHeader } from "@/components/shell/PageHeader";
import { dayLabel, metrics } from "@/lib/demo/metrics";

type BatchManifest = {
  batch_id: string;
  as_of: string;
  feeds: Record<string, { rows: number; sha256: string }>;
};

const KEPT = ["board-efficiency-target", "board-mer", "board-ai-accuracy"];

export function Workbench() {
  const [ready, setReady] = useState(false);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchManifest | null>(null);
  const [state, setState] = useState<BatchState | null>(null);
  const [boards, setBoards] = useState<ResolvedBoard[]>([]);
  const [viewErrors, setViewErrors] = useState(false);
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
        if (st.ok) setState((await st.json()) as BatchState);
      } catch {
        /* absence renders below as an unavailable board, never a crash */
      }
      const { views, errors: verrs } = await loadCanonViews();
      const { boards: all, errors: berrs } = await loadCanonBoards(views);
      if (cancelled) return;
      const kept = KEPT.map((id) => all.find((b) => b.id === id)).filter((b): b is ResolvedBoard => !!b);
      setBoards(kept);
      const want = new URLSearchParams(window.location.search).get("board");
      setActiveBoard(kept.find((b) => b.id === want) ?? kept[0] ?? null);
      setViewErrors(verrs.length + berrs.length > 0);
      setFeedErrors(errors);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const age = batch ? staleHours(batch.as_of) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6" data-testid="workbench-root">
      <PageHeader title="Boards" subtitle={`Ruled views over the same data as every other page. Data through ${dayLabel(metrics.through)}.`} />

      {age !== null && age > 30 && (
        <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-[13px] font-semibold text-[var(--warn)]">
          This data is {Math.round(age)} hours old; a daily refresh was expected.
        </div>
      )}
      {feedErrors.length > 0 && (
        <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-[13px] text-[var(--warn)]">
          Some feeds did not load, so the views that use them show a refusal, never a zero.
        </div>
      )}

      <div role="tablist" aria-label="Boards" className="no-scrollbar flex gap-1 overflow-x-auto whitespace-nowrap border-b border-border" data-testid="launch-views">
        {boards.map((b) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={activeBoard?.id === b.id}
            className={
              "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-[13px] font-semibold transition-colors " +
              (activeBoard?.id === b.id ? "border-primary text-primary" : "border-transparent text-[var(--ink2)] hover:text-foreground")
            }
            onClick={() => setActiveBoard(b)}
          >
            {b.name.replace(/^Board \d+: /, "")}
          </button>
        ))}
      </div>
      {viewErrors && <div className="text-[12px] text-[var(--crit)]">Some views could not be opened.</div>}

      {activeBoard ? (
        <div className="rounded-xl border border-border bg-card p-4" data-testid="board">
          {batch ? (
            <BoardRunner board={activeBoard} state={state} batch={batch.batch_id} />
          ) : (
            <div className="text-[12.5px] text-rose-600 dark:text-rose-400">The board is unavailable: the data manifest did not load.</div>
          )}
        </div>
      ) : (
        <div className="text-[12.5px] text-muted-foreground">{ready ? "No board to show." : "Loading the boards…"}</div>
      )}
    </div>
  );
}
