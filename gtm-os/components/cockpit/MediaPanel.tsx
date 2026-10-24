"use client";

// Media calendar. Every paid-media placement with a date, from the registry
// the data, classified by the builder against its TODAY.
// Two surfaces from one feed: MediaPanel (placeable, left column) and MediaTodayPill
// (center strip under "The one thing", renders only when something is live today).

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Panel, Row } from "./Panel";
import { InitiativesFeed, LiveInitiative, MediaEvent, MediaOpenItem, fmtDate } from "@/lib/feeds";
import { fmtClock } from "@/lib/needs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CHANNEL: Record<string, string> = { tv: "TV", direct_mail: "Mail", magazine: "Magazine", billboard: "Billboard", video: "Video", social: "Social", events: "Events", event: "Events", search: "Search", email: "Email" };
const chan = (c: string | null | undefined) => CHANNEL[c ?? ""] ?? (c ?? "");

type Sel = { kind: "event"; e: MediaEvent } | { kind: "live"; l: LiveInitiative } | { kind: "item"; o: MediaOpenItem } | null;

function Dot({ crit }: { crit: boolean }) {
  return <span className={`h-[7px] w-[7px] self-center rounded-full ${crit ? "bg-[var(--crit)]" : "bg-[var(--warn)]"}`} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="panel-title mb-1 mt-2 !text-[10px] first:mt-0">{title}</div>
      {children}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-1 text-[12px] text-muted-foreground">{text}</div>;
}

function DetailDialog({ sel, onClose }: { sel: Sel; onClose: () => void }) {
  return (
    <Dialog open={!!sel} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        {sel?.kind === "event" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[15px] leading-snug">{sel.e.label}</DialogTitle>
            </DialogHeader>
            <div className="text-[12px] text-muted-foreground">
              {chan(sel.e.channel)} · {sel.e.initiative_label}{sel.e.market ? ` · ${sel.e.market}` : ""}
            </div>
            <div className="text-[13px]">
              {fmtDate(sel.e.date)}{sel.e.time ? ` · ${fmtClock(sel.e.time)}${sel.e.end_time ? ` to ${fmtClock(sel.e.end_time)}` : ""} ET` : ""}
              {sel.e.window_end ? ` · in homes through ${fmtDate(sel.e.window_end)}` : ""}
            </div>
            {sel.e.phones ? (
              <p className="text-[13px] leading-relaxed"><b className="text-primary">What this means for the call floor.</b> {sel.e.phones}</p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">owner {sel.e.owner ?? "n/a"} · source {sel.e.source ?? "media calendar"}</p>
          </>
        ) : sel?.kind === "live" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[15px] leading-snug">{sel.l.label}</DialogTitle>
            </DialogHeader>
            <div className="text-[12px] text-muted-foreground">
              {chan(sel.l.channel)}{sel.l.market ? ` · ${sel.l.market}` : ""} · {fmtDate(sel.l.start)} to {fmtDate(sel.l.end)} · {sel.l.days_left}d left
            </div>
            {sel.l.phones ? <p className="text-[13px] leading-relaxed"><b className="text-primary">Call floor.</b> {sel.l.phones}</p> : null}
            {sel.l.exec ? <p className="text-[13px] leading-relaxed"><b className="text-primary">For leadership.</b> {sel.l.exec}</p> : null}
            {sel.l.tracking ? (
              <p className={`text-[12px] ${sel.l.tracking.status === "ok" ? "text-muted-foreground" : "font-semibold text-[var(--crit)]"}`}>
                Tracking {sel.l.tracking.status.replace(/_/g, " ")}{sel.l.tracking.owner ? ` · ${sel.l.tracking.owner}` : ""}{sel.l.tracking.note ? ` · ${sel.l.tracking.note}` : ""}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">Lead source in the CRM: {sel.l.crm_subsource ?? "n/a"} · owner {sel.l.owner ?? "n/a"}</p>
          </>
        ) : sel?.kind === "item" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[15px] leading-snug">{sel.o.label}</DialogTitle>
            </DialogHeader>
            <div className="text-[12px] text-muted-foreground">
              {sel.o.initiative_label ?? sel.o.initiative} · owner {sel.o.owner} · due {sel.o.due ? fmtDate(sel.o.due) : "n/a"} · {sel.o.status.replace(/_/g, " ")}
            </div>
            {sel.o.note ? <p className="text-[13px] leading-relaxed">{sel.o.note}</p> : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function MediaPanel({ media }: { media: InitiativesFeed | null }) {
  const [sel, setSel] = useState<Sel>(null);
  const crit = !!media?.cover_today;
  return (
    <>
      <Panel
        icon={<Megaphone size={13} />}
        title="Media calendar"
        action={
          media ? (
            <>
              {media.volume_week ? (
                <span className={media.volume_week.band === "normal" ? "" : "font-bold text-primary"} title={media.volume_week.why}>
                  call volume {media.volume_week.band}
                </span>
              ) : null}
              <span>{media.counts.live} live</span>
            </>
          ) : undefined
        }
      >
        {!media ? (
          <Empty text="feed not built yet: expected /data/initiatives.json" />
        ) : (
          <>
            <Section title={`Today · ${fmtDate(media.today_date)}${media.cover_today ? (media.cover_today.stack ? " · heavy-spend day (stacked placements)" : " · cover day (staff up)") : ""}`}>
              {media.cover_today ? (
                <div className="mb-1 text-[12px] font-semibold text-[var(--crit)]">{media.cover_today.why}</div>
              ) : null}
              {media.today.length ? (
                media.today.map((e) => (
                  <Row
                    key={`${e.initiative}:${e.date}:${e.label}`}
                    onClick={() => setSel({ kind: "event", e })}
                    left={<Dot crit={crit || e.priority === "high"} />}
                    primary={e.label}
                    aux={chan(e.channel)}
                    right={<span className="tick min-w-[42px] text-right text-[11px] font-bold text-muted-foreground">{e.time ? fmtClock(e.time) : e.window_end ? "in homes" : "today"}</span>}
                  />
                ))
              ) : (
                <Empty text={media.quiet_today ? `quiet day: ${media.quiet_today.why}` : "no placement lands today"} />
              )}
            </Section>

            <Section title="Live now">
              {media.live.length ? (
                media.live.map((l) => (
                  <Row
                    key={l.id}
                    onClick={() => setSel({ kind: "live", l })}
                    left={<Dot crit={!!l.tracking && l.tracking.status !== "ok"} />}
                    primary={l.label}
                    aux={chan(l.channel)}
                    right={<span className="tick min-w-[42px] text-right text-[11px] font-bold text-muted-foreground">{l.days_left}d</span>}
                  />
                ))
              ) : (
                <Empty text="nothing running" />
              )}
            </Section>

            <Section title={`Next 14 days${media.next_cover ? ` · next cover day ${fmtDate(media.next_cover.date)}` : ""}`}>
              {media.upcoming14.length ? (
                media.upcoming14.map((e) => (
                  <Row
                    key={`${e.initiative}:${e.date}:${e.label}`}
                    onClick={() => setSel({ kind: "event", e })}
                    left={<span className="tick min-w-[34px] text-[11px] font-bold text-muted-foreground">{fmtDate(e.date)}</span>}
                    primary={e.label}
                    aux={chan(e.channel)}
                    right={e.time ? <span className="tick text-[11px] font-bold text-muted-foreground">{fmtClock(e.time)}</span> : undefined}
                  />
                ))
              ) : (
                <Empty text="nothing in the next two weeks" />
              )}
            </Section>

            {media.open_items.length ? (
              <Section title="Tracking open before the drop">
                {media.open_items.map((o) => (
                  <Row
                    key={o.id}
                    onClick={() => setSel({ kind: "item", o })}
                    left={<Dot crit={o.overdue || o.status === "open"} />}
                    primary={o.label}
                    aux={o.owner}
                    right={<span className={`tick min-w-[42px] text-right text-[11px] font-bold ${o.overdue ? "text-[var(--crit)]" : "text-muted-foreground"}`}>{o.due ? fmtDate(o.due) : ""}</span>}
                  />
                ))}
              </Section>
            ) : null}
            <div className="pt-2 text-[10px] text-muted-foreground">
              Calendar updated {media.registry_updated ? new Date(media.registry_updated + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "n/a"}
            </div>
          </>
        )}
      </Panel>
      <DetailDialog sel={sel} onClose={() => setSel(null)} />
    </>
  );
}

export function MediaTodayPill({ media }: { media: InitiativesFeed | null }) {
  const [open, setOpen] = useState(false);
  if (!media?.alert) return null;
  const n = media.today.length;
  const cover = media.cover_today;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-auto mt-2 flex max-w-[85%] items-center gap-2 truncate rounded-full border border-[var(--crit)] bg-[var(--crit)]/10 px-4 py-1 text-[12px] font-semibold text-[var(--crit)] hover:bg-[var(--crit)]/20"
        title="media placements live today"
      >
        <Megaphone size={12} />
        <b className="text-[10px] uppercase tracking-wider">Media today</b>
        <span className="truncate font-normal text-[var(--ink2)]">
          {n ? `${n} slot${n > 1 ? "s" : ""}` : "no slot"}
          {cover ? ` · ${cover.stack ? "heavy-spend day" : "cover day"}` : ""}
          {media.volume_week && media.volume_week.band !== "normal" ? ` · calls ${media.volume_week.band}` : ""}
          {n ? ` · ${media.today.map((e) => (e.time ? `${fmtClock(e.time)} ${chan(e.channel)}` : chan(e.channel))).join(", ")}` : ""}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[11px] uppercase tracking-[0.2em] text-[var(--crit)]">
              Media today · {fmtDate(media.today_date)}{cover ? (cover.stack ? " · heavy-spend day" : " · cover day") : ""}
            </DialogTitle>
          </DialogHeader>
          {cover ? <p className="text-[13px] font-semibold leading-relaxed">{cover.why}</p> : null}
          {media.today.map((e) => (
            <div key={`${e.initiative}:${e.date}:${e.label}`} className="border-t border-border/70 pt-2 text-[13px]">
              <div className="font-semibold">
                {e.time ? `${fmtClock(e.time)}${e.end_time ? ` to ${fmtClock(e.end_time)}` : ""} ET · ` : ""}{chan(e.channel)} · {e.label}
              </div>
              {e.phones ? <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink2)]"><b className="text-primary">Call floor.</b> {e.phones}</div> : null}
            </div>
          ))}
          {media.volume_week ? (
            <p className="text-[12px] text-muted-foreground">
              Expected weekday calls this week: <b>{media.volume_week.band}</b> vs a normal weekday. {media.volume_week.why}
            </p>
          ) : null}
          {media.standing_asks.length ? (
            <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
              {media.standing_asks.map((a) => <li key={a}>{a}</li>)}
            </ul>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
