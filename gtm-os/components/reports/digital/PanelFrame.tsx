"use client";

// Panel chrome for the Digital Marketing board: every panel prints
// its data-through date, confidence and feed verdict in the header and carries a one-click
// export of the slice it shows. Reasons render in the cell's place, never a blank.

import { useState } from "react";
import { Download } from "lucide-react";
import { buildSliceCsv, csvFilename, downloadCsv, type SliceExport } from "@/lib/reports/digital/exportSlice";

const fmtThrough = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : v);

export type Qualifiers = { dataThrough: string; confidence: string; verdict: string };

export function Reason({ text, tone = "warn" }: { text: string; tone?: "warn" | "bad" | "muted" }) {
  const cls =
    tone === "bad"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-amber-700 dark:text-amber-400";
  return (
    <span className={`text-[11.5px] leading-snug ${cls}`} data-testid="reason-cell">
      {text}
    </span>
  );
}

export function PanelFrame({
  id,
  title,
  subtitle,
  qualifiers,
  exportSlice,
  children,
  footer,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  qualifiers: Qualifiers;
  exportSlice?: () => Promise<SliceExport | null> | SliceExport | null;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const onExport = async () => {
    if (!exportSlice) return;
    setBusy(true);
    setNote(null);
    try {
      const s = await exportSlice();
      if (!s) {
        setNote("nothing to export yet: the panel has no rows");
        return;
      }
      downloadCsv(csvFilename(s.title, s.period), buildSliceCsv(s));
    } catch (e) {
      setNote(`export failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id={id} className="rounded-xl border border-border bg-card p-3 sm:p-4" data-testid={`panel-${id ?? title}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {subtitle && <div className="text-[12px] text-[var(--ink2)]">{subtitle}</div>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground" data-testid="qualifiers">
            <span>Data through {fmtThrough(qualifiers.dataThrough)}</span>
            {/FAIL/.test(qualifiers.verdict) ? <span className="font-semibold text-[var(--crit)]">{qualifiers.verdict}</span> : null}
          </div>
        </div>
        {exportSlice && (
          <button
            onClick={onExport}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Export this slice as CSV with its period, filters, clocks, data-through, confidence and withheld reasons"
          >
            <Download size={12} /> {busy ? "exporting" : "Export slice"}
          </button>
        )}
      </div>
      {note && <div className="mb-2 text-[11.5px] text-amber-700 dark:text-amber-400">{note}</div>}
      <div className="min-w-0 overflow-x-auto">{children}</div>
      {footer && <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">{footer}</div>}
    </section>
  );
}

const PLATFORM: Record<string, string> = { google_ads: "Google Ads", meta: "Meta", microsoft_ads: "Microsoft Ads", offline: "Offline", non_media: "Other", PASS_RESIDUAL: "PASS, with a residual" };
const disp = (v: string) => PLATFORM[v] ?? v;

/** A plain table for rows already read from a feed (no aggregation here: the rows are the
 * feed's own grain). A null cell renders its reason. */
export function RowsTable({
  columns,
  rows,
  reasonFor,
}: {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, unknown>[];
  reasonFor?: (row: Record<string, unknown>, key: string) => string;
}) {
  if (!rows.length) return <Reason text="no rows for this slice in the feed" tone="muted" />;
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          {columns.map((c) => (
            <th key={c.key} className={`py-1 pr-3 ${c.align === "right" ? "text-right" : ""}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/50 last:border-0">
            {columns.map((c) => {
              const v = r[c.key];
              return (
                <td key={c.key} className={`py-1 pr-3 align-top ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                  {v === null || v === undefined || v === "" ? <Reason text={reasonFor ? reasonFor(r, c.key) : "not published"} /> : disp(String(v))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
