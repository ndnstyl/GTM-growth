"use client";

// TanStack Charts engine.
// PURE renderer: receives pivotSql-computed rows through the ChartPanel seam
// and never queries or aggregates. Withheld periods paint as labeled rules , 
// a visible absence, never a silent gap.
//
// Kinds implement the chart-kind doctrine (see chartSpec.ts): line (time),
// bar/bar_h (comparison, vertical under ~7 / horizontal 7-15), stacked_bar +
// pie/donut (composition; pie gated to ≤5 categories in ChartPanel), scatter
// (relationship, two measures).

import { useMemo, useState } from "react";
import { useSeen } from "@/lib/motion";
import { defineChart, lineY, barY, barX, ruleX, ruleY, dot, stack } from "@tanstack/charts";
import { keyedSelection } from "@tanstack/charts/selection";
import { controlledSignal } from "@tanstack/charts/interaction/signal";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import { CHART_PALETTE, CHART_WITHHELD } from "@/lib/reports/palette";
import type { ChartAdapterProps, ChartDatum } from "@/lib/reports/workbench/chartSpec";

const PALETTE = CHART_PALETTE;

function fmtTick(v: number, format: string): string {
  if (format === "dollars") {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  }
  if (format === "pct") return `${v.toFixed(1)}%`;
  return v.toLocaleString("en-US");
}

export function ChartTanstack(props: ChartAdapterProps) {
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  const { spec, data, withheldX, mtdX, format, yLabel, y2Label, y2Format, onSelection } = props;
  const [selected, setSelected] = useState<string | null>(null);
  const seriesKeys = useMemo(
    () => [...new Set(data.map((d) => d.series ?? ""))].sort(),
    [data]
  );

  const xDomain = useMemo(
    () => [...new Set([...data.map((d) => d.x), ...withheldX.map((w) => w.x)])].sort(),
    [data, withheldX]
  );

  const definition = useMemo(() => {
    // through the controlled signal; a blank-surface click proposes null
    const selection = keyedSelection<ChartDatum, string>({
      selected: controlledSignal(selected, (next: string | null, ctx) => {
        setSelected(next);
        if (next === null) onSelection?.(null);
        else {
          const d = ctx.reason.point?.datum;
          onSelection?.({ x: next, series: d?.series ?? null, y: d?.y ?? NaN });
        }
      }),
      key: (d) => d.x,
    });
    const linearY = {
      scale: scaleLinear,
      nice: true,
      grid: true,
      axis: { label: yLabel, ticks: { format: (v: number) => fmtTick(v, format) } },
    };
    const withheldRule = () =>
      ruleX(withheldX, { x: "x", stroke: CHART_WITHHELD, strokeWidth: 2, strokeDasharray: "4 3" });

    if (spec.kind === "pie" || spec.kind === "donut") {
      const slices = pie(data, { value: "y" });
      const domain = data.map((d) => d.x);
      return defineChart({
        marks: [
          polar({
            inset: 8,
            radiusRatio: 0.82,
            marks: [
              radialArc(slices, {
                innerRadius: spec.kind === "donut" ? ({ radius }) => radius * 0.58 : 0,
                cornerRadius: 3,
                color: "x",
                key: "x",
              }),
            ],
            scales: { angle: null, radius: null },
          }),
        ],
        scales: { x: null, y: null },
        color: { domain, range: domain.map((_, i) => PALETTE[i % PALETTE.length]) },
        tooltip,
      });
    }

    if (spec.kind === "scatter") {
      return defineChart({
        marks: [dot(data, { x: "y", y: "y2", key: "x", r: 4, fill: PALETTE[0] })],
        scales: {
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: yLabel, ticks: { format: (v: number) => fmtTick(v, format) } },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: y2Label ?? "y2", ticks: { format: (v: number) => fmtTick(v, y2Format ?? "count") } },
          },
        },
        tooltip,
      });
    }

    if (spec.kind === "bar_h") {
      // horizontal RANKING: order the band domain by value, largest first , 
      // reordering rows is layout, never math
      const ranked = [...data].sort((a, b) => b.y - a.y);
      const yDomain = [...ranked.map((d) => d.x), ...withheldX.map((w) => w.x)];
      return defineChart({
        marks: [
          barX(ranked, { x: "y", y: "x", key: "x", fill: PALETTE[0] }),
          ...(withheldX.length
            ? [ruleY(withheldX, { y: "x", stroke: CHART_WITHHELD, strokeWidth: 2, strokeDasharray: "4 3" }) as never]
            : []),
        ],
        scales: {
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: yLabel, ticks: { format: (v: number) => fmtTick(v, format) } },
          },
          y: { scale: () => scaleBand().domain(yDomain).padding(0.22) },
        },
        selection,
        tooltip,
      });
    }

    if (spec.kind === "stacked_bar") {
      return defineChart({
        marks: [
          barY(data, { x: "x", y: "y", key: "x", color: "series", layout: stack() }),
          ...(withheldX.length ? [withheldRule()] : []),
        ],
        scales: {
          x: { scale: () => scaleBand().domain(xDomain).padding(0.18) },
          y: linearY,
        },
        color: {
          domain: seriesKeys,
          range: seriesKeys.map((_, i) => PALETTE[i % PALETTE.length]),
        },
        selection,
        tooltip,
      });
    }

    // line | bar
    const markFor = (rows: ChartDatum[], color: string) =>
      spec.kind === "line"
        ? lineY(rows, { x: "x", y: "y", key: "x", stroke: color, strokeWidth: 2, points: rows.length <= 40 })
        : barY(rows, { x: "x", y: "y", key: "x", fill: color });
    const marks = seriesKeys.map((s, i) =>
      markFor(
        data.filter((d) => (d.series ?? "") === s),
        PALETTE[i % PALETTE.length]
      )
    );
    if (withheldX.length) marks.push(withheldRule() as (typeof marks)[number]);
    return defineChart({
      marks,
      scales: {
        x: { scale: () => scaleBand().domain(xDomain).padding(spec.kind === "bar" ? 0.18 : 0.5) },
        y: linearY,
      },
      selection,
      tooltip,
    });
    // selected participates via the controlled signal identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, data, withheldX, xDomain, seriesKeys, format, yLabel, y2Label, y2Format, selected]);

  const height = spec.kind === "bar_h" ? Math.max(220, data.length * 26 + 60) : 280;

  return (
    <div ref={seenRef} className={`g-tc ${seen ? "in" : ""}`}>
      {/* the seven kinds produce a union of definition shapes the alpha's
          generic Chart prop cannot unify: each branch is individually
          well-typed above; the cast only crosses the union boundary */}
      <Chart key={`${data.length}:${Math.round(data.reduce((a, d) => a + (Number(d.y) || 0), 0))}`} definition={definition as never} height={height} ariaLabel={yLabel} />
      {(seriesKeys.length > 1 || spec.kind === "pie" || spec.kind === "donut") && (
        <div className="mt-1 flex flex-wrap gap-2 text-[10.5px]">
          {(spec.kind === "pie" || spec.kind === "donut" ? data.map((d) => d.x) : seriesKeys).map((s, i) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              {s || "(all)"}
            </span>
          ))}
        </div>
      )}
      {selected !== null && (
        <div className="mt-0.5 text-[10.5px]">
          <span className="rounded bg-primary/15 px-1.5 py-0.5">selected: {selected}</span>{" "}
          <button
            className="underline-offset-2 hover:underline"
            onClick={() => {
              setSelected(null);
              onSelection?.(null);
            }}
          >
            clear
          </button>
        </div>
      )}
      {mtdX.length > 0 && (
        <div className="mt-0.5 text-[10.5px] text-amber-600 dark:text-amber-400" data-export-note>
          Month so far: {mtdX.join(", ")}
        </div>
      )}
    </div>
  );
}
