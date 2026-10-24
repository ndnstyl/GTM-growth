"use client";

import { PageFrame, Card, Chip, GrowBar, Loading, Missing } from "@/components/apps/ui";
import { useFixture, useHashTab } from "@/lib/demo/useFixture";
import { DEFINITIONS } from "@/lib/demo/definitions";

type Theme = { theme: string; calls: number; quote: string };
type Swot = {
  as_of: string; calls_read: number; period: string;
  strengths: Theme[]; weaknesses: Theme[]; opportunities: Theme[]; threats: Theme[];
  objections: { text: string; calls: number; trend: "up" | "down" | "flat"; rebuttal: string }[];
  competitors: { name: string; mentions: number; positioning: string }[];
};
type Offer = {
  positioning: string;
  pillars: { title: string; proof: string; claims_status: "approved" | "pending" | "blocked" }[];
  offers: { id: string; name: string; hook: string; price_anchor: string; guarantee: string; test_status: "winning" | "testing" | "retired"; lift_pct: number }[];
  bursts: { id: string; name: string; channel: string; window: string; headline: string; status: string }[];
};

const TABS = ["swot", "offer", "definitions"] as const;
const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const CLAIM_TONE: Record<string, string> = { approved: "text-[var(--good)]", pending: "text-[var(--warn)]", blocked: "text-[var(--crit)]" };
const TEST_TONE: Record<string, string> = { winning: "text-[var(--good)]", testing: "text-[var(--warn)]", retired: "text-muted-foreground" };

function Quad({ title, tone, rows }: { title: string; tone: string; rows: Theme[] }) {
  const max = Math.max(1, ...rows.map((r) => r.calls));
  return (
    <Card title={title}>
      <ul className="space-y-2.5">
        {rows.map((r, ri) => (
          <li key={r.theme}>
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-semibold">{r.theme}</span>
              <span className="tick ml-auto text-[11px] text-muted-foreground">{r.calls} calls</span>
            </div>
            <div className="mt-1 h-[4px] overflow-hidden rounded bg-secondary">
              <GrowBar pct={(r.calls / max) * 100} className={tone} delay={ri * 4} />
            </div>
            <p className="mt-1 text-[11.5px] italic text-[var(--ink2)]">&ldquo;{r.quote}&rdquo;</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ResearchPage() {
  const [tab] = useHashTab(TABS, "swot");
  const swot = useFixture<Swot>("/demo/research/swot.json");
  const offer = useFixture<Offer>("/demo/research/offer.json");

  return (
    <PageFrame
      title="Research & Offer"
      subtitle="Recorded sales calls read for objections, strengths and weaknesses, then turned into the offer we test."
    >
      {tab === "swot" ? (
        swot.loading ? <Loading /> : !swot.data ? <Missing what="The call SWOT" /> : (
          <>
            <p className="text-[13px] text-[var(--ink2)]">{swot.data.calls_read.toLocaleString()} calls read in the {swot.data.period.replace("last", "last")}, as of {fmtDay(swot.data.as_of)}.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Quad title="Strengths" tone="bg-[var(--good)]" rows={swot.data.strengths} />
              <Quad title="Weaknesses" tone="bg-[var(--crit)]" rows={swot.data.weaknesses} />
            </div>
            <div className="grid gap-3">
              <Card title="Top objections">
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Objection</th><th className="py-1 pr-2 text-right">Calls</th><th className="py-1 pr-2">Trend</th></tr></thead>
                  <tbody>
                    {swot.data.objections.map((o) => (
                      <tr key={o.text} className="border-t border-border align-top">
                        <td className="py-1.5 pr-2">
                          <div className="font-medium">{o.text}</div>
                          <div className="text-[11px] text-muted-foreground">Rebuttal: {o.rebuttal}</div>
                        </td>
                        <td className="tick py-1.5 pr-2 text-right font-semibold">{o.calls}</td>
                        <td className={`py-1.5 pr-2 font-bold ${o.trend === "up" ? "text-[var(--crit)]" : o.trend === "down" ? "text-[var(--good)]" : "text-muted-foreground"}`}>
                          {o.trend === "up" ? "▲" : o.trend === "down" ? "▼" : "▬"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        )
      ) : null}

      {tab === "offer" ? (
        offer.loading ? <Loading /> : !offer.data ? <Missing what="The offer" /> : (
          <>
            <Card title="Positioning">
              <p className="text-[15px] font-semibold leading-snug">{offer.data.positioning}</p>
            </Card>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card title="Pillars and proof">
                <ul className="space-y-2.5">
                  {offer.data.pillars.map((p) => (
                    <li key={p.title} className="text-[12px]">
                      <div className="flex items-baseline gap-2"><b className="text-[13px]">{p.title}</b><span className={`ml-auto text-[10.5px] font-bold uppercase ${CLAIM_TONE[p.claims_status]}`}>{p.claims_status}</span></div>
                      <p className="text-[11.5px] text-[var(--ink2)]">{p.proof}</p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Offers on test">
                <ul className="space-y-2.5">
                  {offer.data.offers.map((o) => (
                    <li key={o.id} className="text-[12px]">
                      <div className="flex items-baseline gap-2">
                        <b className="text-[13px]">{o.name}</b>
                        <span className={`ml-auto text-[10.5px] font-bold uppercase ${TEST_TONE[o.test_status]}`}>{o.test_status}</span>
                        <span className={`tick text-[11px] font-bold ${o.lift_pct >= 0 ? "text-[var(--good)]" : "text-[var(--crit)]"}`}>{o.lift_pct >= 0 ? "+" : ""}{o.lift_pct.toFixed(1)}%</span>
                      </div>
                      <p className="text-[11.5px] text-[var(--ink2)]">{o.hook}</p>
                      <p className="text-[11px] text-muted-foreground">{o.price_anchor} · {o.guarantee}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            <h2 className="pt-1 text-[13px] font-bold">Short campaign pushes</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {offer.data.bursts.map((b) => (
                <Card key={b.id} title={b.channel} right={<Chip>{b.status}</Chip>}>
                  <div className="text-[14px] font-bold">{b.name}</div>
                  <div className="text-[12px] text-muted-foreground">{b.window}</div>
                  <p className="mt-2 text-[13px] text-[var(--ink2)]">{b.headline}</p>
                </Card>
              ))}
            </div>
          </>
        )
      ) : null}

      {tab === "definitions" ? (
        <Card title="What each number means">
          <table className="w-full table-fixed text-[13px]">
            <thead><tr className="text-left text-muted-foreground"><th className="w-[26%] px-2 py-1.5 font-semibold">Metric</th><th className="px-2 py-1.5 font-semibold">How it is counted</th><th className="w-[18%] px-2 py-1.5 font-semibold">Owner</th></tr></thead>
            <tbody>
              {DEFINITIONS.map((d) => (
                <tr key={d.term} className="border-t border-border align-top">
                  <td className="px-2 py-2 font-semibold">{d.term}</td>
                  <td className="px-2 py-2 text-[var(--ink2)]">{d.meaning}</td>
                  <td className="px-2 py-2 text-[var(--ink2)]">{d.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </PageFrame>
  );
}
