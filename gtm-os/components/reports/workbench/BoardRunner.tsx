"use client";

// BoardRunner: renders a Board's panels in a grid and owns
// the cross-filter state: a category click on a chart panel filters every
// panel its rule targets (a visible "filtered by" chip on each, one click to
// clear). A selected chart point also opens the SAME drill() the table lane
// uses [r3 C-H1]: one drill path, never a second. Panel image export ships
// the markers WITH the pixels: the exported PNG carries the withheld/MTD
// lines composed under the chart, because an image that drops its markers
// lies in every deck it lands in.

import { useMemo, useRef, useState } from "react";
import type { ResolvedBoard } from "@/lib/reports/workbench/boardSchema";
import type { View } from "@/lib/reports/workbench/viewSchema";
import type { ChartSpec } from "@/lib/reports/workbench/chartSpec";
import { findSource } from "@/lib/reports/workbench/sources";
import { periodFloorFor } from "@/lib/reports/workbench/pivotSql";
import type { BatchState } from "@/lib/reports/workbench/markers";
import { ChartPanel } from "@/components/reports/workbench/ChartPanel";
import { ViewRunner } from "@/components/reports/workbench/ViewRunner";
import { DrillPanel } from "@/components/reports/workbench/DrillGrid";

type Selection = { fromPanel: number; dimKey: string; value: string; y: number; series: string | null };

function withCrossFilter(view: View, sel: Selection | null, applies: boolean): View {
  if (!sel || !applies) return view;
  return {
    ...view,
    filters: [...view.filters, { dimKey: sel.dimKey, op: "in", values: [sel.value] }],
  };
}

export function BoardRunner({ board, state, batch }: { board: ResolvedBoard; state: BatchState | null; batch: string }) {
  const [sel, setSel] = useState<Selection | null>(null);
  const [drill, setDrill] = useState<{ panel: number; x: string; y: number; series: string | null } | null>(null);
  const exportRefs = useRef<(HTMLDivElement | null)[]>([]);

  const targetsOf = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const r of board.crossFilter ?? []) {
      // merge: a second rule from the same panel must not overwrite the first [p2-review W3]
      m.set(r.fromPanel, [...new Set([...(m.get(r.fromPanel) ?? []), ...r.toPanels])]);
    }
    return m;
  }, [board]);

  const exportPanel = async (i: number, view: View) => {
    const host = exportRefs.current[i];
    if (!host) return;
    try {
      const { renderChartImage } = await import("@tanstack/charts/export");
      const blob = await renderChartImage(host, { width: 1200, height: 675, scale: 2, background: "#0b0c1a", type: "image/png" });
      // compose the marker/annotation lines INTO the artifact: an export
      const noteEls = host.querySelectorAll("[data-testid='chart-withheld-note'], [data-export-note]");
      const notes = [...noteEls].map((n) => (n.textContent ?? "").trim()).filter(Boolean);
      const img = await createImageBitmap(blob);
      const pad = 16;
      const lineH = 28;
      const canvas = document.createElement("canvas");
      const ctx0 = canvas.getContext("2d")!;
      ctx0.font = "22px Inter, sans-serif";
      // wrap each note to the canvas width: a clipped marker is a dropped marker
      const maxW = img.width - pad * 2;
      const lines: string[] = [];
      for (const n of notes) {
        let line = "";
        for (const word of n.split(/\s+/)) {
          const probe = line ? `${line} ${word}` : word;
          if (ctx0.measureText(probe).width > maxW && line) {
            lines.push(line);
            line = word;
          } else line = probe;
        }
        if (line) lines.push(line);
      }
      canvas.width = img.width;
      canvas.height = img.height + (lines.length ? lines.length * lineH + pad * 2 : 0);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0b0c1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "#ff5a7a";
      ctx.font = "22px Inter, sans-serif";
      lines.forEach((n, k) => ctx.fillText(n, pad, img.height + pad + (k + 1) * lineH - 8));
      canvas.toBlob((out) => {
        if (!out) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(out);
        a.download = `${view.id}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    } catch (e) {
      window.alert("The export did not complete. Try again.");
    }
  };

  return (
    <div>
      <div className="mb-2">
        {board.description && <div className="text-[13px] text-[var(--ink2)]">{board.description}</div>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {board.panels.map((p, i) => {
          const isChart = p.view.presentation === "chart";
          const spec = p.view.chartSpec as ChartSpec | undefined;
          const filteredBySomeone = sel !== null && sel.fromPanel !== i && (targetsOf.get(sel.fromPanel) ?? []).includes(i);
          const effView = withCrossFilter(p.view, sel, filteredBySomeone);
          const source = findSource(p.view.sourceKey);
          return (
            <div key={i} className={p.span === 2 ? "md:col-span-2" : ""} ref={(el) => { exportRefs.current[i] = el; }}>
              <div className="mb-1 flex items-center gap-2">
                <span className="sr-only" data-export-note>{p.view.name}</span>
                {filteredBySomeone && sel && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px]">
                    <span data-export-note>filtered: {sel.dimKey} = {sel.value}</span>{" "}
                    <button className="underline-offset-2 hover:underline" onClick={() => setSel(null)}>clear</button>
                  </span>
                )}
                {isChart && (
                  <button
                    className="ml-auto rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground underline-offset-2 hover:underline"
                    title="PNG with the marker lines composed into the image"
                    onClick={() => exportPanel(i, p.view)}
                  >
                    Export PNG
                  </button>
                )}
              </div>
              {isChart ? (
                <ChartPanel
                  view={effView}
                  state={state}
                  onSelection={(s) => {
                    setSel(s === null ? null : { fromPanel: i, dimKey: spec?.x ?? "", value: s.x, y: s.y, series: s.series });
                    setDrill(null);
                  }}
                />
              ) : (
                <ViewRunner view={effView} state={state} />
              )}
              {isChart && sel?.fromPanel === i && !Number.isNaN(sel.y) && spec && source && (
                <div className="mt-1 text-[11px]">
                  {/* the chart-point drill uses the SAME drill() as tables [r3 C-H1] */}
                  <button
                    className="rounded bg-muted px-2 py-0.5 underline-offset-2 hover:underline"
                    onClick={() => setDrill({ panel: i, x: sel.value, y: sel.y, series: sel.series })}
                  >
                    drill into {spec.x} = {sel.value}
                  </button>
                </div>
              )}
              {drill?.panel === i && spec && source && (
                <div className="mt-2">
                  <DrillPanel
                    source={source}
                    batch={batch}
                    cellDims={{
                      [spec.x]: drill.x,
                      // a series chart's y is ONE segment's value: the drill
                      // must pin the segment or it reconciles the wrong sum
                      // [p2-review W4]; drill.ts refuses when the dim cannot
                      // map to a row-feed join key
                      ...(spec.series ? { [spec.series]: drill.series } : {}),
                    }}
                    measureKey={spec.y}
                    cellValue={drill.y}
                    state={state}
                    viewBounds={{
                      periodFloor: periodFloorFor(p.view.datePreset),
                      filters: p.view.filters.map((f) => ({ dimKey: f.dimKey, values: f.values })),
                    }}
                    onClose={() => setDrill(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
