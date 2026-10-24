"use client";

import { NavLink } from "@/lib/motion/nav";
import { activeNow, reducedMotionNow, stagger } from "@/lib/motion";
import chatFile from "@/public/demo/chat.json";
import { KpiKey, Win, fmtW, plainTokens } from "@/lib/demo/metrics";

// Ask-the-data chat. Answers are scripted over the demo company: the demo adapter matches the question to a canned
// entry in /demo/chat.json and this panel plays it back with a short thinking pause and a typed-out reveal.

import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageSquare, ArrowRight, Search } from "lucide-react";
import { Panel } from "./Panel";
import { Button } from "@/components/ui/button";

type Source = { label: string; href: string };
type Reply = { answer: string; sources: Source[]; follow_ups: string[]; matched: string | null };
type Turn = { q: string; shown: string; reply: Reply | null; done: boolean };
type ChatMeta = { intro?: string; suggestions?: string[] };

const DEFAULT_SUGGESTIONS = [
  "How did paid media do this week?",
  "Which market has the slowest speed to lead?",
  "What are the top objections on calls?",
];

function Tokens({ text, bold = false }: { text: string; bold?: boolean }) {
  const parts = text.split(/(\{\{[a-z_]+@[a-z0-9]+\}\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\{\{([a-z_]+)@([a-z0-9]+)\}\}$/);
        if (!m) return <span key={i}>{p}</span>;
        return (
          <span key={i} data-kpi={m[1]} data-window={m[2]} className={bold ? "font-semibold text-foreground" : undefined}>
            {fmtW(m[2] as Win, m[1] as KpiKey)}
          </span>
        );
      })}
    </>
  );
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <b key={i} className="font-semibold text-foreground"><Tokens text={p.slice(2, -2)} bold /></b> : <Tokens key={i} text={p} />,
      )}
    </>
  );
}

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  // static import: the suggestions are in the prerendered HTML, so the list never changes height after load
  const meta: ChatMeta = chatFile as ChatMeta;
  const bodyRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);

  const scroll = (smooth = true) =>
    window.setTimeout(
      () => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: smooth && !reducedMotionNow() ? "smooth" : "auto" }),
      20,
    );

  const ask = async (text: string) => {
    if (text.trim().length < 2 || busy) return;
    setBusy(true);
    setQ("");
    const idx = turns.length;
    setTurns((t) => [...t, { q: text, shown: "", reply: null, done: false }]);
    scroll();
    let reply: Reply;
    try {
      const r = await fetch("/api/actions/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: text }) });
      reply = (await r.json()) as Reply;
    } catch {
      reply = { answer: "The demo answer service did not respond. Reload and try again.", sources: [], follow_ups: [], matched: null };
    }
    const words = reply.answer.split(/(\s+)/);
    if (reducedMotionNow()) {
      // reduced motion: the full answer at once, no typing
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, shown: reply.answer, reply, done: true } : x)));
      setBusy(false);
      scroll();
      return;
    }
    let n = 0;
    const step = () => {
      if (!activeNow()) {
        // off screen or hidden: hold the reveal where it is instead of typing into the dark
        timers.current.push(window.setTimeout(step, 250));
        return;
      }
      n = Math.min(words.length, n + 3);
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, shown: words.slice(0, n).join(""), reply, done: n >= words.length } : x)));
      scroll(false);
      if (n < words.length) timers.current.push(window.setTimeout(step, 28));
      else setBusy(false);
    };
    timers.current.push(window.setTimeout(step, 550));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(q);
  };

  const suggestions = meta.suggestions?.length ? meta.suggestions : DEFAULT_SUGGESTIONS;

  return (
    <Panel
      icon={<MessageSquare className="h-3.5 w-3.5" />}
      title="Ask the data"
      action={<span title="Scripted answers over the demo company">sourced · scripted demo</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
          {turns.length === 0 && (
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">
                {meta.intro ?? "Ask about leads, spend, speed to lead, the sales floor or content."}
              </p>
              <div className="flex flex-col gap-1.5">
                {suggestions.slice(0, 4).map((s, i) => (
                  <button
                    key={s}
                    onClick={() => void ask(s)}
                    style={stagger(i + 2)}
                    className="g-fade group flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-left text-[12px] text-[var(--ink2)] transition-[border-color,color,background-color,transform] duration-200 hover:translate-x-0.5 hover:border-primary hover:bg-primary/5 hover:text-foreground"
                  >
                    <ArrowRight size={11} className="shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-0.5" /> {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <p className="g-detail text-[12.5px] font-semibold">{t.q}</p>
              {t.reply === null ? (
                <p className="g-fade flex items-center gap-2 text-[12px] text-muted-foreground" role="status">
                  <span className="g-think" aria-hidden="true"><i /><i /><i /></span> Reading the data
                </p>
              ) : (
                <p className="g-detail whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ink2)]">
                  <Rich text={t.shown} />
                  {!t.done ? <span className="g-caret" aria-hidden="true" /> : null}
                </p>
              )}
              {t.done && t.reply && t.reply.sources.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {t.reply.sources.map((s, si) => (
                    <NavLink key={s.label + s.href} href={s.href} style={stagger(si)} className="g-pop rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                      {s.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
              {t.done && t.reply && i === turns.length - 1 && t.reply.follow_ups.length ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] text-muted-foreground">Try:</span>
                  {t.reply.follow_ups.slice(0, 3).map((f, fi) => (
                    <button key={f} onClick={() => void ask(f)} style={stagger(fi + 2)} className="g-pop rounded-full bg-secondary px-2.5 py-0.5 text-[11px] text-[var(--ink2)] transition-colors hover:bg-primary/15 hover:text-primary">
                      {f}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="sr-only" aria-live="polite">{turns.length && turns[turns.length - 1].done ? plainTokens(turns[turns.length - 1].reply?.answer ?? "").replace(/\*\*/g, "") : ""}</div>
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-border pt-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Which market is behind on leads?"
            maxLength={500}
            className="min-w-0 flex-1 rounded bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Ask the data"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || q.trim().length < 2} className="h-7 px-2 text-[11px]">
            Ask
          </Button>
        </form>
      </div>
    </Panel>
  );
}
