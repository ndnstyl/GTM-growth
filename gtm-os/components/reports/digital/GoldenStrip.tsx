"use client";

// The marketing cost target strip: above the fold, before any other panel. Reads the
// marketing cost target monthly and tie-out feeds and the cost status feed; the cell texts come from
// lib/reports/digital/strip.ts so they are the texts the tests pin.

import { useEffect, useState } from "react";
import { query } from "@/lib/reports/duck";
import { allInFromPivotRows, allInSpendSlice, buildStrip, type AllInSpend, type CostStatusRow, type GoldenMonthlyRow, type GoldenTieoutRow, type Strip } from "@/lib/reports/digital/strip";
import { findSource } from "@/lib/reports/workbench/sources";
import { buildPivot } from "@/lib/reports/workbench/pivotSql";
import type { FeedPresence } from "@/lib/reports/digital/feeds";
import type { SliceExport } from "@/lib/reports/digital/exportSlice";
import { PanelFrame, Reason } from "./PanelFrame";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const monthLabel = (p: string) => new Date(p + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function GoldenStrip({ period, presence }: { period: string | null; presence: FeedPresence | null }) {
  const [strip, setStrip] = useState<Strip | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!presence) return;
    let cancelled = false;
    (async () => {
      try {
        if (presence.missing.includes("golden_rule__monthly")) {
          if (!cancelled) setStrip(buildStrip({ monthly: null, tieout: [], costStatus: null, spend: null, dataThrough: null }));
          return;
        }
        const months = (await query(
          "SELECT * FROM golden_rule__monthly WHERE office = 'COMPANY' AND universe = 'rep_assigned' ORDER BY period DESC"
        )) as unknown as GoldenMonthlyRow[];
        const monthly = (period && months.find((m) => m.period === period)) || months[0] || null;
        const p = monthly?.period ?? period;
        const tieout = p && !presence.missing.includes("golden_rule__tieout")
          ? ((await query(`SELECT period, result, "column", office, grain FROM golden_rule__tieout WHERE period = ${q(p)}`)) as unknown as GoldenTieoutRow[])
          : [];
        const cost = p && !presence.missing.includes("dm_cost_status")
          ? (((await query(`SELECT * FROM dm_cost_status WHERE month = ${q(p)}`)) as unknown as CostStatusRow[])[0] ?? null)
          : null;
        // data through = the last day the daily marketing cost target feed carries for the month; the
        // monthly row's as_of is the export clock and would read one day late. The daily feed's
        // own `period` column is the day, so the month is read off the date.
        const through = p && !presence.missing.includes("golden_rule__daily")
          ? ((await query(
              `SELECT CAST(date AS VARCHAR) AS d FROM golden_rule__daily WHERE office = 'COMPANY' AND universe = 'rep_assigned' AND SUBSTR(CAST(date AS VARCHAR), 1, 7) = ${q(p)} ORDER BY date DESC LIMIT 1`
            )) as unknown as { d: string }[])[0]?.d ?? null
          : null;
        let spend: AllInSpend | null = null;
        if (p && !presence.missing.includes("dm_spend_daily")) {
          const source = findSource("dm_spend");
          const stmt = source ? buildPivot(source, allInSpendSlice(p)).statements.find((s) => s.id === "pivot") : undefined;
          if (!stmt) throw new Error("the spend source or its pivot statement is not registered; the strip cannot total the month");
          spend = allInFromPivotRows((await query(stmt.sql)) as Record<string, unknown>[]);
        }
        if (!cancelled) setStrip(buildStrip({ monthly, tieout, costStatus: cost, spend, dataThrough: through }));
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, presence]);

  const exportSlice = (): SliceExport | null => {
    if (!strip) return null;
    const q0 = strip.cells[0]?.qualifiers;
    return {
      title: "Marketing cost target strip",
      period: `${strip.period ?? "no month"} (${q0?.settle ?? "settle status not published"})`,
      filters: {},
      dataThrough: q0?.dataThrough ?? "not published",
      confidence: q0?.confidence ?? "not published",
      columns: [
        { key: "label", label: "Cell" },
        { key: "value", label: "Value" },
        { key: "detail", label: "Detail" },
        { key: "caveat", label: "Open cost-record checks" },
        { key: "settle", label: "Settle status" },
      ],
      rows: strip.cells.map((c) => ({ label: c.label, value: c.value, detail: c.detail ?? "", caveat: c.caveat ?? "", settle: c.qualifiers.settle })),
      withheld: strip.costCaveat ? [{ where: "Marketing cost % / caveat", reason: strip.costCaveat }] : [],
    };
  };

  const toneCls = (t: string) =>
    t === "ok" ? "text-foreground" : t === "bad" ? "text-rose-600 dark:text-rose-400" : t === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";

  return (
    <PanelFrame
      id="efficiency-target"
      title="Marketing cost against target"
      subtitle={strip?.period ? `${monthLabel(strip.period)}, whole company, appointments with a rep` : "whole company, appointments with a rep"}
      qualifiers={{
        dataThrough: strip?.cells[0]?.qualifiers.dataThrough ?? "loading",
        confidence: strip?.cells[0]?.qualifiers.confidence ?? "loading",
        verdict: strip ? (strip.tieoutFails ? `Does not match the CRM, ${strip.tieoutFails} rows` : "Matches the CRM") : "loading",
      }}
      exportSlice={exportSlice}
    >
      {error && <Reason text={`strip query failed: ${error}`} tone="bad" />}
      {!strip && !error && <Reason text="Working out the month" tone="muted" />}
      {strip && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="golden-strip">
          {strip.cells.map((c) => (
            <div key={c.key} className="flex min-w-0 flex-col rounded-lg border border-border/60 bg-background p-2.5" data-cell={c.key}>
              <div className="text-[12px] font-semibold text-[var(--ink2)]">{c.label}</div>
              <div className={`mt-0.5 break-words text-[15px] font-semibold leading-snug ${toneCls(c.tone)}`} data-testid="cell-value">
                {c.href ? (
                  <a href={c.href} className="hover:underline">
                    {c.value}
                  </a>
                ) : (
                  c.value
                )}
                {c.notTied && c.key !== "tieout" && (
                  <span className="ml-1 rounded bg-rose-500/15 px-1 py-0.5 align-middle text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400">not tied</span>
                )}
              </div>
              {c.detail && <div className="text-[12px] text-muted-foreground">{c.detail}</div>}
              {c.caveat && (
                <div className="mt-1 text-[12px] leading-snug text-[var(--ink2)]" data-testid="cell-caveat">
                  {c.caveat}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
