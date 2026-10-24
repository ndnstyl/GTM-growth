"use client";

// The metric picker: four groups, one selection, persisted per viewer as a
// convenience in localStorage (inside try/catch; the board never depends on it).

import { PICKER_GROUPS, savePickedMetric } from "@/lib/reports/digital/picker";

export function MetricPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 sm:p-4" data-testid="metric-picker">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="metric-select" className="text-[15px] font-bold">Pick a metric</label>
        <select
          id="metric-select"
          value={value}
          onChange={(e) => {
            savePickedMetric(e.target.value);
            onChange(e.target.value);
          }}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
        >
          {PICKER_GROUPS.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="text-[13px] text-[var(--ink2)]">The board below re-bases to it.</span>
      </div>
    </section>
  );
}
