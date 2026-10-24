"use client";

import { PageHeader } from "@/components/shell/PageHeader";

// the explainer year library, one place to see everything ideated.
// Storyboards only; nothing here is produced. Reads /data/content/library.json, written by
// specs/230-explainer-year-library/tools/publish_cockpit.py, so a data refresh needs no rebuild.
// Read-only by construction: no write path, no outbound link.

import { useEffect, useMemo, useState } from "react";
import { Search, Film, Clapperboard, Images, Lock, CheckCircle2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Hook = { id: string; on_screen: string; spoken: string; brand?: string };
type Beat = { t: string; picture: string; route: string; on_screen?: string; vo?: string };
type Byte = { id: string; from_beats?: number[]; hook: string; end_card: string | { line_id: string }; brand?: string };
const lineOf = (e: Byte["end_card"]) => (typeof e === "string" ? e : e?.line_id ?? "missing");
type Still = { kind: string; copy: string; route: string };
type Gen = { route: string; prompt_sketch: string; est_credits: number };
type Rec = {
  id: string; tier: "flagship" | "series" | "still" | "carousel"; series: string; title: string;
  brand_scope: string; format: string; duration_s: number; aspects: string[]; style: string;
  angle: { norm_broken: string; mechanism: string }; hook: Hook; alt_hooks: Hook[]; teach: string;
  beats: Beat[]; bytes?: Byte[]; end_card: { line_id: string; variant_note?: string }; cta_tier: string;
  facts: string[]; gates: string[]; stills: Still[]; broll_needs: string[]; ai_generations: Gen[];
  est_credits_total: number; people_on_camera: boolean; publish_month: number; week: number;
  catalogue_ticket_ids?: string[];
};
type Lib = { meta: { generated_at: string; records: number; credits_by_month: Record<string, number>; credit_ceiling_month: number }; records: Rec[] };

// Plain-words gate labels with the person who clears each (rules.md §Gates).
const GATES: Record<string, { label: string; owner: string }> = {
  RELEASE: { label: "Person on camera needs a release", owner: "Content lead" },
  PREREQ: { label: "Needs a rig, test or footage we do not have yet", owner: "Producer" },
  CLAIMS: { label: "Wording needs the approved claims list", owner: "Brand lead" },
  CONTACT: { label: "Contacts a customer", owner: "Compliance" },
  OPSEC: { label: "Needs a compliance read", owner: "Compliance" },
  SPEC: { label: "Needs a number from operations", owner: "Operations" },
};
const TIER_LABEL: Record<string, string> = { flagship: "Flagship", series: "Short", carousel: "Carousel", still: "Still" };
const BRAND_LABEL: Record<string, string> = { universal: "Both brands", "nb-main": "Northbeam Home", "nb-pro": "Northbeam Pro", "both-variants": "Both brands, two versions" };

function tierClass(t: string) {
  if (t === "flagship") return "border-primary bg-accent text-accent-foreground";
  if (t === "carousel" || t === "still") return "border-border bg-muted text-foreground";
  return "border-border bg-card text-foreground";
}

function Chip({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] ${tone}`}>{children}</span>;
}

function HookLine({ h, label }: { h: Hook; label: string }) {
  return (
    <div className="border-l-2 border-primary py-1 pl-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <Chip>{label}</Chip>
        <span className="text-[13px] font-bold">{h.on_screen}</span>
        {h.brand ? <Chip>{BRAND_LABEL[h.brand] ?? h.brand} only</Chip> : null}
      </div>
      <div className="text-[12.5px] text-muted-foreground">{h.spoken}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Detail({ r }: { r: Rec }) {
  return (
    <div className="px-5 pb-10">
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="font-semibold">{TIER_LABEL[r.tier]}</Chip>
        <Chip>{r.series}</Chip>
        <Chip>{BRAND_LABEL[r.brand_scope] ?? r.brand_scope}</Chip>
        <Chip>{r.format}</Chip>
        <Chip>{r.duration_s} s</Chip>
        <Chip>{r.aspects.join(" · ")}</Chip>
        <Chip>Month {r.publish_month}, week {r.week}</Chip>
        <Chip>~{Math.round(r.est_credits_total)} credits</Chip>
      </div>
      {r.gates.length ? (
        <div className="mt-3 rounded-lg border border-[var(--warn)] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-[var(--warn)]"><Lock size={13} /> Waiting on</div>
          <ul className="space-y-0.5 text-[12.5px]">
            {r.gates.map((g) => <li key={g}>{GATES[g]?.label ?? g} <span className="text-muted-foreground">· {GATES[g]?.owner ?? "unassigned"}</span></li>)}
          </ul>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--good)]"><CheckCircle2 size={13} /> Nothing gates this piece</div>
      )}
      <Section title="What it teaches"><p className="text-[13px]">{r.teach}</p></Section>
      <Section title="The angle">
        <p className="text-[13px]">Breaks the norm: <q>{r.angle.norm_broken}</q></p>
        <p className="text-[12.5px] text-muted-foreground">{r.angle.mechanism} · style {r.style}</p>
      </Section>
      <Section title="Hook and three to test against it">
        <div className="space-y-2">
          <HookLine h={r.hook} label={`Main · ${r.hook.id}`} />
          {r.alt_hooks.map((h, i) => <HookLine key={i} h={h} label={`Alt ${i + 1} · ${h.id}`} />)}
        </div>
      </Section>
      <Section title={`Beats (${r.beats.length})`}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-[12px]">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr><th className="p-2">Time</th><th className="p-2">Picture</th><th className="p-2">Made with</th><th className="p-2">On screen</th><th className="p-2">Voice</th></tr>
            </thead>
            <tbody>
              {r.beats.map((b, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="whitespace-nowrap p-2 font-mono">{b.t}</td>
                  <td className="p-2">{b.picture}</td>
                  <td className="whitespace-nowrap p-2 font-mono text-[11px]">{b.route}</td>
                  <td className="p-2 font-semibold">{b.on_screen}</td>
                  <td className="p-2">{b.vo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {r.bytes?.length ? (
        <Section title={`Short cuts from this film (${r.bytes.length})`}>
          <ul className="space-y-1 text-[12.5px]">
            {r.bytes.map((b) => <li key={b.id}><span className="font-mono text-[11px] text-muted-foreground">{b.id}</span> {b.hook} <Chip>end card {lineOf(b.end_card)}</Chip>{b.brand ? <> <Chip>{BRAND_LABEL[b.brand] ?? b.brand} only</Chip></> : null}</li>)}
          </ul>
        </Section>
      ) : null}
      <Section title="End card"><p className="text-[12.5px]">Line {r.end_card.line_id} over the Form 3 block · call to action tier {r.cta_tier}{r.end_card.variant_note ? ` · ${r.end_card.variant_note}` : ""}</p></Section>
      <Section title="Stills and carousels">
        <ul className="space-y-1 text-[12.5px]">{r.stills.map((s, i) => <li key={i}><Chip>{s.kind}</Chip> {s.copy} <span className="font-mono text-[11px] text-muted-foreground">{s.route}</span></li>)}</ul>
      </Section>
      <Section title="B-roll needed">
        <ul className="list-disc space-y-0.5 pl-5 text-[12.5px]">{r.broll_needs.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </Section>
      <Section title={`AI generations (about ${Math.round(r.est_credits_total)} credits)`}>
        {r.ai_generations.length ? (
          <ul className="space-y-1 text-[12.5px]">{r.ai_generations.map((g, i) => <li key={i}><span className="font-mono text-[11px] text-muted-foreground">{g.route}</span> {g.prompt_sketch} <Chip>~{g.est_credits}</Chip></li>)}</ul>
        ) : <p className="text-[12.5px] text-muted-foreground">None: made entirely with our footage, Blender and Remotion.</p>}
      </Section>
      <Section title="Facts it stands on">
        <ul className="list-disc space-y-0.5 pl-5 text-[12.5px]">{r.facts.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </Section>
    </div>
  );
}

type View = "year" | "series" | "gates";

export function ContentLibrary() {
  const [lib, setLib] = useState<Lib | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("year");
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [tier, setTier] = useState("");
  const [series, setSeries] = useState("");
  const [gate, setGate] = useState("");
  const [open, setOpen] = useState<Rec | null>(null);

  useEffect(() => {
    fetch("/data/content/library.json", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`library.json answered HTTP ${r.status}`); return r.json(); })
      .then((j: Lib) => {
        if (!Array.isArray(j.records)) throw new Error("library.json has no records array");
        setLib(j);
        // Content Studio links here as /reports/content/#<id>: open that storyboard on arrival.
        const want = decodeURIComponent(window.location.hash.slice(1));
        if (want) {
          const hit = j.records.find((r) => r.id === want);
          if (hit) setOpen(hit); else setErr(`no storyboard with id ${want} in the library`);
        }
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  const recs = useMemo(() => lib?.records ?? [], [lib]);
  const seriesList = useMemo(() => [...new Set(recs.map((r) => r.series))].sort(), [recs]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return recs.filter((r) =>
      (!brand || r.brand_scope === brand) && (!tier || r.tier === tier) && (!series || r.series === series) &&
      (!gate || (gate === "__ready" ? r.gates.length === 0 : r.gates.includes(gate))) &&
      (!s || JSON.stringify(r).toLowerCase().includes(s)));
  }, [recs, q, brand, tier, series, gate]);

  const stats = useMemo(() => ({
    flagships: recs.filter((r) => r.tier === "flagship").length,
    bytes: recs.reduce((a, r) => a + (r.bytes?.length ?? 0), 0),
    shorts: recs.filter((r) => r.tier === "series").length,
    stills: recs.reduce((a, r) => a + r.stills.length, 0) + recs.filter((r) => r.tier === "carousel" || r.tier === "still").length,
    ready: recs.filter((r) => r.gates.length === 0).length,
    credits: Math.round(recs.reduce((a, r) => a + r.est_credits_total, 0)),
  }), [recs]);

  const sel = "rounded-md border border-border bg-card px-2 py-1.5 text-[12px] text-foreground";
  const card = (r: Rec) => (
    <button key={r.id} onClick={() => setOpen(r)} title={`${r.title} · ${r.teach}`}
      className={`w-full rounded-md border px-2 py-1.5 text-left text-[11.5px] leading-snug hover:border-primary ${tierClass(r.tier)}`}>
      <div className="flex items-center gap-1">
        {r.tier === "flagship" ? <Film size={11} /> : r.tier === "series" ? <Clapperboard size={11} /> : <Images size={11} />}
        <span className="sr-only">{r.id}</span>
        {r.gates.length ? <Lock size={10} className="ml-auto text-[var(--warn)]" /> : null}
      </div>
      <div className="font-semibold">{r.title}</div>
      <div className="text-[10.5px] text-muted-foreground">{r.series} · {BRAND_LABEL[r.brand_scope] ?? r.brand_scope}</div>
    </button>
  );

  return (
    <div className="reports-shell flex min-h-full flex-col">
      <div className="px-6 pt-4"><PageHeader title="Content library" subtitle="Northbeam Home and Northbeam Pro, year one, storyboarded" /></div>

      {err ? (
        <div className="m-6 rounded-lg border border-[var(--crit)] p-4 text-[13px] font-semibold text-[var(--crit)]">
          The library did not load: {err}.
        </div>
      ) : !lib ? (
        <div className="m-6 text-[13px] text-muted-foreground">Loading the library...</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 px-4 pt-4">
            {[["Pieces", recs.length], ["Flagship films", stats.flagships], ["Short cuts from the films", stats.bytes], ["Series shorts", stats.shorts],
              ["Stills and carousel frames", stats.stills], ["Ready now, nothing gating", stats.ready], ["AI generation credits, whole year", stats.credits.toLocaleString()]]
              .map(([k, v]) => (
                <div key={String(k)} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="text-[18px] font-extrabold tabular-nums">{v}</div>
                  <div className="text-[11px] text-muted-foreground">{k}</div>
                </div>
              ))}
          </div>
          <p className="px-4 pt-2 text-[11.5px] text-muted-foreground">
            Nothing here is produced yet: each piece is made on approval, with its own credit check. Plan as of {new Date(lib.meta.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
          </p>

          <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
            {(["year", "series", "gates"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${view === v ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}>
                {v === "year" ? "Year calendar" : v === "series" ? "By series" : "What is waiting"}
              </button>
            ))}
            <label className="ml-2 flex flex-1 items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5">
              <Search size={13} className="text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, hooks, words, facts" className="w-full min-w-[140px] bg-transparent text-[12px] outline-none" />
            </label>
            <select className={sel} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
              <option value="">All brands</option>{Object.entries(BRAND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className={sel} value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Format">
              <option value="">All formats</option>{Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className={sel} value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Series">
              <option value="">All series</option>{seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={sel} value={gate} onChange={(e) => setGate(e.target.value)} aria-label="What is holding a piece back">
              <option value="">Ready or waiting</option><option value="__ready">Ready now</option>
              {Object.entries(GATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <span className="text-[11.5px] text-muted-foreground tabular-nums">{rows.length} shown</span>
          </div>

          {view === "year" && (
            <div className="overflow-x-auto px-4 py-4">
              <div className="grid min-w-[1800px] grid-cols-12 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const inM = rows.filter((r) => r.publish_month === m);
                  const cr = lib.meta.credits_by_month[String(m)] ?? 0;
                  return (
                    <div key={m} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
                      <div>
                        <div className="text-[13px] font-extrabold">Month {m}</div>
                        <div className="text-[10.5px] text-muted-foreground tabular-nums" title="AI generation credit estimate for the whole month, against the monthly ceiling">{inM.length} pieces · ~{cr} credits</div>
                      </div>
                      {[1, 2, 3, 4].map((w) => {
                        const inW = inM.filter((r) => r.week === w).sort((a, b) => (a.tier === "flagship" ? -1 : 0) - (b.tier === "flagship" ? -1 : 0));
                        return (
                          <div key={w}>
                            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Week {w}</div>
                            <div className="flex flex-col gap-1">{inW.map(card)}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "series" && (
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
              {seriesList.filter((s) => rows.some((r) => r.series === s)).map((s) => {
                const inS = rows.filter((r) => r.series === s).sort((a, b) => a.publish_month - b.publish_month);
                return (
                  <div key={s} className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 flex items-baseline justify-between"><span className="text-[13px] font-extrabold">{s}</span><span className="text-[11px] text-muted-foreground">{inS.length}</span></div>
                    <div className="flex flex-col gap-1">{inS.map(card)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "gates" && (
            <div className="grid gap-3 px-4 py-4 lg:grid-cols-2">
              <div className="rounded-lg border border-[var(--good)] bg-card p-3">
                <div className="mb-2 flex items-baseline justify-between"><span className="text-[13px] font-extrabold text-[var(--good)]">Ready now, nothing gating</span><span className="text-[11px] text-muted-foreground">{rows.filter((r) => !r.gates.length).length}</span></div>
                <div className="flex max-h-[520px] flex-col gap-1 overflow-y-auto">{rows.filter((r) => !r.gates.length).sort((a, b) => a.publish_month - b.publish_month).map(card)}</div>
              </div>
              {Object.entries(GATES).map(([g, info]) => {
                const inG = rows.filter((r) => r.gates.includes(g)).sort((a, b) => a.publish_month - b.publish_month);
                if (!inG.length) return null;
                return (
                  <div key={g} className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-0.5 flex items-baseline justify-between"><span className="text-[13px] font-extrabold">{info.label}</span><span className="text-[11px] text-muted-foreground">{inG.length}</span></div>
                    <div className="mb-2 text-[11px] text-muted-foreground">Clears it: {info.owner}</div>
                    <div className="flex max-h-[520px] flex-col gap-1 overflow-y-auto">{inG.map(card)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className={`reports-shell w-[96vw] !max-w-[960px] overflow-y-auto p-0 sm:w-[90vw]`}>
          {open ? (
            <>
              <SheetHeader className="border-b border-border px-5 py-3">
                <SheetTitle className="pr-8 text-[15px]"><span className="mr-2 font-mono text-[12px] text-primary">{open.id}</span>{open.title}</SheetTitle>
              </SheetHeader>
              <Detail r={open} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
