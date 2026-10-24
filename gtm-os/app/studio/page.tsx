"use client";

import { scrollWithin } from "@/lib/motion/scroll";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Film, Image as ImageIcon, LayoutGrid, Loader2 } from "lucide-react";
import { PageFrame, Tabs, TabPanel, Card, Chip, GrowBar, Loading, Missing } from "@/components/apps/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useFixture, useHashTab } from "@/lib/demo/useFixture";
import { lsGet, lsSet } from "@/lib/demo/base";
import { reducedMotionNow } from "@/lib/motion";

type Brand = { id: string; label: string };
type Idea = { id: string; brand: string; title: string; hook: string; angle: string; status: string; created: string };
type LibItem = { id: string; brand: string; title: string; kind: "video" | "carousel" | "still"; stage: "draft" | "review" | "approved"; duration_s: number | null; market: string; created: string; channels: string[]; note: string };
type Element = { id: string; brand: string; kind: string; label: string; uses: number };
type Variation = { id: string; label: string; hook: string; body: string; seconds: number; humor: number; score: number };
type ScriptSet = { id: string; brand: string; topic: string; created: string; best: string; variations: Variation[] };
type Seat = { id: string; label: string; outcome: string; mode: "auto" | "review" };
type Cut = { id: string; title: string; brand: string; stage: string; progress: number; updated: string };
type Job = { id: string; cut: string; seat: string; status: string; started: string; ended: string | null; summary: string };
type Crew = { seats: Seat[]; cuts: Cut[]; jobs: Job[] };
type Step = { label: string; ms: number; output: string };

const TABS = ["ideas", "library", "scripts", "crew"] as const;
const MAIN_BRAND = "lh-main";

const STAGE_TONE: Record<string, string> = { draft: "text-[var(--ink2)]", review: "text-[var(--warn)]", approved: "text-[var(--good)]" };
const IDEA_TONE: Record<string, string> = { idea: "text-[var(--ink2)]", scripted: "text-primary", in_edit: "text-[var(--warn)]", ready: "text-[var(--good)]" };
const IDEA_WORD: Record<string, string> = { idea: "Idea", scripted: "Scripted", in_edit: "In edit", ready: "Ready" };
const STAGE_WORD: Record<string, string> = { research: "Research", transcribe: "Transcribe", edit: "Edit", animate: "Animate", screen: "Screen", sound: "Sound", finish: "Finish", done: "Done" };
const GRADIENTS = [
  "linear-gradient(135deg, #0b0c1a, #0a4a5c)",
  "linear-gradient(135deg, #0b0c1a, #4a1550)",
  "linear-gradient(135deg, #12132a, #2a2e5c)",
];

const dayLabel = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function BrandPick({ brands, value, onChange }: { brands: Brand[]; value: string; onChange: (b: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Brand" className="rounded-md border border-border bg-background px-2 py-1.5 text-[13px]">
      <option value="">All brands</option>
      {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
    </select>
  );
}

function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  return kind === "video" ? <Film size={size} /> : kind === "carousel" ? <LayoutGrid size={size} /> : <ImageIcon size={size} />;
}

function Poster({ item, tall = false }: { item: LibItem; tall?: boolean }) {
  const g = GRADIENTS[item.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
  return (
    <div className={`flex w-full items-center justify-center rounded-md text-primary/80 ${tall ? "h-28" : "h-24"}`} style={{ background: g }} aria-hidden="true">
      <KindIcon kind={item.kind} size={tall ? 26 : 22} />
    </div>
  );
}

export default function StudioPage() {
  const [tab, setTab] = useHashTab(TABS, "ideas");
  const [brand, setBrand] = useState("");
  const brands = useFixture<{ brands: Brand[] }>("/demo/studio/brands.json");
  const ideas = useFixture<{ ideas: Idea[] }>("/demo/studio/ideas.json");
  const library = useFixture<{ items: LibItem[] }>("/demo/studio/library.json");
  const elements = useFixture<{ items: Element[] }>("/demo/studio/elements.json");
  const scripts = useFixture<{ sets: ScriptSet[] }>("/demo/studio/scripts.json");
  const crew = useFixture<Crew>("/demo/studio/crew.json");
  const steps = useFixture<{ steps: Step[] }>("/demo/studio/run_steps.json");

  const [stageFilter, setStageFilter] = useState("");
  const [open, setOpen] = useState<LibItem | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [openSet, setOpenSet] = useState<string | null>("set-01");
  const [localIdeas, setLocalIdeas] = useState<Idea[]>([]);
  const [draft, setDraft] = useState({ title: "", hook: "" });

  useEffect(() => {
    // The visitor's saved marks and ideas are read once after mount; reading storage during render would break hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    setMarks(lsGet<Record<string, string>>("studio-marks", {}));
    setLocalIdeas(lsGet<Idea[]>("studio-ideas", []));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const brandLabel = (id: string) => brands.data?.brands.find((b) => b.id === id)?.label ?? id;
  const allIdeas = useMemo(() => [...localIdeas, ...(ideas.data?.ideas ?? [])].filter((i) => !brand || i.brand === brand), [localIdeas, ideas.data, brand]);
  const libItems = (library.data?.items ?? []).filter((i) => (!brand || i.brand === brand) && (!stageFilter || (marks[i.id] ?? i.stage) === stageFilter));
  const seatLabel = (id: string) => crew.data?.seats.find((s) => s.id === id)?.label ?? id;

  const mark = (id: string, stage: string) => {
    const next = { ...marks, [id]: stage };
    setMarks(next);
    lsSet("studio-marks", next);
  };

  const addIdea = () => {
    if (draft.title.trim().length < 3) return;
    const idea: Idea = { id: "local-" + Date.now().toString(36), brand: brand || MAIN_BRAND, title: draft.title.trim(), hook: draft.hook.trim() || "Hook to be written", angle: "new", status: "idea", created: new Date().toISOString().slice(0, 10) };
    const next = [idea, ...localIdeas];
    setLocalIdeas(next);
    lsSet("studio-ideas", next);
    setDraft({ title: "", hook: "" });
  };

  // Run one idea: timer-simulated steps
  const [runIdea, setRunIdea] = useState("");
  const [runState, setRunState] = useState<{ idx: number; done: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const startRun = () => {
    const list = steps.data?.steps ?? [];
    const idea = runIdea || allIdeas[0]?.id;
    if (!list.length || !idea) return;
    setRunIdea(idea);
    if (timer.current) window.clearTimeout(timer.current);
    if (reducedMotionNow()) {
      // reduced motion: the run lands complete, no stepping and no spinners
      setRunState({ idx: list.length, done: true });
      return;
    }
    setRunState({ idx: 0, done: false });
    const tick = (i: number) => {
      timer.current = window.setTimeout(() => {
        setRunState({ idx: i + 1, done: i + 1 >= list.length });
        if (i + 1 < list.length) tick(i + 1);
      }, Math.max(300, list[i].ms));
    };
    tick(0);
  };
  const runDone = runState?.done;
  const runPick = allIdeas.find((i) => i.id === runIdea);
  const nextLib = (library.data?.items ?? []).find((i) => i.stage === "draft" && (!runPick || i.brand === runPick.brand)) ?? library.data?.items[0];
  const running = runState !== null && !runDone;

  const loading = brands.loading || ideas.loading || library.loading;
  const primaryBtn = "rounded-md bg-primary px-3 py-1.5 text-[13px] font-bold text-primary-foreground disabled:border disabled:border-primary/40 disabled:bg-transparent disabled:text-primary/60";

  return (
    <PageFrame
      title="Content Studio"
      subtitle="From one idea to a finished cut: scripts, the crew that builds them, and everything in the library."
      actions={<BrandPick brands={brands.data?.brands ?? []} value={brand} onChange={setBrand} />}
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
            <Card title="Run an idea end to end">
              <div className="flex flex-wrap items-center gap-2">
                <select value={runIdea} onChange={(e) => { setRunIdea(e.target.value); setRunState(null); }} aria-label="Idea to run" className="min-w-[260px] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[13px]">
                  <option value="">Pick an idea…</option>
                  {allIdeas.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                </select>
                <button onClick={startRun} disabled={running || (!runIdea && allIdeas.length === 0)} className={`flex items-center gap-1.5 ${primaryBtn}`}>
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
                </button>
              </div>
              {runState ? (
                <>
                  {(() => {
                    // One bar over the whole run. While a step is active the bar crawls toward the end of that step
                    // over the step's own duration (scaleX, linear), so it moves the whole time, not in jumps.
                    const list = steps.data?.steps ?? [];
                    const total = Math.max(1, list.length);
                    const next = runState.done ? 1 : Math.min(1, (runState.idx + 1) / total);
                    const ms = runState.done ? 400 : Math.max(300, list[runState.idx]?.ms ?? 600);
                    return (
                      <div className="mt-3 h-[5px] overflow-hidden rounded bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((runState.done ? 1 : runState.idx / total) * 100)} aria-label="Run progress">
                        <div className="h-full w-full origin-left rounded bg-primary" style={{ transform: `scaleX(${next})`, transition: `transform ${ms}ms ${runState.done ? "var(--ease-out)" : "linear"}` }} />
                      </div>
                    );
                  })()}
                  <ol className="mt-3 space-y-1.5">
                    {(steps.data?.steps ?? []).map((s, i) => {
                      const done = i < runState.idx;
                      const active = i === runState.idx && !runState.done;
                      return (
                        <li key={s.label} className={`flex gap-2 text-[13px] transition-[opacity,transform] duration-300 ease-[var(--ease-out)] ${done || active ? "translate-x-0 opacity-100" : "translate-x-1 opacity-35"}`}>
                          <span className="mt-0.5 w-4 shrink-0">
                            {done ? (
                              <svg key="d" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="g-draw-now" /></svg>
                            ) : active ? <Loader2 size={14} className="animate-spin text-primary" /> : <span className="text-muted-foreground">·</span>}
                          </span>
                          <span><b>{s.label}</b>{done ? <span key="o" className="g-fade text-[var(--ink2)]">: {s.output}</span> : null}</span>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : <p className="mt-2 text-[13px] text-[var(--ink2)]">Pick an idea and run it. The crew researches, scripts, cuts, animates, mixes and finishes a draft. Nothing is published.</p>}
              {runDone && nextLib ? (
                <div role="status" className="g-detail mt-3 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 p-3 text-[13px]">
                  Draft ready in the library: <b>{nextLib.title}</b>.{" "}
                  <button onClick={() => { setTab("library"); setOpen(nextLib); }} className="font-semibold text-primary hover:underline">Open it</button>
                </div>
              ) : null}
            </Card>
            <Card title="Add an idea">
              <div className="flex flex-wrap gap-2">
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="One sentence: what is the video about?" className="min-w-[260px] flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]" aria-label="Idea title" />
                <input value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} placeholder="Opening hook (optional)" className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]" aria-label="Idea hook" />
                <button onClick={addIdea} disabled={draft.title.trim().length < 3} className={primaryBtn}>Add</button>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">Saved in this browser only.</p>
            </Card>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {allIdeas.map((i) => (
                <Card key={i.id} title={IDEA_WORD[i.status] ?? i.status} className="[&_h2]:!normal-case">
                  <div className="flex items-start gap-2">
                    <div className={`text-[15px] font-bold leading-snug ${IDEA_TONE[i.status] ? "text-foreground" : ""}`}>{i.title}</div>
                  </div>
                  <p className="mt-1 text-[13px] italic text-[var(--ink2)]">&ldquo;{i.hook}&rdquo;</p>
                  <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                    {i.brand !== (brand || MAIN_BRAND) ? <Chip>{brandLabel(i.brand)}</Chip> : null}
                    <Chip>{i.angle}</Chip><span>{dayLabel(i.created)}</span>
                    <button onClick={() => { setRunIdea(i.id); setRunState(null); scrollWithin(document.getElementById("studio-panel")); }} className="ml-auto font-semibold text-primary hover:underline">Run this</button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : null}

        {tab === "library" && !loading ? (
          !library.data ? <Missing what="The library" /> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {["", "draft", "review", "approved"].map((s) => (
                  <button key={s || "all"} onClick={() => setStageFilter(s)} aria-pressed={stageFilter === s} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${stageFilter === s ? "border-primary bg-accent text-foreground" : "border-border text-[var(--ink2)] hover:text-foreground"}`}>
                    {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All stages"}
                  </button>
                ))}
                <span className="text-[12px] text-muted-foreground">{libItems.length} pieces</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {libItems.map((i) => {
                  const st = marks[i.id] ?? i.stage;
                  return (
                    <button key={i.id} onClick={() => setOpen(i)} className="g-hover g-fade rounded-xl border border-border bg-card p-2.5 text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-primary">
                      <Poster item={i} />
                      <div className="mt-2 text-[13px] font-semibold leading-snug">{i.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <KindIcon kind={i.kind} size={13} /> {i.kind}{i.duration_s ? `, ${i.duration_s}s` : ""} · {i.market}
                        <span className={`ml-auto font-semibold ${STAGE_TONE[st] ?? ""}`}>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Card title="Elements in use">
                <div className="grid gap-x-6 gap-y-1 md:grid-cols-2 lg:grid-cols-3">
                  {(elements.data?.items ?? []).filter((e) => !brand || e.brand === brand || e.brand === "").map((e) => (
                    <div key={e.id} className="flex items-baseline gap-2 text-[13px]"><Chip>{e.kind}</Chip><span className="truncate">{e.label}</span><span className="tick ml-auto text-[12px] text-muted-foreground">{e.uses} uses</span></div>
                  ))}
                </div>
              </Card>
            </>
          )
        ) : null}

        {tab === "scripts" ? (
          scripts.loading ? <Loading /> : !scripts.data ? <Missing what="The script sets" /> : (
            <div className="space-y-3">
              {scripts.data.sets.filter((s) => !brand || s.brand === brand).map((s) => {
                const on = openSet === s.id;
                return (
                  <Card key={s.id} title={`${brand ? "" : s.brand !== MAIN_BRAND ? brandLabel(s.brand) + " · " : ""}${dayLabel(s.created)}`} right={<button onClick={() => setOpenSet(on ? null : s.id)} aria-expanded={on} className="text-[12px] font-semibold text-primary hover:underline">{on ? "Hide" : "Show"} {s.variations.length} variations</button>}>
                    <div className="text-[15px] font-bold">{s.topic}</div>
                    {on ? (
                      <div className="mt-2 grid gap-3 md:grid-cols-3">
                        {s.variations.map((v) => (
                          <div key={v.id} className={`rounded-lg border p-3 ${v.id === s.best ? "border-primary glow-cyan" : "border-border"}`}>
                            <div className="flex items-baseline gap-2"><b className="text-[13px]">{v.label}</b>{v.id === s.best ? <Chip tone="text-primary">Best</Chip> : null}<span className="tick ml-auto text-[13px] font-bold">{v.score}</span></div>
                            <p className="mt-1 text-[13px] font-semibold">&ldquo;{v.hook}&rdquo;</p>
                            <p className="mt-1 whitespace-pre-wrap text-[12px] text-[var(--ink2)]">{v.body}</p>
                            <p className="mt-1 text-[12px] text-muted-foreground">{v.seconds}s · humor {Math.round(v.humor * 100)}%</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )
        ) : null}

        {tab === "crew" ? (
          crew.loading ? <Loading /> : !crew.data ? <Missing what="The crew" /> : (
            <>
              <Card title="The crew, in pipeline order">
                <ol className="grid gap-2 md:grid-cols-4 lg:grid-cols-7">
                  {crew.data.seats.map((s, i) => (
                    <li key={s.id} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center gap-1.5"><span className="tick flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[11px] font-extrabold">{i + 1}</span><b className="text-[13px]">{s.label}</b></div>
                      <p className="mt-1 text-[12px] leading-snug text-[var(--ink2)]">{s.outcome}</p>
                      <Chip tone={s.mode === "auto" ? "text-[var(--good)]" : "text-[var(--warn)]"}>{s.mode === "auto" ? "Runs on its own" : "Needs a review"}</Chip>
                    </li>
                  ))}
                </ol>
              </Card>
              <Card title="Cuts in flight">
                <div className="space-y-2">
                  {crew.data.cuts.filter((c) => !brand || c.brand === brand).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 text-[13px]">
                      <span className="w-[34%] min-w-0 truncate font-semibold">{c.title}</span>
                      <span className="w-20 shrink-0 text-[var(--ink2)]">{STAGE_WORD[c.stage] ?? c.stage}</span>
                      <div className="h-[6px] min-w-0 flex-1 overflow-hidden rounded bg-secondary"><GrowBar pct={c.progress} /></div>
                      <span className="tick w-10 shrink-0 text-right text-[12px] text-muted-foreground">{c.progress}%</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Recent jobs">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Seat</th><th className="py-1">Summary</th><th className="py-1">Status</th><th className="py-1">Started</th></tr></thead>
                  <tbody>
                    {crew.data.jobs.slice(0, 20).map((j) => (
                      <tr key={j.id} className="border-t border-border"><td className="py-1.5 font-medium">{seatLabel(j.seat)}</td><td className="py-1.5 text-[var(--ink2)]">{j.summary}</td>
                        <td className={`py-1.5 font-semibold ${j.status === "done" ? "text-[var(--good)]" : j.status === "failed" ? "text-[var(--crit)]" : "text-[var(--warn)]"}`}>{j.status.charAt(0).toUpperCase() + j.status.slice(1)}</td>
                        <td className="tick py-1.5 text-muted-foreground">{new Date(j.started).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, {new Date(j.started).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )
        ) : null}
      </TabPanel>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-xl">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-[16px] leading-snug">{open.title}</DialogTitle>
                <DialogDescription className="text-[12px]">
                  {brandLabel(open.brand)} · {open.kind}{open.duration_s ? `, ${open.duration_s}s` : ""} · {open.market} · {dayLabel(open.created)}
                </DialogDescription>
              </DialogHeader>
              <Poster item={open} tall />
              <p className="text-[13px] text-[var(--ink2)]">{open.note}</p>
              <div className="flex flex-wrap gap-1.5">{open.channels.map((c) => <Chip key={c}>{c}</Chip>)}</div>
              <div className="flex flex-wrap gap-2">
                {(["draft", "review", "approved"] as const).map((s) => (
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
