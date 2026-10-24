"use client";

/* Health tab: one honest line per feed, read from
   /data/reports/_health.json, which the scheduler rewrites after every wave.
   No number on this tab is computed in the browser; it shows the file. */

export type HealthFeed = {
  name: string;
  schedule: string;
  status: string | null;
  as_of: string | null;
  rows: number | null;
  state: "ok" | "stale" | "error" | "missing" | "cooldown" | "parked";
  why: string;
  last_alert: { written: string; text: string } | null;
};
export type JobRow = {
  label: string;
  last_exit: number | null;
  runs: number | null;
  loaded: boolean;
  plist_parse?: string;
  log?: string | null;
  log_exists?: boolean;
  last_run_at?: string | null;
  freshness_from?: string;
  state: string;
  reason?: string;
  known_cause?: string;
  owner?: string;
};
export type GovernorVendorRow = {
  vendor: string;
  mode: string | null;
  used: number | null;
  ceiling: number | null;
  pct: number | null;
  pace: number | null;
  resets_at: string | null;
  state: string | null;
  recheck_due: boolean | null;
  top_lane: string | null;
  refusals_suppressed: number | null;
  last_incident_ts: string | null;
  chronic_spent: boolean | null;
  ratification_overdue: boolean | null;
  // Concurrent spec-142 additions -- may not exist on an older snapshot yet.
  spent_since?: string | null;
  consecutive_spent_windows?: number | null;
};
export type GovernorHealth = {
  as_of: string | null;
  stale: boolean;
  stale_age_s: number | null;
  registry_invalid: boolean | null;
  lkg_expiry_s: number | null;
  // Concurrent spec-142 addition -- may not exist yet.
  // The governor emits the quarantine marker itself (quarantined_at /
  // corrupt_path / error), not a bare boolean: see governor.py
  // read_cooldown_corrupt_marker. Null when clear.
  cooldown_state_corrupt?: { quarantined_at?: string; corrupt_path?: string; error?: string } | null;
  unregistered: string[];
  vendors: GovernorVendorRow[];
  fallback_note?: string | null;
};
export type JobHealthDoc = {
  generated_at: string;
  counts: Record<string, number>;
  overall: string;
  jobs: JobRow[];
  vendors?: GovernorHealth | null;
};
export type HealthDoc = {
  generated_at: string;
  as_of: string | null;
  schedules: Record<string, { last_run: string; last_status: string; feeds_run: string[]; feeds_skipped: string[] }>;
  cooldown: Record<string, string>;
  summary: { ok: number; stale: number; error: number; missing: number; cooldown: number; parked: number };
  feeds: HealthFeed[];
  alerts_24h: number;
  alerts_recent: { written: string; feed: string | null; text: string }[];
  overall: "ok" | "stale" | "error";
};

const STATE_CLS: Record<HealthFeed["state"], string> = {
  ok: "bg-[var(--good)]/15 text-[var(--good)]",
  stale: "bg-[var(--warn)]/15 text-[var(--warn)]",
  cooldown: "bg-[var(--warn)]/15 text-[var(--warn)]",
  error: "bg-[var(--crit)]/15 text-[var(--crit)]",
  missing: "bg-[var(--crit)]/15 text-[var(--crit)]",
  parked: "bg-muted text-muted-foreground",
};

// Job states that carry no alarm: exited 0 on cadence, a service that is up, or a job
// loaded ahead of its first calendar fire (2026-09-08; the collector emits all three).
const GREEN_JOB = new Set(["OK", "RUNNING", "SCHEDULED"]);

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const GOV_STATE_CLS: Record<string, string> = {
  observe: "bg-muted text-foreground",
  ok: "bg-[var(--good)]/15 text-[var(--good)]",
  warn: "bg-[var(--warn)]/15 text-[var(--warn)]",
  spent: "bg-[var(--warn)]/15 text-[var(--warn)]",
  cooldown: "bg-[var(--warn)]/15 text-[var(--warn)]",
  flagged: "bg-[var(--crit)]/15 text-[var(--crit)]",
  registry_invalid: "bg-[var(--crit)]/15 text-[var(--crit)]",
};

function fmtCountdown(s: number | null | undefined): string {
  if (s == null) return "";
  if (s <= 0) return "expired";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h} h`;
}

function GovernorPanel({ v }: { v: GovernorHealth }) {
  const redRow = (r: GovernorVendorRow) =>
    r.state === "registry_invalid" || !!r.chronic_spent;
  // outage. Rendered amber once per row and counted once up top, so a red badge on this
  // panel always means a real incident (registry invalid, chronic spend, flagged).
  const awaitingRatify = v.vendors.filter((r) => !!r.ratification_overdue && r.mode === "observe");
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] font-bold">
        API rate governor ({v.vendors.length} vendor{v.vendors.length === 1 ? "" : "s"})
        <span className="font-normal text-[10.5px] text-muted-foreground">
          as of {ago(v.as_of)}{v.stale ? `: SNAPSHOT STALE (${fmtCountdown(v.stale_age_s)} old), showing counters directly` : ""}
        </span>
      </div>

      {v.cooldown_state_corrupt && (
        <div className="mb-2 rounded px-2 py-1 text-[11px] font-semibold bg-[var(--crit)]/15 text-[var(--crit)]">
          COOLDOWN STATE CORRUPT: the shared cooldown file was quarantined
          {v.cooldown_state_corrupt.quarantined_at ? ` at ${v.cooldown_state_corrupt.quarantined_at}` : ""},
          so cross-process backoff memory was thrown away. This does not self-clear: check the
          quarantined file, then delete state/cooldown_corrupt.json.
        </div>
      )}
      {v.registry_invalid && (
        <div className="mb-2 rounded px-2 py-1 text-[11px] font-semibold bg-[var(--crit)]/15 text-[var(--crit)]">
          REGISTRY INVALID: running on the last-known-good cache{v.lkg_expiry_s != null ? ` (expires in ${fmtCountdown(v.lkg_expiry_s)})` : ""}.
        </div>
      )}
      {v.fallback_note && (
        <div className="mb-2 text-[10.5px] text-muted-foreground">{v.fallback_note}</div>
      )}
      {awaitingRatify.length > 0 && (
        <div className="mb-2 rounded px-2 py-1 text-[11px] bg-[var(--warn)]/15 text-[var(--warn)]">
          {awaitingRatify.length} vendor{awaitingRatify.length === 1 ? "" : "s"} past the 7-day observe baseline with no ratified ceiling. Until then the governor only counts; it refuses nothing.
        </div>
      )}
      {v.unregistered.length > 0 && (
        <div className="mb-2 text-[11px]">
          <span className="font-semibold">unregistered vendors seen:</span> {v.unregistered.join(", ")}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left">vendor</th>
              <th className="text-left">mode</th>
              <th className="text-left">state</th>
              <th className="text-right">used / ceiling</th>
              <th className="text-left">resets</th>
              <th className="text-left">top lane</th>
            </tr>
          </thead>
          <tbody>
            {[...v.vendors].sort((a, b) => a.vendor.localeCompare(b.vendor)).map((r) => {
              const ratify = !!r.ratification_overdue && r.mode === "observe" && !redRow(r);
              const cls = redRow(r) ? GOV_STATE_CLS.registry_invalid
                : ratify ? GOV_STATE_CLS.warn
                : (GOV_STATE_CLS[r.state ?? ""] ?? "bg-muted text-foreground");
              const pctTxt = r.pct != null ? ` (${Math.round(r.pct * 100)}%)` : "";
              return (
                <tr key={r.vendor} className="border-t border-border align-top">
                  <td className="py-1 font-mono text-[11px]">{r.vendor}</td>
                  <td className="py-1">{r.mode ?? "?"}</td>
                  <td className="py-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
                      {(redRow(r) ? `${r.state ?? "?"} !!` : ratify ? "RATIFY" : r.state ?? "?").toUpperCase()}
                    </span>
                  </td>
                  <td className="py-1 text-right">
                    {r.used ?? "?"} / {r.ceiling ?? "∞"}{pctTxt}
                  </td>
                  <td className="py-1">{r.resets_at ? String(r.resets_at).slice(0, 16) : ""}</td>
                  <td className="py-1 text-muted-foreground">{r.top_lane ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Health({ doc, jobs }: { doc: HealthDoc | null; jobs: JobHealthDoc | null }) {
  // A malformed or foreign file must degrade to a message, never crash the tab.
  if (doc && (!doc.summary || !Array.isArray(doc.feeds))) {
    return (
      <div className="rounded-md border border-[var(--warn,#d90)] px-3 py-2 text-[12px]">
        The health file at <code>/data/reports/_feed_health.json</code> is not in the expected shape
        (another writer may own that name). Re-run the health job.
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="rounded-md border border-border p-4 text-[12px] text-muted-foreground">
        No health file yet. It is written by the scheduled health job after every
        wave and on demand.
      </div>
    );
  }
  const prettyName = (n: string) => {
  const t = n.replace(/^(?:com\.[a-z]+\.)/, "").replace(/^(?:dim|fact|dm|lp_spine|funnel|spine|meter|work|golden_rule|callfloor\/callfloor)_*/, "").replace(/^google_ads__/, "Google Ads ").replace(/^meta__/, "Meta ").replace(/^microsoft_ads__/, "Microsoft Ads ").replace(/[_\/-]+/g, " ").replace(/\bfact\b|\bdim\b/g, "").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const expected: Record<string, string> = { hourly: "every 15 minutes, today's data", nightly: "6:10 AM ET, after the 5:30 AM CRM refresh", weekly: "weekly" };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className={`rounded px-2 py-1 text-[11px] font-bold ${STATE_CLS[doc.overall === "ok" ? "ok" : doc.overall === "stale" ? "stale" : "error"]}`}>
          {doc.overall === "ok" ? "All healthy" : doc.overall === "stale" ? "Some feeds late" : "A feed is down"}
        </span>
        <span>Data as of <b>{doc.as_of ? new Date(doc.as_of).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "n/a"}</b></span>
        <span>Health checked <b>{ago(doc.generated_at)}</b></span>
        <span>
          {doc.summary.ok + doc.summary.stale + doc.summary.cooldown + doc.summary.error + doc.summary.missing} of {doc.feeds.length} feeds:
          {" "}{doc.summary.ok} ok · {doc.summary.stale} stale · {doc.summary.cooldown} cooldown · {doc.summary.error} error · {doc.summary.missing} missing
          {(doc.summary.parked ?? 0) > 0 && ` · ${doc.summary.parked} parked (excluded from the count above)`}
        </span>
        <span>{doc.alerts_24h} alerts in the last 24 hours</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-[12.5px] font-bold">Schedules</div>
        <table className="w-full text-[13px]">
          <thead className="text-muted-foreground"><tr><th className="text-left">schedule</th><th className="text-left">promise</th><th className="text-left">last run</th><th className="text-left">status</th><th className="text-right">ran</th><th className="text-right">skipped</th></tr></thead>
          <tbody>
            {["hourly", "nightly", "weekly"].map((k) => {
              const s = doc.schedules[k];
              return (
                <tr key={k} className="border-t border-border">
                  <td className="py-1 font-semibold">{k}</td>
                  <td className="py-1">{expected[k]}</td>
                  <td className="py-1">{s ? `${ago(s.last_run)} (${(s.last_run ?? '').slice(0, 16)})` : "never"}</td>
                  <td className="py-1">{s?.last_status ?? "n/a"}</td>
                  <td className="py-1 text-right">{s?.feeds_run.length ?? 0}</td>
                  <td className="py-1 text-right" title={s?.feeds_skipped.join(", ")}>{s?.feeds_skipped.length ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {Object.keys(doc.cooldown).length > 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            quota cooldown: {Object.entries(doc.cooldown).map(([k, v]) => `${k} until ${v}`).join(" · ")}
          </div>
        )}
      </div>

      {jobs && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold">
            Scheduled jobs ({jobs.jobs.length})
            <span className="font-normal text-[10.5px] text-muted-foreground">
              Checked every 30 minutes, last {ago(jobs.generated_at)}. Stale means it stopped firing; failing means it fired and exited with an error.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-muted-foreground"><tr><th className="text-left">job</th><th className="text-left">state</th><th className="text-right">exit</th><th className="text-left">last run</th><th className="text-left">why</th></tr></thead>
              <tbody>
                {[...jobs.jobs].sort((a, b) => (GREEN_JOB.has(a.state) ? 1 : 0) - (GREEN_JOB.has(b.state) ? 1 : 0) || a.label.localeCompare(b.label)).map((j) => (
                  <tr key={j.label} className="border-t border-border align-top">
                    <td className="py-1 text-[13px]">{prettyName(j.label)}</td>
                    <td className="py-1">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        j.state === "OK" || j.state === "RUNNING" ? STATE_CLS.ok :
                        j.state === "SCHEDULED" ? STATE_CLS.parked :
                        j.state === "STALE" ? STATE_CLS.stale :
                        j.state === "FAILING" || j.state === "MISSING" ? STATE_CLS.error : STATE_CLS.cooldown}`}>{j.state}</span>
                    </td>
                    <td className="py-1 text-right">{j.last_exit ?? ""}</td>
                    <td className="py-1">{j.last_run_at ? ago(j.last_run_at) : "never"}</td>
                    <td className="py-1 text-muted-foreground">
                      {j.known_cause || j.reason || ""}
                      {j.owner ? ` (owner: ${j.owner})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-[12.5px] font-bold">Feeds ({doc.feeds.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-muted-foreground"><tr><th className="text-left">feed</th><th className="text-left">schedule</th><th className="text-left">state</th><th className="text-left">as of</th><th className="text-right">rows</th><th className="text-left">why / last alert</th></tr></thead>
            <tbody>
              {[...doc.feeds].sort((a, b) => (a.state === "ok" ? 1 : 0) - (b.state === "ok" ? 1 : 0) || a.name.localeCompare(b.name)).map((f) => (
                <tr key={f.name} className="border-t border-border align-top">
                  <td className="py-1 text-[13px]">{prettyName(f.name)}</td>
                  <td className="py-1">{f.schedule}</td>
                  <td className="py-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATE_CLS[f.state]}`}>{f.state}</span></td>
                  <td className="py-1">{f.as_of ? String(f.as_of).slice(0, 16) : "never"}</td>
                  <td className="py-1 text-right">{f.rows?.toLocaleString() ?? ""}</td>
                  <td className="py-1 text-muted-foreground">
                    {f.why}
                    {f.last_alert && <div className="text-[10.5px]">alert {ago(f.last_alert.written)}: {f.last_alert.text}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-[12.5px] font-bold">Recent alert lines (newest first, redacted)</div>
        {doc.alerts_recent.length === 0 ? <div className="text-[11px] text-muted-foreground">none</div> : (
          <ul className="flex flex-col gap-1 text-[11px]">
            {doc.alerts_recent.map((a, i) => (
              <li key={i} className="border-t border-border pt-1"><span className="text-muted-foreground">{(a.written ?? '').slice(0, 16)}</span> <b>{a.feed ?? ""}</b> {a.text}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
