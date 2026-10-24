"use client";

// Re-based panels: by market, by who runs the account, by platform, by
// source, each reading the comparison windows for the picked metric at that scope. The
// rows table shows the figure, the difference, the day counts and any withheld reason per
// scope; "pivot" opens the same panel as the resolved saved view through the workbench's
// own ViewRunner (one aggregation path). A scope the metric does not apply to prints the
// map's reason; a withheld metric prints its reason.

import { useState } from "react";
import { pickerMetric } from "@/lib/reports/digital/picker";
import { resolveTemplate, type DigitalTemplate, type RebaseMap } from "@/lib/reports/digital/rebase";
import { daysText, deltaText, normalizeFormat, signedCaveat, valueText, WINDOW_LABELS, type WindowKey } from "@/lib/reports/digital/windows";
import type { FeedPresence } from "@/lib/reports/digital/feeds";
import type { SliceExport } from "@/lib/reports/digital/exportSlice";
import { ViewRunner } from "@/components/reports/workbench/ViewRunner";
import { PanelFrame, Reason } from "./PanelFrame";
import { useWindowRows } from "./ComparisonRow";

const PANELS: { id: string; scope: "market" | "bucket" | "platform" | "source" }[] = [
  { id: "rebased-by-market", scope: "market" },
  { id: "rebased-by-bucket", scope: "bucket" },
  { id: "rebased-by-platform", scope: "platform" },
  { id: "rebased-by-source", scope: "source" },
];

function RebasedPanel({
  template,
  scope,
  metric,
  map,
  period,
  presence,
  win,
}: {
  template: DigitalTemplate;
  scope: "market" | "bucket" | "platform" | "source";
  metric: string;
  map: RebaseMap;
  period: string | null;
  presence: FeedPresence | null;
  win: WindowKey;
}) {
  const pm = pickerMetric(metric);
  const res = resolveTemplate(template, metric, map, { window: win });
  const applies = res.kind === "view";
  const { rows, error } = useWindowRows(metric, applies ? map : null, scope, undefined, period, presence);
  const [mode, setMode] = useState<"rows" | "pivot">("rows");
  const format = normalizeFormat(rows?.[0]?.format, pm?.format ?? "count");
  const visible = rows ? rows.filter((r) => r.window === win).sort((a, b) => a.scope.localeCompare(b.scope)) : [];
  const title = `${template._digital?.title ?? template.name ?? scope}`;
  const dataThrough = rows?.find((r) => r.data_through)?.data_through ?? "not published";

  const exportSlice = (): SliceExport | null => {
    if (!pm || !visible.length) return null;
    return {
      title: `${pm.label} ${title.toLowerCase()}`,
      period: `${WINDOW_LABELS[win]}${period ? `, ${period}` : ""}`,
      filters: { scope },
      metric: pm.label,
      dataThrough,
      confidence: "comparison windows",
      columns: [
        { key: "scope", label: title.replace(/^By /, "") },
        { key: "value", label: pm.label },
        { key: "delta", label: pm.kind === "ratio" ? "Point difference" : "Change" },
        { key: "days", label: "Working days" },
      ],
      rows: visible.map((r) => ({ scope: r.scope, value: r.withheld_reason ? null : valueText(r, format), delta: r.withheld_reason ? null : deltaText(r, pm.kind, format), days: daysText(r) })),
      withheld: visible.filter((r) => r.withheld_reason).map((r) => ({ where: `${r.scope} / ${pm.label}`, reason: r.withheld_reason! })),
    };
  };

  return (
    <PanelFrame
      id={template.id}
      title={`${title}: ${pm?.label ?? metric}`}
      subtitle={`${WINDOW_LABELS[win]} against the prior window on the same working days`}
      qualifiers={{ dataThrough, confidence: "comparison windows", verdict: "" }}
      exportSlice={res.kind === "view" ? exportSlice : undefined}
    >
      {res.kind === "not_applicable" && <Reason text={res.reason} tone="muted" />}
      {res.kind === "withheld" && <Reason text={res.reason} />}
      {res.kind === "invalid" && <Reason text={`panel refused: ${res.errors.join("; ")}`} tone="bad" />}
      {res.kind === "view" && (
        <>
          <div className="mb-2 flex gap-1">
            {(["rows", "pivot"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-0.5 text-[10.5px] ${mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                {m === "rows" ? "Table" : "Pivot"}
              </button>
            ))}
          </div>
          {mode === "pivot" ? (
            <ViewRunner view={res.view} state={null} />
          ) : error ? (
            <Reason text={`windows query failed: ${error}`} tone="bad" />
          ) : !rows ? (
            <Reason text="reading the comparison windows" tone="muted" />
          ) : !visible.length ? (
            <Reason text={`no ${WINDOW_LABELS[win].toLowerCase()} rows published for ${pm?.label ?? metric} by ${scope}; the feed carries no row for this metric at this scope yet`} tone="bad" />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-3">{title.replace(/^By /, "")}</th>
                  <th className="py-1 pr-3 text-right">{pm?.label}</th>
                  <th className="py-1 pr-3 text-right">{pm?.kind === "ratio" ? "Point difference" : "Change"}</th>
                  <th className="py-1 pr-3">Working days</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.scope} className="border-b border-border/50 last:border-0">
                    <td className="py-1 pr-3">{r.scope}</td>
                    {r.withheld_reason ? (
                      <td className="py-1 pr-3" colSpan={2}><Reason text={r.withheld_reason} /></td>
                    ) : (
                      <>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {valueText(r, format)}
                          {signedCaveat(r) && <span className="ml-1 text-[9.5px] font-semibold text-amber-700 dark:text-amber-400">{signedCaveat(r)}</span>}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">{deltaText(r, pm?.kind ?? "sum", format)}</td>
                      </>
                    )}
                    <td className="py-1 pr-3 text-[11px] text-muted-foreground">{daysText(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </PanelFrame>
  );
}

export function RebasedPanels({
  templates,
  metric,
  map,
  period,
  presence,
}: {
  templates: Record<string, DigitalTemplate>;
  metric: string;
  map: RebaseMap | null;
  period: string | null;
  presence: FeedPresence | null;
}) {
  const [win, setWin] = useState<WindowKey>("mtd");
  if (!map) return <Reason text="These panels did not load" tone="bad" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="mr-1 text-muted-foreground">Window for the panels below:</span>
        {(Object.keys(WINDOW_LABELS) as WindowKey[]).map((w) => (
          <button key={w} onClick={() => setWin(w)} className={`rounded px-2 py-0.5 ${win === w ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {WINDOW_LABELS[w]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {PANELS.map((p) =>
          templates[p.id] ? (
            <RebasedPanel key={p.id} template={templates[p.id]} scope={p.scope} metric={metric} map={map} period={period} presence={presence} win={win} />
          ) : (
            <Reason key={p.id} text={`panel template ${p.id} did not load`} tone="bad" />
          )
        )}
      </div>
    </div>
  );
}
