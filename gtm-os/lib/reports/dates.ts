// Report dates are calendar dates ("2026-10-24"), never instants. Nothing here touches the visitor's time zone:
// the windows come from lib/demo/metrics.ts, and day counts are plain calendar arithmetic on the strings.

import { PRESET_TO_WIN, win } from "@/lib/demo/metrics";

export function dateRangeFor(preset: string): { from: string; to: string } {
  const w = win(PRESET_TO_WIN[preset] ?? "mtd");
  return { from: w.start, to: w.end };
}

const dayNumber = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** Inclusive count of calendar days between two YYYY-MM-DD strings. */
export function daysBetweenInclusive(from: string, to: string): number {
  return Math.max(1, Math.round(dayNumber(to) - dayNumber(from)) + 1);
}
