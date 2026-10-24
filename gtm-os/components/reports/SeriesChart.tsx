"use client";

// One chart primitive for every daily series on the reports tabs (// the owner 2026-09-08: "these mean nothing without numbers, it's just pretty").
// Every rendering carries: y-axis ticks with values, the value on each bar or
// point, first/last/weekly dates on the x-axis, and a summary strip (total,
// average per day, high day, low day, days with data). A day with no row draws
// as an empty slot and is named in the strip, never silently skipped.

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { stagger, useSeen } from "@/lib/motion";

export type SeriesTone = "ok" | "partial" | "unavailable" | "empty";

export type SeriesPoint = {
  date: string; // ISO YYYY-MM-DD
  value: number | null; // null = no row / unavailable for the day
  tone?: SeriesTone;
  note?: string; // tooltip detail
};

type Props = {
  points: SeriesPoint[];
  kind: "bar" | "line";
  fmt: (v: number) => string; // full format for the strip and tooltips
  fmtCompact?: (v: number) => string; // short format for on-chart labels
  color?: string;
  height?: number;
  unit?: string; // strip noun, e.g. "spend", "clicks"
};

export function compactNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 10_000) return `${Math.round(v / 1000)}K`;
  if (a >= 1_000) return `${(v / 1000).toFixed(1)}K`;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

export function compactMoney(v: number): string {
  return `$${compactNumber(v)}`;
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const m = max / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}

function shortDate(iso: string): string {
  const s = String(iso).slice(0, 10);
  const [, m, d] = s.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : s;
}

export function SeriesChart({ points, kind, fmt, fmtCompact, color = "var(--primary, #00e5ff)", height = 150, unit = "value" }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const tip = useRef<HTMLDivElement | null>(null);
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  const setRoot = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      seenRef.current = el;
    },
    [seenRef],
  );
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(320, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const compact = fmtCompact ?? ((v: number) => compactNumber(v));
  const withData = points.filter((p) => p.value !== null) as (SeriesPoint & { value: number })[];
  const n = points.length;

  if (n === 0) {
    return <div ref={setRoot} className="text-[12px] text-muted-foreground">no rows in this window</div>;
  }

  const total = withData.reduce((a, p) => a + p.value, 0);
  const avg = withData.length ? total / withData.length : null;
  const high = withData.length ? withData.reduce((a, p) => (p.value > a.value ? p : a)) : null;
  const low = withData.length ? withData.reduce((a, p) => (p.value < a.value ? p : a)) : null;
  const yMax = niceMax(high ? high.value : 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  const padL = 56;
  const padR = 12;
  const padT = 18;
  const padB = 22;
  const w = width;
  const h = height;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const slot = plotW / n;
  const xOf = (i: number) => padL + slot * i + slot / 2;
  const yOf = (v: number) => padT + plotH - (v / yMax) * plotH;
  const showLabel = (i: number) => i === 0 || i === n - 1 || (high !== null && points[i] === high) || (low !== null && points[i] === low);
  const dateEvery = n <= 10 ? 1 : 7;

  const toneFill = (t: SeriesTone | undefined) =>
    t === "unavailable" ? "var(--crit, #c33)" : t === "partial" ? "var(--warn, #d90)" : t === "empty" ? "var(--border, #ddd)" : color;

  // a tooltip that follows the pointer (translate only); the layer below is keyed on the data so a filter change redraws
  const sig = `${n}:${Math.round(total)}`;
  const showTip = (e: React.PointerEvent, text: string) => {
    const t = tip.current;
    const r = ref.current;
    if (!t || !r) return;
    const box = r.getBoundingClientRect();
    t.textContent = text;
    t.style.transform = `translate3d(${Math.min(e.clientX - box.left + 12, box.width - 150)}px, ${Math.max(0, e.clientY - box.top - 34)}px, 0)`;
    t.style.opacity = "1";
  };
  const hideTip = () => {
    if (tip.current) tip.current.style.opacity = "0";
  };

  const linePath = points
    .map((p, i) => (p.value === null ? null : `${i === 0 || points[i - 1].value === null ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setRoot} className="relative w-full">
      <div ref={tip} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] opacity-0 shadow-lg transition-opacity duration-150" />
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`block overflow-visible ${seen ? "in" : ""}`} role="img" aria-label={`${unit} by day`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={yOf(t)} y2={yOf(t)} stroke="currentColor" strokeOpacity={i === 0 ? 0.5 : 0.12} strokeWidth={1} className="text-border" />
            <text x={padL - 6} y={yOf(t) + 3} textAnchor="end" className="fill-current text-[10px] text-muted-foreground">
              {compact(t)}
            </text>
          </g>
        ))}
        <g key={sig}>
        {points.map((p, i) => {
          const x = xOf(i);
          const title = `${String(p.date).slice(0, 10)}: ${p.value === null ? "no row" : fmt(p.value)}${p.note ? `, ${p.note}` : ""}`;
          if (kind === "bar") {
            const bw = Math.max(2, slot * 0.72);
            const y = p.value === null ? yOf(0) - 2 : yOf(p.value);
            const bh = p.value === null ? 2 : Math.max(1, yOf(0) - y);
            return (
              <g key={i} className="g-slot" role="img" aria-label={title} onPointerMove={(e) => showTip(e, title)} onPointerLeave={hideTip}>
                <rect x={x - slot / 2} y={padT} width={slot} height={plotH} fill="transparent" />
                <rect className="g-grow-y g-mark" style={stagger(i)} x={x - bw / 2} y={y} width={bw} height={bh} rx={2} fill={toneFill(p.value === null ? "empty" : p.tone)} fillOpacity={p.value === null ? 0.6 : points[i] === high ? 1 : 0.65} />
                {p.value !== null && showLabel(i) && (
                  <text x={x} y={y - 3} textAnchor="middle" className="g-fade fill-current text-[10px] font-semibold" style={{ animationDelay: "420ms" }}>
                    {compact(p.value)}
                  </text>
                )}
              </g>
            );
          }
          return (
            <g key={i} className="g-slot" role="img" aria-label={title} onPointerMove={(e) => showTip(e, title)} onPointerLeave={hideTip}>
                <rect x={x - slot / 2} y={padT} width={slot} height={plotH} fill="transparent" />
              {p.value !== null ? (
                <>
                  <circle className="g-dot-in g-mark" style={stagger(i)} cx={x} cy={yOf(p.value)} r={2.6} fill={toneFill(p.tone)} />
                  {showLabel(i) && (
                    <text x={x} y={yOf(p.value) - 6} textAnchor="middle" className="fill-current text-[10px] font-semibold">
                      {compact(p.value)}
                    </text>
                  )}
                </>
              ) : (
                <rect x={x - 3} y={yOf(0) - 3} width={6} height={3} fill="var(--crit, #c33)" fillOpacity={0.6} />
              )}
            </g>
          );
        })}
        {kind === "line" && linePath && <path className="g-draw" d={linePath} pathLength={1} fill="none" stroke={color} strokeWidth={1.6} />}
        </g>
        {points.map((p, i) =>
          i % dateEvery === 0 || i === n - 1 ? (
            <text key={`d${i}`} x={xOf(i)} y={h - 6} textAnchor="middle" className="fill-current text-[10px] text-muted-foreground">
              {shortDate(p.date)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted-foreground">
        <span>
          <b className="text-foreground">{withData.length ? fmt(total) : "unavailable"}</b> total
        </span>
        <span>
          <b className="text-foreground">{avg !== null ? fmt(avg) : "unavailable"}</b> per day
        </span>
        {high && (
          <span>
            high <b className="text-foreground">{fmt(high.value)}</b> on {shortDate(high.date)}
          </span>
        )}
        {low && (
          <span>
            low <b className="text-foreground">{fmt(low.value)}</b> on {shortDate(low.date)}
          </span>
        )}
        {withData.length < n ? (
          <span>
            {withData.length} of {n} days loaded
          </span>
        ) : null}
      </div>
    </div>
  );
}
