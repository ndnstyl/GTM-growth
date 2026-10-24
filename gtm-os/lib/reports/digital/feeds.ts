// Explicit feed registration for the Digital Marketing board. These feeds
// are produced by the spine lane, never by the reports builder, so they are registered in
// code and NEVER injected into _manifest.json (build_reports.py regenerates that file).
// An absent feed is an UNAVAILABLE state the panels render with a reason: warn, never throw.

import { registerParquet } from "@/lib/reports/duck";
import { reportLog } from "@/lib/reports/log";

export const DM_FEEDS: readonly string[] = Object.freeze([
  "dm_ownership",
  "dm_working_day",
  "dm_spend_daily",
  "dm_source_chain_daily",
  "dm_windows",
  "dm_pacing",
  "dm_cost_status",
  "dm_tieout",
  "dm_platform_diag_daily",
  // the marketing cost target strip reads the existing marketing cost target feeds as its single definition
  "golden_rule__monthly",
  "golden_rule__tieout",
  // the strip's data-through day is the last day the marketing cost target's daily feed carries, never
  // the export clock (the feed's as_of is when it was written, the data runs through yesterday)
  "golden_rule__daily",
]);

export type FeedPresence = { present: string[]; missing: string[] };

export async function registerDigitalFeeds(): Promise<FeedPresence> {
  const present: string[] = [];
  const missing: string[] = [];
  for (const name of DM_FEEDS) {
    let ok = false;
    try {
      ok = await registerParquet(name, `/data/reports/${name}.parquet`);
    } catch (e) {
      reportLog.warn(`[reports] unavailable_feed: ${name}.parquet (${String(e)})`);
    }
    if (ok) present.push(name);
    else {
      missing.push(name);
      reportLog.warn(`[reports] unavailable_feed: ${name}.parquet`);
    }
  }
  return { present, missing };
}

/** The feeds a panel needs, as a reason when one is absent (rendered in the panel). */
export function missingReason(needed: string[], presence: FeedPresence | null): string | null {
  if (!presence) return "feeds not registered yet";
  const gone = needed.filter((n) => presence.missing.includes(n));
  if (!gone.length) return null;
  return `unavailable: the ${gone.join(", ")} ${gone.length === 1 ? "feed has" : "feeds have"} not been published to this host yet`;
}
