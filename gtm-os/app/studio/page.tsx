"use client";

import { scrollWithin } from "@/lib/motion/scroll";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Film, Image as ImageIcon, LayoutGrid, Loader2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { PageFrame, Tabs, TabPanel, Card, Chip, GrowBar, Loading, Missing } from "@/components/apps/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useFixture, useHashTab } from "@/lib/demo/useFixture";
import { lsGet, lsSet, withBase } from "@/lib/demo/base";
import { reducedMotionNow } from "@/lib/motion";

type Link = { url: string | null; label: string } | null;
type Source = { url: string | null; label: string } | null;
type Aspect = { id: string; label: string; w: number; h: number; mp4: string; webm: string; poster: string; bytes: number };
type Idea = { id: string; host: string; pillar: string; kind: string; text: string; hook: string; payoff: string; formats: string[]; source: Source; demo: string | null; link: Link; created: string };
type LibItem = { id: string; host: string; pillar: string; title: string; kind: "video" | "carousel" | "still"; stage: "draft" | "review" | "approved" | "posted"; duration_s: number | null; market: string; created: string; channels: string[]; note: string; thumb: string; slides?: string[]; media?: Aspect[]; script?: string | null; source: Source; link: Link };
type Emph = { word: string; color: "cyan" | "magenta" };
type Beat = { words: string; seconds: number; emphasis: Emph[]; callout: { label: string; body: string } | null; capture: string | null };
type ScriptSet = { id: string; host: string; created: string; seconds: number; reel: string | null; hook: Omit<Beat, "callout" | "capture">; beats: Beat[]; statAfter: number | null; stat: { value: string; label: string; source: string; seconds: number } | null; endCard: { linkText: string; cta: string; seconds: number } };
type Seat = { id: string; label: string; outcome: string; mode: "auto" | "review"; note?: string };
type Cut = { id: string; title: string; host: string; stage: string; progress: number; updated: string };
type Job = { id: string; seat: string; status: string; started: string; summary: string };
type Crew = { seats: Seat[]; hosts: { id: string; name: string; beat: string; lean: string }[]; cuts: Cut[]; jobs: Job[] };

const TABS = ["ideas", "library", "scripts", "crew"] as const;
const STAGES = ["draft", "review", "approved", "posted"] as const;
const STAGE_TONE: Record<string, string> = { draft: "text-[var(--ink2)]", review: "text-[var(--warn)]", approved: "text-[var(--good)]", posted: "text-primary" };
const KIND_WORD: Record<string, string> = { hook: "Hook", myth: "Myth", stat: "Stat", question: "Question", objection: "Objection", scene: "Scene", demo: "Demo" };
const PILLARS: Record<string, string> = { "speed-to-lead": "Speed to lead", "unit-economics": "Unit economics", revops: "RevOps", "connected-data": "Connected data", "ai-compliance": "AI and compliance", "ai-cockpit": "AI cockpit", "gtm-systems": "GTM systems" };
const PAGE = 24;
const sel = "rounded-md border border-border bg-background px-2 py-1.5 text-[13px]";

const dayLabel = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function BrandPick({ lanes, value, onChange }: { lanes: { id: string; label: string }[]; value: string; onChange: (b: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Brand and lane" className={`${sel} w-[8.5rem] sm:w-auto`}>
      <option value="">The Innovative Native, all lanes</option>
      {lanes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
    </select>
  );
}

function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  return kind === "video" ? <Film size={size} /> : kind === "carousel" ? <LayoutGrid size={size} /> : <ImageIcon size={size} />;
}

function Poster({ item }: { item: LibItem }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={withBase(item.thumb)} alt={item.title} loading="lazy" width={540} height={675} className="aspect-[4/5] w-full rounded-md bg-secondary object-cover" />
  );
}

function Words({ words, emphasis }: { words: string; emphasis: Emph[] }) {
  const map = new Map(emphasis.map((e) => [e.word, e.color]));
  return (
    <>
      {words.split(" ").map((w, i) => {
        const c = map.get(w);
        return <span key={i} style={c ? { color: c === "cyan" ? "var(--primary)" : "var(--magenta)", fontWeight: 700 } : undefined}>{w}{" "}</span>;
      })}
    </>
  );
}

function Ext({ l }: { l: { url: string | null; label: string } | null }) {
  if (!l) return null;
  return l.url
    ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{l.label}<ExternalLink size={11} /></a>
    : <span className="text-muted-foreground">{l.label}</span>;
}

function Player({ media }: { media: Aspect[] }) {
  const [id, setId] = useState(media[0].id);
  const m = media.find((x) => x.id === id) ?? media[0];
  return (
    <div>
      <div className="flex justify-center rounded-md bg-black">
        <video key={m.id} controls playsInline preload="metadata" poster={withBase(m.poster)} width={m.w} height={m.h} className="max-h-[56vh] w-auto max-w-full" aria-label={"Reel, " + m.label}>
          <source src={withBase(m.mp4)} type="video/mp4" />
          <source src={withBase(m.webm)} type="video/webm" />
        </video>
      </div>
      {media.length > 1 ? (
        <div className="mt-2 flex gap-1.5">
          {media.map((x) => (
            <button key={x.id} onClick={() => setId(x.id)} aria-pressed={x.id === m.id} className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold ${x.id === m.id ? "border-primary text-primary" : "border-border text-[var(--ink2)] hover:text-foreground"}`}>{x.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Slides({ slides, title }: { slides: string[]; title: string }) {
  const [i, setI] = useState(0);
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBase(slides[i])} alt={`${title}, slide ${i + 1} of ${slides.length}`} width={540} height={675} className="mx-auto max-h-[56vh] w-auto max-w-full rounded-md" />
      {slides.length > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-2 text-[12px]">
          <button onClick={() => setI((i + slides.length - 1) % slides.length)} aria-label="Previous slide" className="rounded-md border border-border p-1 hover:text-primary"><ChevronLeft size={14} /></button>
          <span className="tick text-muted-foreground">{i + 1} / {slides.length}</span>
          <button onClick={() => setI((i + 1) % slides.length)} aria-label="Next slide" className="rounded-md border border-border p-1 hover:text-primary"><ChevronRight size={14} /></button>
        </div>
      ) : null}
    </div>
  );
}

const fmtTime = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function StudioPage() {
  const [tab, setTab] = useHashTab(TABS, "ideas");
  const [lane, setLane] = useState("");
  const brands = useFixture<{ brands: { id: string; label: string }[]; lanes: { id: string; label: string }[] }>("/demo/studio/brands.json");
  const ideas = useFixture<{ ideas: Idea[] }>("/demo/studio/ideas.json");
  const library = useFixture<{ items: LibItem[] }>("/demo/studio/library.json");
  const scripts = useFixture<{ sets: ScriptSet[] }>("/demo/studio/scripts.json");
  const crew = useFixture<Crew>("/demo/studio/crew.json");

  const [stageFilter, setStageFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [open, setOpen] = useState<LibItem | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [localIdeas, setLocalIdeas] = useState<Idea[]>([]);
  const [draft, setDraft] = useState({ title: "", hook: "" });
  const [pillar, setPillar] = useState("");
  const [ideaKind, setIdeaKind] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    // The visitor's saved marks and ideas are read once after mount; reading storage during render would break hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    setMarks(lsGet<Record<string, string>>("studio-marks-tin", {}));
    setLocalIdeas(lsGet<Idea[]>("studio-ideas-tin", []));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const lanes = brands.data?.lanes ?? [];
  const laneLabel = (id: string) => lanes.find((l) => l.id === id)?.label ?? id;
  const allIdeas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...localIdeas, ...(ideas.data?.ideas ?? [])].filter((i) =>
      (!lane || i.host === lane) && (!pillar || i.pillar === pillar) && (!ideaKind || i.kind === ideaKind) &&
      (!q || (i.text + " " + i.hook + " " + i.payoff).toLowerCase().includes(q)));
  }, [localIdeas, ideas.data, lane, pillar, ideaKind, query]);
  const libAll = library.data?.items ?? [];
  const libItems = libAll.filter((i) => (!lane || i.host === lane) && (!kindFilter || i.kind === kindFilter) && (!stageFilter || (marks[i.id] ?? i.stage) === stageFilter));
  const seatLabel = (id: string) => crew.data?.seats.find((s) => s.id === id)?.label ?? id;
  const stageCount = (st: string) => libAll.filter((i) => (!lane || i.host === lane) && (marks[i.id] ?? i.stage) === st).length;

  const mark = (id: string, stage: string) => {
    const next = { ...marks, [id]: stage };
    setMarks(next);
    lsSet("studio-marks-tin", next);
  };

  const addIdea = () => {
    if (draft.title.trim().length < 3) return;
    const idea: Idea = { id: "local-" + Date.now().toString(36), host: lane || "mike", pillar: "gtm-systems", kind: "hook", text: draft.title.trim(), hook: draft.hook.trim() || "Hook to be written", payoff: "", formats: ["reel"], source: null, demo: null, link: null, created: new Date().toISOString().slice(0, 10) };
    const next = [idea, ...localIdeas];
    setLocalIdeas(next);
    lsSet("studio-ideas-tin", next);
    setDraft({ title: "", hook: "" });
  };

  // Run one idea through the six crew stages. A dry run in the browser: nothing is rendered or posted.
  const [runIdea, setRunIdea] = useState("");
  const [runState, setRunState] = useState<{ idx: number; done: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const seats = crew.data?.seats ?? [];
  const runPick = allIdeas.find((i) => i.id === runIdea) ?? (ideas.data?.ideas ?? []).find((i) => i.id === runIdea) ?? localIdeas.find((i) => i.id === runIdea);
  const stepOut = (id: string, i: Idea): string => {
    switch (id) {
      case "plan": return `Slot filled for ${laneLabel(i.host)}, format ${i.formats[0] ?? "reel"}. One post for that account today.`;
      case "source": return i.source ? `Opened ${i.source.label} and kept the number.` : "No statistic in this idea, so nothing to verify.";
      case "script": return `Hook: “${i.hook}”`;
      case "produce": return `Cut in 9:16, 1:1 and 16:9${i.demo ? `, with a ${i.demo} screen capture` : ""}.`;
      case "gate": return "Claims, captions, loudness, duration and the end card link checked. Any failure stops the post.";
      default: return "Stops here in this demo. Nothing is posted.";
    }
  };
  const startRun = () => {
    const idea = runIdea || allIdeas[0]?.id;
    if (!seats.length || !idea) return;
    setRunIdea(idea);
    if (timer.current) window.clearTimeout(timer.current);
    if (reducedMotionNow()) {
      setRunState({ idx: seats.length, done: true });
      return;
    }
    setRunState({ idx: 0, done: false });
    const tick = (n: number) => {
      timer.current = window.setTimeout(() => {
        setRunState({ idx: n + 1, done: n + 1 >= seats.length });
        if (n + 1 < seats.length) tick(n + 1);
      }, 900);
    };
    tick(0);
  };
  const runDone = runState?.done;
  const running = runState !== null && !runDone;

  const loading = brands.loading || ideas.loading || library.loading;
  const primaryBtn = "rounded-md bg-primary px-3 py-1.5 text-[13px] font-bold text-primary-foreground disabled:border disabled:border-primary/40 disabled:bg-transparent disabled:text-primary/60";
  const chipBtn = (on: boolean) => `rounded-full border px-2.5 py-1 text-[12px] font-semibold ${on ? "border-primary bg-accent text-foreground" : "border-border text-[var(--ink2)] hover:text-foreground"}`;

  return (
    <PageFrame
      title="Content Studio"
      subtitle="GTM OS marketing itself: real reels, carousels, scripts and ideas, and the crew behind them."
      actions={<BrandPick lanes={lanes} value={lane} onChange={(v) => { setLane(v); setShown(PAGE); }} />}
    >
      <Tabs
        idPrefix="studio"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "ideas", label: "Ideas" },
          { key: "library", label: "Library" },
          { key: "scripts", label: "Scripts" },
          { key: "crew", label: "Crew" },
        ]}
      />
      {loading ? <Loading /> : null}

      <TabPanel idPrefix="studio" active={tab}>
        {tab === "ideas" && !loading ? (
          <>
            <Card title="Run an idea through the crew">
              <div className="flex flex-wrap items-center gap-2">
                <select value={runIdea} onChange={(e) => { setRunIdea(e.target.value); setRunState(null); }} aria-label="Idea to run" className={`${sel} min-w-[260px] flex-1`}>
                  <option value="">Pick an idea…</option>
                  {allIdeas.slice(0, 60).map((i) => <option key={i.id} value={i.id}>{i.hook}</option>)}
                </select>
                <button onClick={startRun} disabled={running || allIdeas.length === 0} className={`flex items-center gap-1.5 ${primaryBtn}`}>
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
                </button>
              </div>
              {runState && runPick ? (
                <>
                  <div className="mt-3 h-[5px] overflow-hidden rounded bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((runState.done ? 1 : runState.idx / Math.max(1, seats.length)) * 100)} aria-label="Run progress">
                    <div className="h-full w-full origin-left rounded bg-primary" style={{ transform: `scaleX(${runState.done ? 1 : Math.min(1, (runState.idx + 1) / Math.max(1, seats.length))})`, transition: "transform 900ms linear" }} />
                  </div>
                  <ol className="mt-3 space-y-1.5">
                    {seats.map((st, n) => {
                      const done = n < runState.idx;
                      const active = n === runState.idx && !runState.done;
                      return (
                        <li key={st.id} className={`flex gap-2 text-[13px] transition-[opacity,transform] duration-300 ease-[var(--ease-out)] ${done || active ? "translate-x-0 opacity-100" : "translate-x-1 opacity-35"}`}>
                          <span className="mt-0.5 w-4 shrink-0">
                            {done ? (
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="g-draw-now" /></svg>
                            ) : active ? <Loader2 size={14} className="animate-spin text-primary" /> : <span className="text-muted-foreground">·</span>}
                          </span>
                          <span><b>{st.label}</b>{done ? <span className="g-fade text-[var(--ink2)]">: {stepOut(st.id, runPick)}</span> : null}</span>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : <p className="mt-2 text-[13px] text-[var(--ink2)]">Pick an idea and run it through plan, source check, script, produce, quality gate and publish. This is a dry run in your browser; nothing is rendered or posted.</p>}
              {runDone ? <div role="status" className="g-detail mt-3 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 p-3 text-[13px]">Dry run complete for <b>{runPick?.hook}</b>. Nothing was published.</div> : null}
            </Card>
            <Card title="Add an idea">
              <div className="flex flex-wrap gap-2">
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="One sentence: what is the post about?" className="min-w-[260px] flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]" aria-label="Idea title" />
                <input value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} placeholder="Opening hook (optional)" className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]" aria-label="Idea hook" />
                <button onClick={addIdea} disabled={draft.title.trim().length < 3} className={primaryBtn}>Add</button>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">Saved in this browser only.</p>
            </Card>
            <div className="flex flex-wrap items-center gap-2">
              <select value={pillar} onChange={(e) => { setPillar(e.target.value); setShown(PAGE); }} aria-label="Pillar" className={sel}>
                <option value="">All pillars</option>
                {Object.entries(PILLARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={lane} onChange={(e) => { setLane(e.target.value); setShown(PAGE); }} aria-label="Host" className={sel}>
                <option value="">All hosts</option>
                {lanes.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
              <select value={ideaKind} onChange={(e) => { setIdeaKind(e.target.value); setShown(PAGE); }} aria-label="Kind" className={sel}>
                <option value="">All kinds</option>
                {Object.entries(KIND_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Search ideas" aria-label="Search ideas" className="min-w-[160px] flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]" />
              <span className="text-[12px] text-muted-foreground" data-testid="idea-count">{allIdeas.length} ideas</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {allIdeas.slice(0, shown).map((i) => (
                <Card key={i.id} title={KIND_WORD[i.kind] ?? i.kind} right={<span className="text-[11px] normal-case text-muted-foreground">{PILLARS[i.pillar]}</span>} className="[&_h2]:!normal-case">
                  <div className="text-[15px] font-bold leading-snug">{i.text}</div>
                  <p className="mt-1 text-[13px] italic text-[var(--ink2)]">&ldquo;{i.hook}&rdquo;</p>
                  {i.payoff ? <p className="mt-1 text-[12px] text-muted-foreground">{i.payoff}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Chip>{laneLabel(i.host).split(":")[0]}</Chip>
                    {i.formats.map((f) => <Chip key={f}>{f.replace("_", " ")}</Chip>)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    {i.source ? <span className="text-muted-foreground">Source: <Ext l={i.source.url ? { url: i.source.url, label: i.source.label } : null} /></span> : null}
                    <Ext l={i.link} />
                    <button onClick={() => { setRunIdea(i.id); setRunState(null); scrollWithin(document.getElementById("studio-panel")); }} className="ml-auto font-semibold text-primary hover:underline">Run this</button>
                  </div>
                </Card>
              ))}
            </div>
            {allIdeas.length > shown ? (
              <div className="flex justify-center"><button onClick={() => setShown(shown + PAGE * 2)} className={chipBtn(false)}>Show more ({allIdeas.length - shown} left)</button></div>
            ) : null}
            {allIdeas.length === 0 ? <p className="text-[13px] text-muted-foreground">No ideas match these filters.</p> : null}
          </>
        ) : null}

        {tab === "library" && !loading ? (
          !library.data ? <Missing what="The library" /> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setStageFilter("")} aria-pressed={stageFilter === ""} className={chipBtn(stageFilter === "")}>All stages</button>
                {STAGES.map((s) => (
                  <button key={s} onClick={() => setStageFilter(s)} aria-pressed={stageFilter === s} className={chipBtn(stageFilter === s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)} <span className="tick text-muted-foreground">{stageCount(s)}</span>
                  </button>
                ))}
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Piece type" className={sel}>
                  <option value="">All types</option><option value="video">Reels</option><option value="carousel">Carousels</option><option value="still">Stills</option>
                </select>
                <span className="text-[12px] text-muted-foreground">{libItems.length} pieces</span>
              </div>
              <p className="text-[12px] text-muted-foreground">Draft: rendered from an idea, not yet source checked. Review: a finished cut waiting at the quality gate. Approved: every number carries an opened source. Posted: live on the site.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {libItems.map((i) => {
                  const st = marks[i.id] ?? i.stage;
                  return (
                    <button key={i.id} onClick={() => setOpen(i)} className="g-hover g-fade rounded-xl border border-border bg-card p-2.5 text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-primary">
                      <div className="relative">
                        <Poster item={i} />
                        {i.kind === "video" ? <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-primary" aria-hidden="true"><Play size={16} /></span> : null}
                        {i.kind === "carousel" ? <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-primary">{i.slides?.length} slides</span> : null}
                      </div>
                      <div className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug">{i.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <KindIcon kind={i.kind} size={13} /> {i.kind === "video" ? "reel" : i.kind}{i.duration_s ? `, ${i.duration_s}s` : ""}
                        <span className={`ml-auto font-semibold ${STAGE_TONE[st] ?? ""}`}>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {libItems.length === 0 ? <p className="text-[13px] text-muted-foreground">Nothing in this lane and stage yet.</p> : null}
            </>
          )
        ) : null}

        {tab === "scripts" ? (
          scripts.loading ? <Loading /> : !scripts.data ? <Missing what="The reel scripts" /> : (
            <div className="space-y-3">
              {scripts.data.sets.filter((s) => !lane || s.host === lane).map((s) => {
                const on = (openSet ?? scripts.data!.sets[0]?.id) === s.id;
                let t = s.hook.seconds;
                return (
                  <Card key={s.id} title={`${laneLabel(s.host)} · ${s.seconds}s · ${dayLabel(s.created)}`} right={<button onClick={() => setOpenSet(on ? "none" : s.id)} aria-expanded={on} className="text-[12px] font-semibold text-primary hover:underline">{on ? "Hide" : "Show"} script</button>}>
                    <div className="text-[16px] font-bold leading-snug">&ldquo;{s.hook.words}&rdquo;</div>
                    {on ? (
                      <div className="mt-3 space-y-2.5">
                        {s.reel ? <button onClick={() => { setTab("library"); setOpen(libAll.find((l) => l.id === s.reel) ?? null); }} className="flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"><Play size={12} /> Watch the cut</button> : null}
                        <div className="rounded-lg border border-border p-3">
                          <div className="tick text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hook · 0.0s to {s.hook.seconds}s</div>
                          <p className="mt-1 text-[16px] font-semibold leading-snug"><Words words={s.hook.words} emphasis={s.hook.emphasis} /></p>
                        </div>
                        {s.beats.map((b, k) => {
                          const from = t; t += b.seconds;
                          return (
                            <div key={k}>
                              <div className="rounded-lg border border-border p-3">
                                <div className="tick text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Beat {k + 1} · {from.toFixed(1)}s to {t.toFixed(1)}s</div>
                                <p className="mt-1 text-[15px] leading-snug"><Words words={b.words} emphasis={b.emphasis} /></p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {b.callout ? <Chip tone="text-primary">{b.callout.label}: {b.callout.body}</Chip> : null}
                                  {b.capture ? <Chip>screen capture: {b.capture.replace("_", " ")}</Chip> : null}
                                </div>
                              </div>
                              {s.stat && s.statAfter === k + 1 ? (() => {
                                const sf = t; t += s.stat.seconds;
                                return (
                                  <div className="mt-2.5 rounded-lg border border-primary/50 p-3 glow-cyan">
                                    <div className="tick text-[11px] font-bold uppercase tracking-wider text-primary">Stat card · {sf.toFixed(1)}s to {t.toFixed(1)}s</div>
                                    <div className="mt-1 flex items-baseline gap-3"><span className="text-[30px] font-extrabold text-primary">{s.stat.value}</span><span className="text-[13px]">{s.stat.label}</span></div>
                                    <p className="mt-1 text-[12px] text-[var(--magenta)]">{s.stat.source}</p>
                                  </div>
                                );
                              })() : null}
                            </div>
                          );
                        })}
                        <div className="rounded-lg border border-border p-3">
                          <div className="tick text-[11px] font-bold uppercase tracking-wider text-muted-foreground">End card · {t.toFixed(1)}s to {(t + s.endCard.seconds).toFixed(1)}s</div>
                          <p className="mt-1 text-[14px]"><b>{s.endCard.cta}</b> <span className="tick text-[var(--ink2)]">{s.endCard.linkText}</span></p>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                );
              })}
              {scripts.data.sets.filter((s) => !lane || s.host === lane).length === 0 ? <p className="text-[13px] text-muted-foreground">No reel script for this lane yet. New scripts appear here when the crew writes them.</p> : null}
            </div>
          )
        ) : null}

        {tab === "crew" ? (
          crew.loading ? <Loading /> : !crew.data ? <Missing what="The crew" /> : (
            <>
              <Card title="The pipeline, in order">
                <ol className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
                  {crew.data.seats.map((s, i) => (
                    <li key={s.id} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center gap-1.5"><span className="tick flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[11px] font-extrabold">{i + 1}</span><b className="text-[13px]">{s.label}</b></div>
                      <p className="mt-1 text-[12px] leading-snug text-[var(--ink2)]">{s.outcome}</p>
                      <div className="mt-1.5"><Chip tone={s.mode === "auto" ? "text-[var(--good)]" : "text-[var(--warn)]"}>{s.mode === "auto" ? "Runs on its own" : "Needs a review"}</Chip></div>
                      {s.note ? <p className="mt-1 text-[11px] text-muted-foreground">{s.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </Card>
              <Card title="The presenters">
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
                  {crew.data.hosts.filter((h) => !lane || h.id === lane).map((h) => (
                    <div key={h.id} className="rounded-lg border border-border p-2.5">
                      <b className="text-[13px]">{h.name}</b>
                      <p className="mt-1 text-[12px] text-[var(--ink2)]">{h.beat}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{h.lean}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">The four hosts are disclosed AI presenters. Every post sets the platform&apos;s own AI label at upload.</p>
              </Card>
              <Card title="Cuts in flight">
                <div className="space-y-2">
                  {crew.data.cuts.filter((c) => !lane || c.host === lane).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 text-[13px]">
                      <span className="w-[34%] min-w-0 truncate font-semibold">{c.title}</span>
                      <span className="w-24 shrink-0 text-[var(--ink2)]">{seatLabel(c.stage)} next</span>
                      <div className="h-[6px] min-w-0 flex-1 overflow-hidden rounded bg-secondary"><GrowBar pct={c.progress} /></div>
                      <span className="tick w-10 shrink-0 text-right text-[12px] text-muted-foreground">{c.progress}%</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Recent jobs">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Stage</th><th className="py-1">Summary</th><th className="py-1">Status</th><th className="py-1">Finished</th></tr></thead>
                  <tbody>
                    {crew.data.jobs.slice(0, 20).map((j) => (
                      <tr key={j.id} className="border-t border-border"><td className="py-1.5 font-medium">{seatLabel(j.seat)}</td><td className="py-1.5 text-[var(--ink2)]">{j.summary}</td>
                        <td className="py-1.5 font-semibold text-[var(--good)]">{j.status.charAt(0).toUpperCase() + j.status.slice(1)}</td>
                        <td className="tick py-1.5 text-muted-foreground">{fmtTime(j.started)}</td></tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
            </>
          )
        ) : null}
      </TabPanel>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-[16px] leading-snug">{open.title}</DialogTitle>
                <DialogDescription className="text-[12px]">
                  {laneLabel(open.host)} · {open.kind === "video" ? "reel" : open.kind}{open.duration_s ? `, ${open.duration_s}s` : ""} · {open.market} · {dayLabel(open.created)}
                </DialogDescription>
              </DialogHeader>
              {open.media?.length ? <Player media={open.media} /> : <Slides slides={open.slides ?? [open.thumb]} title={open.title} />}
              <p className="text-[13px] text-[var(--ink2)]">{open.note}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                {open.source ? <span className="text-muted-foreground">Source: {open.source.url ? <Ext l={open.source} /> : open.source.label}</span> : null}
                <Ext l={open.link} />
              </div>
              <div className="flex flex-wrap gap-1.5">{open.channels.map((c) => <Chip key={c}>{c}</Chip>)}</div>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <button key={s} onClick={() => mark(open.id, s)} aria-pressed={(marks[open.id] ?? open.stage) === s} className={`rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${(marks[open.id] ?? open.stage) === s ? "border-primary text-primary" : "border-border text-[var(--ink2)] hover:text-foreground"}`}>Mark {s}</button>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
