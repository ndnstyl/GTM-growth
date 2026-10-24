"use client";

// Executive readout: every figure comes from the demo database through lib/reports/spine/client.ts.
// A missing feed says so in place; nothing is ever substituted from another source.

import { useEffect, useState } from "react";
import { dollars, loadSpineExec, SpineExecFeed } from "@/lib/reports/spine/client";
import { PageHeader } from "@/components/shell/PageHeader";
import { Kpi } from "@/components/shell/Kpi";
import { dayLabel, fmt, metrics, monthValue, type KpiKey } from "@/lib/demo/metrics";

const monthName = (period: string) => new Date(period + "-15T12:00:00").toLocaleDateString("en-US", { month: "long" });

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="self-start rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

const LAST_MONTH = Object.keys(metrics.months)[1];

function MerCard() {
  const v = (k: KpiKey) => monthValue(LAST_MONTH, k);
  return (
    <div>
      <Kpi compact kpi="mer" win={LAST_MONTH} label="Revenue ÷ ad spend" value={fmt("mer", v("mer"))} />
      <div className="mt-1 text-[13px] text-[var(--ink2)]">
        {fmt("gross_revenue", v("gross_revenue"))} of revenue on {fmt("ad_spend", v("ad_spend"))} of ad spend
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Google Ads", "Meta", "Microsoft Ads"].map((p) => (
          <span key={p} className="rounded bg-[var(--good)]/15 px-1.5 py-0.5 text-[12px] font-semibold text-[var(--good)]">{p}</span>
        ))}
      </div>
    </div>
  );
}

function UnitCostsCard() {
  const rows: [string, KpiKey][] = [
    ["Cost per lead", "cost_per_lead"],
    ["Cost per set", "cost_per_set"],
    ["Cost per sale", "cost_per_sale"],
  ];
  return (
    <div>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map(([label, k]) => (
            <tr key={k} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-2 text-[var(--ink2)]">{label}</td>
              <td className="py-1.5 text-right font-semibold" data-kpi={k} data-window={LAST_MONTH}>{fmt(k, monthValue(LAST_MONTH, k))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1.5 text-[12px] text-muted-foreground">{monthName(LAST_MONTH)}, company total, ad spend over each count.</div>
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
      <PageHeader title="Executive readout" subtitle={`Unit economics for the whole company, data through ${dayLabel(metrics.through)}. Sample data.`} />

      <Card title="Bottom line">
        <p className="text-[14px] leading-relaxed">{`Last month the company booked ${fmt("gross_revenue", monthValue(LAST_MONTH, "gross_revenue"))} on ${fmt("ad_spend", monthValue(LAST_MONTH, "ad_spend"))} of ad spend, a MER of ${fmt("mer", monthValue(LAST_MONTH, "mer"))}, and trailing twelve-month revenue is ${feed.revenue_ttm && feed.revenue_ttm.change_pct != null ? (feed.revenue_ttm.change_pct >= 0 ? "+" : "") + feed.revenue_ttm.change_pct + "%" : "n/a"} on the year before. Cost per sale was ${fmt("cost_per_sale", monthValue(LAST_MONTH, "cost_per_sale"))}.`}</p>
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

        <Card title={`MER, ${monthName(LAST_MONTH)}`}>
          <MerCard />
        </Card>

        <Card title={`Unit costs, ${monthName(LAST_MONTH)}`}>
          <UnitCostsCard />
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
