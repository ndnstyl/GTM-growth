// Spine exec-surface client.
// Reads /data/reports/spine_exec.json: the export of the warehouse COMPUTE VIEWS
// (spine.metric_*), and nothing else. Every figure the exec surface renders
// comes through this typed feed; there is no hand-entry path and no second
// source for any number (SC-004). 127's feeds may supply non-metric context
// only, never a figure.

import { moneyCents } from "@/lib/reports/format";

export type MerReading = {
  period: string;
  spend_cents: number;
  revenue_cents: number;
  mer_pct: number | null;
  platforms_reporting: string[];
  platforms_expected: string[];
  renders_15_line: boolean;
  spend_partial_label: string | null;
  provisional: boolean;
  cost_definition_used?: string;
};

export type RevenueTtm = {
  as_of_month: string;
  ttm_now_cents: number;
  ttm_prior_cents: number;
  change_abs_cents: number;
  change_pct: number | null;
  pct_refused_reason: string | null;
  window_now: string;
  window_prior: string;
};

export type UnitCosts = {
  period: string;
  grain: string;
  cost_per_lead_cents: number | null;
  cost_per_set_cents: number | null;
  cost_per_issue_cents: number | null;
  cost_per_sale_cents: number | null;
  provisional: boolean;
  cost_definition_used?: string;
  spend_cents?: number;
  presence_complete?: boolean;
};

export type MonthlyRevenue = { period: string; gross_cents: number; mom_pct: number | null; mtd?: boolean };

export type MonthState = { period: string; status: string; closed_by: string | null; closed_at: string | null };

export type CompassAction = { action: string; owner: string; status: string };

export type SpineExecFeed = {
  as_of: string;
  producer: string;
  provenance: Record<string, string>;
  bottom_line: string;
  compass: {
    call_center_reading: string;
    exec_reading: string;
    actions: CompassAction[];
  };
  mer: { this_month: MerReading | null; last_month: MerReading | null };
  revenue_ttm: RevenueTtm | null;
  unit_costs: { this_month: UnitCosts | null; last_month: UnitCosts | null };
  revenue_monthly: MonthlyRevenue[];
  month_state: MonthState[];
  verify_queue_pending: { id: string; source_key: string; rows: number; staged_at: string }[];
  unavailable: { metric: string; reason: string }[];
};

export async function loadSpineExec(): Promise<SpineExecFeed> {
  const res = await fetch("/data/reports/spine_exec.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`spine_exec feed unavailable (HTTP ${res.status})`);
  }
  const doc = (await res.json()) as SpineExecFeed;
  // provenance is load-bearing: a feed without it is not the compute layer
  if (!doc.provenance || !doc.producer) {
    throw new Error("spine_exec feed carries no provenance: refusing to render numbers");
  }
  return doc;
}

export function dollars(cents: number | null | undefined): string {
  return moneyCents(cents);
}

// A failed export must never serve yesterday's numbers as current: the daily
// 06:00 run plus slack makes anything older than 30h stale.
export function staleHours(as_of: string): number | null {
  const t = Date.parse(as_of);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}
