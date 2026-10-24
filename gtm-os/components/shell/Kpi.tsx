import { ReactNode } from "react";

/** The one KPI tile: 12px sentence-case label, 22px value, optional delta and one note line.
 *  data-kpi and data-window let the surface check read the figure. */
export function Kpi({
  label, value, note, delta, good, kpi, win, compact = false,
}: { label: string; value: ReactNode; note?: ReactNode; delta?: number | null; good?: boolean | null; kpi?: string; win?: string; compact?: boolean }) {
  return (
    <div className={compact ? "min-w-0" : "min-w-0 rounded-xl border border-border bg-card p-3"} data-kpi-tile={kpi}>
      <div className="min-h-[30px] text-[12px] leading-tight text-[var(--ink2)]">{label}</div>
      <div className="tick text-[22px] font-bold leading-[30px]" data-kpi={kpi} data-window={win}>{value}</div>
      <div className="min-h-[16px] text-[12px] text-muted-foreground">
        {delta != null ? (
          <span className={`mr-1 ${Math.abs(delta) < 3 ? "text-[var(--ink2)]" : good ? "text-[var(--good)]" : "text-[var(--crit)]"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
        {note}
      </div>
    </div>
  );
}
