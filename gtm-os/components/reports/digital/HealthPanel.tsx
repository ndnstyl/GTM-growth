"use client";

// Health: the board's own tie-out (FAIL count and rows),
// each feed's own as_of (read off the feed, never a register), and the host that served
// the page, so a stale laptop view is visibly stale.

import { useEffect, useState } from "react";
import { query } from "@/lib/reports/duck";
import { DM_FEEDS, type FeedPresence } from "@/lib/reports/digital/feeds";
import type { SliceExport } from "@/lib/reports/digital/exportSlice";
import { PanelFrame, Reason, RowsTable } from "./PanelFrame";

type TieRow = { run_at: string | null; check_id: string; stage: string; period: string; scope: string; expected: number | null; observed: number | null; tolerance: number | null; result: string; evidence: string | null; feed_as_of: string | null };
export type FeedAsOf = { feed: string; as_of: string | null };

export async function readFeedAsOf(presence: FeedPresence): Promise<FeedAsOf[]> {
  const out: FeedAsOf[] = [];
  for (const f of DM_FEEDS) {
    if (presence.missing.includes(f)) {
      out.push({ feed: f, as_of: null });
      continue;
    }
    try {
      const col = f === "dm_windows" || f === "dm_pacing" ? "data_through" : f === "dm_tieout" ? "feed_as_of" : f === "dm_ownership" ? "register_signed_at" : f === "dm_working_day" ? "the_date" : "as_of";
      const r = (await query(`SELECT DISTINCT ${col} AS as_of FROM ${f} ORDER BY 1 DESC LIMIT 1`)) as { as_of: unknown }[];
      out.push({ feed: f, as_of: r[0]?.as_of ? String(r[0].as_of).slice(0, 19) : null });
    } catch {
      out.push({ feed: f, as_of: null });
    }
  }
  return out;
}

export function HealthPanel({ presence, asOf }: { presence: FeedPresence | null; asOf: FeedAsOf[] | null }) {
  const [tie, setTie] = useState<TieRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState<string>("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the host is read from the browser once after mount so the static export and the client agree
    setHost(typeof window !== "undefined" ? window.location.host || "file" : "");
  }, []);
  useEffect(() => {
    if (!presence) return;
    if (presence.missing.includes("dm_tieout")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an absent feed is a known empty state, set in the same effect that would otherwise query it
      setTie([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = (await query("SELECT * FROM dm_tieout ORDER BY result DESC, period DESC, check_id")) as unknown as TieRow[];
        if (!cancelled) setTie(r);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presence]);

  const fails = tie ? tie.filter((t) => t.result === "FAIL") : [];
  const withheld = tie ? tie.filter((t) => t.result === "WITHHELD") : [];
  const latest = tie?.find((t) => t.run_at)?.run_at ?? "not published";
  const exportSlice = (): SliceExport | null =>
    !tie
      ? null
      : {
          title: "Digital marketing checks",
          period: "all periods checked",
          filters: {},
          dataThrough: latest,
          confidence: "the board's own daily tie-out",
          columns: [
            { key: "period", label: "Period" },
            { key: "stage", label: "Stage" },
            { key: "check_id", label: "Check" },
            { key: "scope", label: "Scope" },
            { key: "expected", label: "Expected" },
            { key: "observed", label: "Observed" },
            { key: "result", label: "Result" },
            { key: "evidence", label: "Evidence" },
          ],
          rows: tie.map((t) => ({ period: t.period, stage: t.stage, check_id: t.check_id, scope: t.scope, expected: t.expected === null ? null : String(t.expected), observed: t.observed === null ? null : String(t.observed), result: t.result, evidence: t.evidence })),
          withheld: withheld.map((t) => ({ where: `${t.period} / ${t.check_id}`, reason: t.evidence ?? "withheld by the tie-out without a reason (a defect)" })),
        };

  return (
    <PanelFrame
      id="tieout"
      title="Data checks"
      subtitle={`served by ${host || "unknown host"}`}
      qualifiers={{ dataThrough: latest, confidence: "checks", verdict: tie === null ? "loading" : fails.length ? `FAIL: ${fails.length} ${fails.length === 1 ? "row" : "rows"}` : tie.length ? `PASS, ${tie.length} rows` : "no tie-out rows published" }}
      exportSlice={exportSlice}
    >
      {error && <Reason text={`the checks did not load: ${error}`} tone="bad" />}
      {tie && (
        <div className={`mb-2 text-[13px] font-bold ${fails.length ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`} data-testid="tieout-verdict">
          {fails.length ? `${fails.length} failing ${fails.length === 1 ? "row" : "rows"}` : tie.length ? "every check passes" : "no tie-out rows published; the daily job has not run on this host"}
          {withheld.length ? ` · ${withheld.length} withheld` : ""}
        </div>
      )}
      {tie && tie.length > 0 && (
        <RowsTable
          columns={[
            { key: "result", label: "Result" },
            { key: "period", label: "Period" },
            { key: "stage", label: "Stage" },
            { key: "check_id", label: "Check" },
            { key: "scope", label: "Scope" },
            { key: "expected", label: "Expected", align: "right" },
            { key: "observed", label: "Observed", align: "right" },
            { key: "evidence", label: "Evidence" },
            { key: "feed_as_of", label: "Feed as of" },
          ]}
          rows={(fails.length ? fails : tie).map((t) => ({ ...t }))}
          reasonFor={() => "not published by the tie-out"}
        />
      )}
      <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Feeds on this host (each feed&apos;s own as-of)</div>
      {!asOf ? (
        <Reason text="Reading the data" tone="muted" />
      ) : (
        <RowsTable columns={[{ key: "feed", label: "Feed" }, { key: "as_of", label: "As of" }]} rows={asOf} reasonFor={() => "not published to this host"} />
      )}
    </PanelFrame>
  );
}
