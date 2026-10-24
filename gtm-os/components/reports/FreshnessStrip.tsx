"use client";

import { dayLabel, metrics } from "@/lib/demo/metrics";
import { Manifest } from "@/lib/reports/duck";
import type { TrustFile } from "@/lib/reports/workbench/markers";

/** One muted line. The per-feed list lives on the Health tab only. */
export function FreshnessStrip({ manifest }: { manifest: Manifest | null; trust?: TrustFile | null }) {
  if (!manifest) {
    return <p className="text-[13px] text-muted-foreground">Checking the data...</p>;
  }
  const n = Object.keys(manifest.files).length;
  return (
    <p className="text-[13px] text-muted-foreground">
      Data through {dayLabel(metrics.through)} · {n} feeds loaded · sample data
    </p>
  );
}
