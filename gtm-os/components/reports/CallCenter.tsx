"use client";

/* Call Center tab. Replaces the kiosk-fed port
   (the old kiosk feed) that was parked and sat on
   "last good data 2026-09-02" for a week. Reads two live feeds through DuckDB:
   the CRM funnel (data file through yesterday + today file) and the call-floor connect feed. This component renders what the SQL returns; the
   only arithmetic here is a ratio of two returned sums, with both named. */

import { useEffect, useState } from "react";
import { getDb, query, registerParquet } from "@/lib/reports/duck";
import { moneyCents, pct as fmtPct, count as fmtCount, UNAVAILABLE } from "@/lib/reports/format";
import {
  CC_FEEDS,
  CC_HEADLINE_SOURCE,
  ccAgentsSql,
  ccDialsBySourceSql,
  ccDialsDailySql,
  ccFunnelByOfficeSql,
  ccFunnelCompanySql,
  ccFunnelViewSql,
  type CcPeriod,
} from "@/lib/reports/sql/callcenter.sql";
import { reportLog } from "@/lib/reports/log";

// The kiosk parked/stale branches this gated no longer exist in the component;
// retire the test and this export together.
export function shouldRenderStalePanel(
  staleSince: string | null,
  parked: { name: string; state: string; why: string; as_of: string | null } | null
): boolean {
  return staleSince != null && parked == null;
}

type FunnelRow = {
  leads: number | null; sets: number | null; issues: number | null; demos: number | null; sales: number | null;
  gross_cents: number | null; net_cents: number | null; cancels: number | null; cancel_gross_cents: number | null;
  days_with_rows: number; days_with_cancel_record: number;
  first_date: string | null; last_date: string | null; as_of: string | null;
  provisional_rows: number; rows: number; days_elapsed?: number;
};
type OfficeRow = FunnelRow & { office_id: string; office_name: string };
type DialsRow = {
  source: string; lp_dials: number | null; lp_dials_d: number | null; lp_connects: number | null;
  lp_connects_d: number | null; lp_machine: number | null; agents_peak: number | null;
  days_with_rows: number; first_date: string | null; last_date: string | null; as_of: string | null;
};
type DialsDay = {
  call_date: string; lp_dials: number; lp_dials_d: number; lp_connects: number; lp_connects_d: number;
  lp_machine: number; agents: number;
};

type AgentRow = {
  agent_key: string; agent_name: string | null; lp_dials: number | null; lp_connects: number | null;
  days_with_rows: number; last_date: string | null;
};

type Feeds = { spine: boolean; today: boolean; connect: boolean; market: boolean; agents: boolean };

const num = fmtCount;
const money = moneyCents;
const ratio = (n: number | null | undefined, d: number | null | undefined) =>
  n == null || !d ? UNAVAILABLE : fmtPct(n / d);
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "unknown");
const stamp = (v: string | null | undefined) => (v ? String(v).replace("T", " ").slice(0, 16) : "unknown");

export function CallCenter() {
  const [period, setPeriod] = useState<CcPeriod>("mtd");
  const [feeds, setFeeds] = useState<Feeds | null>(null);
  const [company, setCompany] = useState<FunnelRow | null>(null);
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [dials, setDials] = useState<DialsRow[]>([]);
  const [dialsDaily, setDialsDaily] = useState<DialsDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [officeSort, setOfficeSort] = useState<{ key: keyof OfficeRow; dir: 1 | -1 }>({ key: "gross_cents", dir: 1 });
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentSort, setAgentSort] = useState<{ key: keyof AgentRow; dir: 1 | -1 }>({ key: "lp_dials", dir: 1 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDb();
        const [spine, today, connect, market, agentFeed] = await Promise.all([
          registerParquet(CC_FEEDS.spine.name, CC_FEEDS.spine.url),
          registerParquet(CC_FEEDS.today.name, CC_FEEDS.today.url),
          registerParquet(CC_FEEDS.connect.name, CC_FEEDS.connect.url),
          registerParquet(CC_FEEDS.market.name, CC_FEEDS.market.url),
          registerParquet(CC_FEEDS.agents.name, CC_FEEDS.agents.url),
        ]);
        if (cancelled) return;
        setFeeds({ spine, today, connect, market, agents: agentFeed });
        const viewSql = ccFunnelViewSql(spine, today);
        if (viewSql) {
          await query(viewSql);
          const [c] = await query<FunnelRow>(ccFunnelCompanySql(period));
          const o = await query<OfficeRow>(ccFunnelByOfficeSql(period));
          if (cancelled) return;
          setCompany(c ?? null);
          setOffices(o);
          reportLog.info(
            `[reports] callcenter ${period} funnel gross=${c?.gross_cents ?? "null"} sets=${c?.sets ?? "null"} days=${c?.days_with_rows ?? 0} through=${c?.last_date ?? "none"}`
          );
        } else {
          setCompany(null);
          setOffices([]);
        }
        if (connect) {
          const d = await query<DialsRow>(ccDialsBySourceSql(period));
          const dd = await query<DialsDay>(ccDialsDailySql(CC_HEADLINE_SOURCE));
          if (cancelled) return;
          setDials(d);
          setDialsDaily(dd);
          const h = d.find((r) => r.source === CC_HEADLINE_SOURCE);
          reportLog.info(
            `[reports] callcenter ${period} dials(${CC_HEADLINE_SOURCE})=${h?.lp_dials ?? "null"} connects=${h?.lp_connects ?? "null"} through=${h?.last_date ?? "none"}`
          );
        } else {
          setDials([]);
          setDialsDaily([]);
        }
        if (agentFeed) {
          const a = await query<AgentRow>(ccAgentsSql(period, CC_HEADLINE_SOURCE));
          if (cancelled) return;
          setAgents(a);
          reportLog.info(`[reports] callcenter ${period} agents(${CC_HEADLINE_SOURCE})=${a.length}`);
        } else {
          setAgents([]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (error) return <Panel title="Sales floor">{`query failed: ${error}`}</Panel>;
  if (!feeds) return <Panel title="Sales floor">Loading CRM funnel and call-floor feeds...</Panel>;

  const funnelAvailable = (feeds.spine || feeds.today) && company != null && company.rows > 0;
  const headline = dials.find((r) => r.source === CC_HEADLINE_SOURCE) ?? dials[0] ?? null;
  const label = period === "today" ? "today" : "MTD";
  const c = company;

  // Coverage text per tile: its own day count and the last date it covers.
  const funnelCov = c
    ? period === "today"
      ? `${c.days_with_rows ? day(c.last_date) : "no row for today yet"}${c.provisional_rows ? ", provisional (CRM open day)" : ""}`
      : `${c.days_with_rows} of ${c.days_elapsed ?? "?"} days, through ${day(c.last_date)}${c.provisional_rows ? `, ${c.provisional_rows} provisional row(s)` : ""}`
    : "no funnel rows";
  const cancelCov = c
    ? period === "today"
      ? c.days_with_cancel_record ? day(c.last_date) : "no cancel record for today (CRM open day)"
      : `${c.days_with_cancel_record} of ${c.days_with_rows} days carry a cancel record`
    : "no funnel rows";
  const dialsCov = headline
    ? period === "today"
      ? headline.days_with_rows ? `${day(headline.last_date)}, ${headline.source} pull` : "no dial rows for today yet"
      : `${headline.days_with_rows} days, through ${day(headline.last_date)}, ${headline.source} pull`
    : "no dial rows";

  const agentCols: [keyof AgentRow, string][] = [
    ["agent_name", "Rep"], ["lp_dials", "Dials"], ["lp_connects", "Connects"], ["days_with_rows", "Days"], ["last_date", "Through"],
  ];
  const sortedAgents = [...agents].sort((x, y) => {
    const a = x[agentSort.key]; const b = y[agentSort.key];
    if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
    return (a < b ? -1 : a > b ? 1 : 0) * -agentSort.dir;
  });
  const sortedOffices = [...offices].sort((x, y) => {
    const a = (x[officeSort.key] as number | null) ?? -1e18;
    const b = (y[officeSort.key] as number | null) ?? -1e18;
    return officeSort.dir * (b - a);
  });
  const officeCols: [keyof OfficeRow, string][] = [
    ["office_name", "Market"], ["leads", "Leads"], ["sets", "Appts set"], ["issues", "Appts issued"], ["demos", "Meetings"], ["sales", "Sales"],
    ["gross_cents", "Gross revenue"], ["cancel_gross_cents", "Cancels"], ["net_cents", "Net revenue"], ["days_with_rows", "Days"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(["today", "mtd"] as CcPeriod[]).map((p) => (
          <Chip key={p} on={period === p} onClick={() => setPeriod(p)}>
            {p === "today" ? "Today" : "Month to date"}
          </Chip>
        ))}
      </div>

      {!funnelAvailable && (
        <Missing
          what={`CRM funnel rows for ${label}`}
          why={
            !feeds.spine && !feeds.today
              ? "neither lp_spine__fact_funnel_daily nor funnel__fact_funnel_daily registered (file absent at /data/reports/)"
              : period === "today"
              ? "the today file (funnel__fact_funnel_daily) has not published today's row yet; the next refresh writes it"
              : "the data file carries no rows for this month"
          }
          owner="Reporting"
          byWhen="next wave run"
        />
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Gross revenue" value={c ? money(c.gross_cents) : UNAVAILABLE} sub={label === "MTD" ? "month to date" : "today"} />
        <Tile label="Net revenue" value={c ? money(c.net_cents) : UNAVAILABLE} sub="gross minus cancels, counted in the cancel month" />
        <Tile label="Leads" value={c ? num(c.leads) : UNAVAILABLE} sub={`${c ? num(c.sets) : UNAVAILABLE} became appointments`} />
        <Tile label="Appointments issued" value={c ? num(c.issues) : UNAVAILABLE} sub="handed to a rep" />
        <Tile label="Sales" value={c ? num(c.sales) : UNAVAILABLE} sub={`${c ? num(c.cancels) : UNAVAILABLE} cancels in the period`} />
        <Tile label="Close rate" value={c ? ratio(c.sales, c.issues) : UNAVAILABLE} sub="sales ÷ issued appointments" />
      </div>

      {!headline && (
        <Missing
          what={`CRM dials and connects for ${label}`}
          why={
            feeds.connect
              ? "the connect feed has no rows in this window"
              : "callfloor_connect_rate_lp_daily.parquet not registered (file absent at /data/reports/callfloor/)"
          }
          owner="Reporting"
          byWhen="next export run"
        />
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
        <Tile label="Dials" value={headline ? num(headline.lp_dials) : UNAVAILABLE} sub="from the CRM's call log" />
        <Tile label="Connects" value={headline ? num(headline.lp_connects) : UNAVAILABLE} sub={`${headline ? num(headline.lp_machine) : UNAVAILABLE} more reached a machine`} />
        <Tile label="Connect rate" value={headline ? ratio(headline.lp_connects, headline.lp_dials) : UNAVAILABLE} sub="connects ÷ dials" />
        <Tile label="Set rate" value={c && headline ? ratio(c.sets, headline.lp_connects) : UNAVAILABLE} sub="appointments set ÷ connects" />
        <Tile label="Dials per set" value={c && headline && c.sets && headline.lp_dials != null ? (headline.lp_dials / c.sets).toFixed(1) : UNAVAILABLE} sub={`${headline ? num(headline.agents_peak) : UNAVAILABLE} reps dialing on the busiest day`} />
      </div>

      <Panel title="Dials and connects by day" sub="month to date">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-[13px] tabular-nums">
            <thead>
              <tr>
                {["Day", "Dials", "Connects", "Machine", "Connect rate", "Reps"].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)] ${i === 0 ? "text-left" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dialsDaily.map((r) => (
                <tr key={r.call_date} className="border-b border-border">
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-left">{day(r.call_date)}</td>
                  <td className="px-2.5 py-1.5">{num(r.lp_dials)}</td>
                  <td className="px-2.5 py-1.5">{num(r.lp_connects)}</td>
                  <td className="px-2.5 py-1.5">{num(r.lp_machine)}</td>
                  <td className="px-2.5 py-1.5">{ratio(r.lp_connects, r.lp_dials)}</td>
                  <td className="px-2.5 py-1.5">{num(r.agents)}</td>
                </tr>
              ))}
              {dialsDaily.length === 0 && (
                <tr><td colSpan={6} className="px-2.5 py-2 text-left text-muted-foreground">no rows this month</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Markets" sub={`${label}, through ${c ? day(c.last_date) : "today"}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-[13px] tabular-nums">
            <thead>
              <tr>
                {officeCols.map(([k, l]) => (
                  <th
                    key={k}
                    aria-sort={officeSort.key === k ? (officeSort.dir > 0 ? "descending" : "ascending") : "none"}
                    className={`whitespace-nowrap px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)] first:text-left ${officeSort.key === k ? "text-primary" : ""}`}
                  >
                    <button type="button" className="font-semibold hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setOfficeSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: 1 }))}>
                      {l}{officeSort.key === k ? (officeSort.dir > 0 ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
                <th className="whitespace-nowrap px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)]">Close</th>
                <th className="whitespace-nowrap px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)]">Gross revenue per issued appointment</th>
              </tr>
            </thead>
            <tbody>
              {sortedOffices.map((o) => (
                <tr key={o.office_id} className="border-b border-border">
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-left">{o.office_name}</td>
                  <td className="px-2.5 py-1.5">{num(o.leads)}</td>
                  <td className="px-2.5 py-1.5">{num(o.sets)}</td>
                  <td className="px-2.5 py-1.5">{num(o.issues)}</td>
                  <td className="px-2.5 py-1.5">{num(o.demos)}</td>
                  <td className="px-2.5 py-1.5">{num(o.sales)}</td>
                  <td className="px-2.5 py-1.5">{money(o.gross_cents)}</td>
                  <td className="px-2.5 py-1.5">{money(o.cancel_gross_cents)}</td>
                  <td className="px-2.5 py-1.5">{money(o.net_cents)}</td>
                  <td className="px-2.5 py-1.5">{num(o.days_with_rows)}</td>
                  <td className="px-2.5 py-1.5">{ratio(o.sales, o.issues)}</td>
                  <td className="px-2.5 py-1.5">{o.issues ? money(o.gross_cents != null ? o.gross_cents / o.issues : null) : UNAVAILABLE}</td>
                </tr>
              ))}
              {sortedOffices.length === 0 && (
                <tr><td colSpan={12} className="px-2.5 py-2 text-left text-muted-foreground">no office rows in this window</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Close rate = sales ÷ issued appointments. Net = gross minus cancels, counted in the month of the cancel.</p>
      </Panel>

      <Panel title="Reps" sub={`${label}, connect rate = connects ÷ dials`}>
        {!feeds.agents ? (
          <Missing
            what={`Dials and connects by rep for ${label}`}
            why="callfloor_connect_rate_lp_agent_daily.parquet not registered (file absent at /data/reports/callfloor/)"
            owner="Reporting"
            byWhen="next export run"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-[13px] tabular-nums">
              <thead>
                <tr>
                  {agentCols.map(([k, l]) => (
                    <th
                      key={k}
                      aria-sort={agentSort.key === k ? (agentSort.dir > 0 ? "descending" : "ascending") : "none"}
                      className={`whitespace-nowrap px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)] first:text-left ${agentSort.key === k ? "text-primary" : ""}`}
                    >
                      <button type="button" className="font-semibold hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setAgentSort((st) => (st.key === k ? { key: k, dir: (st.dir * -1) as 1 | -1 } : { key: k, dir: 1 }))}>
                        {l}{agentSort.key === k ? (agentSort.dir > 0 ? " ↓" : " ↑") : ""}
                      </button>
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink2)]">Connect rate</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((a) => (
                  <tr key={a.agent_key} className="border-b border-border">
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-left">{a.agent_name ?? a.agent_key}</td>
                    <td className="px-2.5 py-1.5">{num(a.lp_dials)}</td>
                    <td className="px-2.5 py-1.5">{num(a.lp_connects)}</td>
                    <td className="px-2.5 py-1.5">{num(a.days_with_rows)}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">{day(a.last_date)}</td>
                    <td className="px-2.5 py-1.5">{ratio(a.lp_connects, a.lp_dials)}</td>
                  </tr>
                ))}
                {sortedAgents.length === 0 && (
                  <tr><td colSpan={6} className="px-2.5 py-2 text-left text-muted-foreground">no agent rows in this window</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Missing({ what, why }: { what: string; why: string; owner?: string; byWhen?: string }) {
  return (
    <div className="rounded-xl border border-[var(--warn)]/50 bg-[var(--warn)]/10 p-3 px-4 text-[13px]">
      <span className="font-semibold">Not available: {what}.</span> {why}.
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 px-4">
      <div className="mb-2 flex items-baseline gap-2.5">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {sub && <span className="ml-auto text-[11.5px] font-normal normal-case text-muted-foreground">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border border-border px-3.5 py-1 text-[12.5px] ${
        on ? "bg-primary font-semibold text-primary-foreground" : "bg-card text-[var(--ink2)]"
      }`}
    >
      {children}
    </button>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 px-3.5">
      <div className="text-[12px] text-[var(--ink2)]">{label}</div>
      <div className="text-[20px] font-bold">{value || UNAVAILABLE}</div>
      <div className="min-h-[32px] text-[12px] text-muted-foreground">{sub}</div>
    </div>
  );
}
