"use client";

// Executive readout: every figure comes from the demo database through lib/reports/spine/client.ts.
// A missing feed says so in place; nothing is ever substituted from another source.

import { useEffect, useState } from "react";
import { dollars, loadSpineExec, MerReading, SpineExecFeed, UnitCosts } from "@/lib/reports/spine/client";
import { PageHeader } from "@/components/shell/PageHeader";

const monthName = (period: string) => new Date(period + "-15T12:00:00").toLocaleDateString("en-US", { month: "long" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const PLATFORM: Record<string, string> = { google_ads: "Google Ads", meta: "Meta", microsoft_ads: "Microsoft Ads" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="self-start rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function MerCard({ mer }: { mer: MerReading | null }) {
  if (!mer) return <div className="text-[13px] text-muted-foreground">No reading for this month yet.</div>;
  const multiple = mer.spend_cents ? mer.revenue_cents / mer.spend_cents : null;
  return (
    <div>
      <div className="text-2xl font-bold">{multiple !== null ? `${multiple.toFixed(1)}x` : "n/a"}</div>
      <div className="mt-1 text-[13px] text-[var(--ink2)]">
        {dollars(mer.revenue_cents)} of revenue on {dollars(mer.spend_cents)} of ad spend
      </div>
      {mer.mer_pct !== null ? (
        <div className="mt-1 text-[12px] text-muted-foreground">Ad spend as a share of revenue: {mer.mer_pct}%</div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {mer.platforms_expected.map((p) => (
          <span key={p} className={"rounded px-1.5 py-0.5 text-[12px] font-semibold " + (mer.platforms_reporting.includes(p) ? "bg-[var(--good)]/15 text-[var(--good)]" : "bg-[var(--crit)]/15 text-[var(--crit)] line-through")}>
            {PLATFORM[p] ?? p}
          </span>
        ))}
      </div>
    </div>
  );
}

function UnitCostsCard({ u }: { u: UnitCosts | null }) {
  if (!u) return <div className="text-[13px] text-muted-foreground">No unit costs for this month yet.</div>;
  const rows: [string, number | null][] = [
    ["Cost per lead", u.cost_per_lead_cents],
    ["Cost per set", u.cost_per_set_cents],
    ["Cost per issued appointment", u.cost_per_issue_cents],
    ["Cost per sale", u.cost_per_sale_cents],
  ];
  return (
    <div>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map(([label, cents]) => (
            <tr key={label} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-2 text-[var(--ink2)]">{label}</td>
              <td className="py-1.5 text-right font-semibold">{dollars(cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1.5 text-[12px] text-muted-foreground">{monthName(u.period)}, company total. Spend is reported at company level, never split finer than the source records.</div>
    </div>
  );
}

export function Exec() {
  const [feed, setFeed] = useState<SpineExecFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSpineExec().then(setFeed).catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="m-6 rounded-xl border border-border bg-card p-4 text-[13px] text-[var(--crit)]">
        The executive readout did not load: {error}. Numbers are never substituted from another source.
      </div>
    );
  }
  if (!feed) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6" aria-busy="true">
        <PageHeader title="Executive readout" subtitle="Unit economics for the whole company" />
        <div className="h-[84px] g-skel rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[170px] g-skel rounded-xl" />)}
        </div>
      </div>
    );
  }

  const ttm = feed.revenue_ttm;
  const q = feed.verify_queue_pending;
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <PageHeader title="Executive readout" subtitle={`Unit economics for the whole company, as of ${dayLabel(feed.as_of)}, ${timeLabel(feed.as_of)}. Sample data.`} />

      <Card title="Bottom line">
        <p className="text-[14px] leading-relaxed">{feed.bottom_line}</p>
      </Card>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Card title="Revenue, trailing 12 months">
          {ttm ? (
            <div>
              <div className="text-2xl font-bold">{dollars(ttm.ttm_now_cents)}</div>
              <div className="mt-1 text-[13px]">
                against {dollars(ttm.ttm_prior_cents)} a year earlier,{" "}
                <span className={ttm.change_abs_cents >= 0 ? "text-[var(--good)]" : "text-[var(--crit)]"}>
                  {ttm.change_abs_cents >= 0 ? "+" : ""}
                  {dollars(ttm.change_abs_cents)}
                  {ttm.change_pct !== null ? ` (${ttm.change_pct}%)` : ""}
                </span>
              </div>
              <div className="mt-1.5 text-[12px] text-muted-foreground">{ttm.window_now} against {ttm.window_prior}</div>
            </div>
          ) : (
            <div className="text-[13px] text-muted-foreground">No trailing-year reading yet.</div>
          )}
        </Card>

        <Card title={`MER, ${feed.mer.last_month ? monthName(feed.mer.last_month.period) : "last month"}`}>
          <MerCard mer={feed.mer.last_month} />
        </Card>

        <Card title={`Unit costs, ${feed.unit_costs.last_month ? monthName(feed.unit_costs.last_month.period) : "last month"}`}>
          <UnitCostsCard u={feed.unit_costs.last_month} />
        </Card>

        <Card title="Monthly revenue, last 13 months">
          <table className="w-full text-[13px]">
            <tbody>
              {feed.revenue_monthly.map((m) => (
                <tr key={m.period} className="border-b border-border/40 last:border-0">
                  <td className="py-1 pr-2 text-[var(--ink2)]">
                    {monthName(m.period)} {m.period.slice(0, 4)}
                    {m.mtd ? <span className="ml-1.5 text-[12px] text-muted-foreground">(month so far)</span> : null}
                  </td>
                  <td className="py-1 text-right font-medium">{dollars(m.gross_cents)}</td>
                  <td className={"w-16 py-1 text-right " + (m.mom_pct === null ? "text-muted-foreground" : m.mom_pct >= 0 ? "text-[var(--good)]" : "text-[var(--crit)]")}>
                    {m.mom_pct !== null ? `${m.mom_pct > 0 ? "+" : ""}${m.mom_pct}%` : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Month close status">
          {feed.month_state.length === 0 ? (
            <div className="text-[13px] text-muted-foreground">No months closed yet; every month is still open.</div>
          ) : (
            <table className="w-full text-[13px]">
              <tbody>
                {feed.month_state.slice(-6).map((m) => (
                  <tr key={m.period} className="border-b border-border/40 last:border-0">
                    <td className="py-1 pr-2">{monthName(m.period)} {m.period.slice(0, 4)}</td>
                    <td className="py-1 capitalize text-[var(--ink2)]">{m.status}</td>
                    <td className="py-1 text-right text-muted-foreground">{m.closed_by ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Waiting on an approver">
          {q.length === 0 ? (
            <div className="text-[13px] text-muted-foreground">Nothing is waiting for approval.</div>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {q.map((x) => (
                <li key={x.id}>
                  {x.rows} hand-recorded rows from the agency&apos;s Meta sheet wait for a named approver, staged {dayLabel(x.staged_at)}.
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
