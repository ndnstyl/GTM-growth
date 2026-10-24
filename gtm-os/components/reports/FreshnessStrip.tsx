"use client";

import { Manifest } from "@/lib/reports/duck";
import type { TrustFile } from "@/lib/reports/workbench/markers";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
};

/** One muted line. The per-feed list lives on the Health tab only. */
export function FreshnessStrip({ manifest }: { manifest: Manifest | null; trust?: TrustFile | null }) {
  if (!manifest) {
    return <p className="text-[13px] text-muted-foreground">Checking the data...</p>;
  }
  const n = Object.keys(manifest.files).length;
  return (
    <p className="text-[13px] text-muted-foreground">
      Data as of {fmt(manifest.as_of)} · {n} feeds loaded · sample data
    </p>
  );
}
