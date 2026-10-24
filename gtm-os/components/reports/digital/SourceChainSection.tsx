"use client";

// Source chain: source > sub-source > market rows with raw contacts, sets,
// issues, demos, sales, sold, net, mapped spend and cost per raw contact, set, issue and
// sale; the clocks print in the header; a null spend carries its register status in the
// spend status column; any cell drills to its day rows (the workbench drill, one path).

import { resolveTemplate, type DigitalTemplate, type RebaseMap } from "@/lib/reports/digital/rebase";
import type { FeedPresence } from "@/lib/reports/digital/feeds";
import { CLOCKS } from "@/lib/reports/digital/exportSlice";
import { findSource } from "@/lib/reports/workbench/sources";
import type { ViewFilter } from "@/lib/reports/workbench/pivotSql";
import { PivotPanel } from "@/components/reports/workbench/PivotPanel";
import { PanelFrame, Reason } from "./PanelFrame";
import { exportPivot, sliceOf, type DrillAsk } from "./SpendSection";

export function SourceChainSection({
  templates,
  map,
  period,
  market,
  presence,
  dataThrough,
  onDrill,
}: {
  templates: Record<string, DigitalTemplate>;
  map: RebaseMap | null;
  period: string | null;
  market: string | undefined;
  presence: FeedPresence | null;
  dataThrough: string;
  onDrill: (ask: DrillAsk) => void;
}) {
  const missing = presence?.missing.includes("dm_source_chain_daily") ?? true;
  const extra: ViewFilter[] = [
    ...(period ? [{ dimKey: "period", op: "in" as const, values: [period] }] : []),
    ...(market ? [{ dimKey: "market", op: "in" as const, values: [market] }] : []),
  ];
  const res = map && templates["source-chain"] ? resolveTemplate(templates["source-chain"], "spend", map, { extraFilters: extra }) : null;
  const source = findSource("dm_source_chain")!;
  const nullReason = (m: string) =>
    m === "mapped_spend"
      ? "no cost row mapped to this sub-source and market in the period; the spend status column names the register status"
      : m.startsWith("cost_per") || m.startsWith("mapped_cost")
        ? "no leads (or no mapped spend) in the period, so the per-unit cost is withheld rather than infinite or zero"
        : "not published for this row";
  return (
    <PanelFrame
      id="source-chain"
      title="Raw contacts to sale, per source, sub-source and market, with the spend on the same row"
      subtitle={CLOCKS.join(" · ")}
      qualifiers={{ dataThrough, confidence: "from the CRM", verdict: "day rows drill from the sets cell with a reconcile line" }}
      exportSlice={res?.kind === "view" ? () => exportPivot(res.view, { period: period ?? "all months", filters: { period: period ?? undefined, market }, dataThrough, confidence: "deterministic", nullReason }) : undefined}
      footer="A cost per unit over zero units reads as a reason, never infinity; a source with leads and no mapped spend shows the register status in the spend status column; the day rows behind any aggregate open from the sets cell (the drill reconciles on sets)."
    >
      {missing ? (
        <Reason text="Source data is not loaded yet" tone="bad" />
      ) : !res ? (
        <Reason text="This panel did not load" tone="bad" />
      ) : res.kind !== "view" ? (
        <Reason text={res.kind === "invalid" ? res.errors.join("; ") : res.reason} tone="bad" />
      ) : (
        <PivotPanel source={source} slice={sliceOf(res.view)} state={null} onDrill={(cellDims, measureKey, cellValue) => onDrill({ sourceKey: "dm_source_chain", cellDims, measureKey, cellValue, filters: res.view.filters })} />
      )}
    </PanelFrame>
  );
}
