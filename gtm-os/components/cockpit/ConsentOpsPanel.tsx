"use client";

// the exception queue (failed jobs, the capture spool's age, failed dispatches, stops waiting on a person, pending
// bookings) and a per-person timeline opened by prospect id, person ref or the last four of a contact point.
// The artifact is written by the consent host's renderer (masked, T1: person-level history recorded to a prospect id, so it
// is served by that host's loopback server only); this panel never reads the store or a vendor.
// A missing, unreadable or unmasked artifact is a named error in place of the panel body; a stale one is drawn under a
// named stale banner.

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Panel } from "./Panel";
import { useActiveInterval } from "@/lib/motion";
import { ARTIFACT_URL, Person, Read, personsByQuery, queueRows, readConsentOps } from "@/lib/consentOps";

async function fetchArtifact(): Promise<Read> {
  let status = 0;
  let raw: string | null = null;
  try {
    const r = await fetch(ARTIFACT_URL, { cache: "no-store" });
    status = r.status;
    raw = r.ok ? await r.text() : null;
  } catch {
    status = 0; // named by readConsentOps: the cockpit host did not answer
  }
  return readConsentOps(status, raw, new Date());
}

function Banner({ text, tone }: { text: string; tone: "crit" | "warn" }) {
  return (
    <p role="alert"
       className={`mb-2 rounded-md border px-2 py-1 text-[12px] font-semibold ${tone === "crit"
         ? "border-[var(--crit)] bg-[var(--crit)]/10 text-[var(--crit)]"
         : "border-[var(--warn)]/60 bg-[var(--warn)]/10 text-[var(--warn)]"}`}>
      {text}
    </p>
  );
}

function Timeline({ p, onClose }: { p: Person; onClose: () => void }) {
  return (
    <div className="mb-2 rounded-md border border-border p-2 text-[12px]">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-semibold">{p.ref}</span>
        <span className="text-muted-foreground">
          {p.prospect_ids.length ? `prospect id ${p.prospect_ids.join(", ")}` : "no prospect id on record"} · {p.contacts.join(", ")}
        </span>
        <button type="button" className="ml-auto text-[11px] text-muted-foreground hover:underline" onClick={onClose}>close</button>
      </div>
      <ul className="space-y-0.5">
        {p.timeline.map((e, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-[92px] shrink-0 tabular-nums text-muted-foreground">{e.at.slice(5, 16).replace("T", " ")}</span>
            <span className="w-[62px] shrink-0 uppercase text-[11px] tracking-wide text-muted-foreground">{e.kind}</span>
            <span className="min-w-0 flex-1 truncate">{e.what}{e.lane ? ` · ${e.lane}` : ""}</span>
            <span className="shrink-0 text-muted-foreground">{e.contact}</span>
          </li>
        ))}
      </ul>
      {p.entries_total > p.entries_shown && (
        <p className="mt-1 text-[11px] text-muted-foreground">showing the newest {p.entries_shown} of {p.entries_total} rows</p>
      )}
    </div>
  );
}

export function ConsentOpsPanel() {
  const [read, setRead] = useState<Read | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Person | null>(null);
  const [choices, setChoices] = useState<Person[]>([]);
  const [miss, setMiss] = useState<string | null>(null);

  const load = useCallback(async () => setRead(await fetchArtifact()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time artifact read.
    void load();
  }, [load]);
  // then every five minutes, only while the demo is on screen
  useActiveInterval(() => void load(), 5 * 60 * 1000);

  const find = (s: string) => {
    if (!read || !read.ok) return;
    const hits = personsByQuery(read.art, s);
    // One match opens; several are listed for the reader to pick (last fours collide across households, W-2).
    setOpen(hits.length === 1 ? hits[0] : null);
    setChoices(hits.length > 1 ? hits : []);
    setMiss(hits.length ? null : `No one in this register matches ${JSON.stringify(s.trim())}. The demo register holds ${read.art.timeline.persons_shown} people.`);
  };

  let body;
  if (read === null) {
    body = (
      <div aria-busy="true" aria-label="Reading the consent register" className="space-y-2 py-1">
        {[0, 1, 2, 3].map((i) => <div key={i} className="g-skel h-[22px]" />)}
      </div>
    );
  } else if (!read.ok) {
    body = <Banner tone="crit" text={read.error} />;
  } else {
    const rows = queueRows(read.art);
    const crit = rows.filter((r) => r.critical).length;
    body = (
      <div className="text-[13px]">
        {read.stale && <Banner tone="crit" text={read.stale} />}
        <p className="mb-1.5 text-muted-foreground">
          {read.openTotal} open · {crit} critical · as of {new Date(read.art.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}, from the demo consent register
        </p>
        {read.notBuilt.map((t) => <Banner key={t} tone={t.includes("unreadable") ? "crit" : "warn"} text={t} />)}
        {read.capped.map((t) => <Banner key={t} tone="crit" text={t} />)}
        <form className="mb-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); find(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="open a person"
                 placeholder="Prospect id, person ref or last four digits of a phone"
                 className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary" />
          <button type="submit" className="text-[11px] underline-offset-2 hover:underline">open</button>
        </form>
        {miss && <p className="mb-2 text-[11px] text-[var(--warn)]">{miss}</p>}
        {choices.length > 1 && (
          <div className="mb-2 rounded-md border border-[var(--warn)]/60 p-2 text-[11px]">
            <p className="mb-1 font-semibold">{choices.length} persons match {JSON.stringify(q.trim())}. Pick one; check the prospect id in the CRM before acting.</p>
            <ul>
              {choices.map((p) => (
                <li key={p.ref}>
                  <button type="button" className="hover:underline" onClick={() => { setOpen(p); setChoices([]); }}>
                    {p.ref} · {p.prospect_ids.length ? `prospect id ${p.prospect_ids.join(", ")}` : "no prospect id on record"} · {p.contacts.join(", ")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {open && <Timeline p={open} onClose={() => setOpen(null)} />}
        {rows.length === 0 ? (
          <p className="text-muted-foreground">
            {read.notBuilt.length || read.capped.length
              ? "Nothing is listed, but a section above needs attention."
              : "No exception is open."}
          </p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.key} className="border-b border-border/70 last:border-b-0">
                <div
                  onClick={() => { if (r.personRef) { setQ(r.personRef); find(r.personRef); } }}
                  onKeyDown={(e) => { if (r.personRef && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setQ(r.personRef); find(r.personRef); } }}
                  role={r.personRef ? "button" : undefined}
                  tabIndex={r.personRef ? 0 : undefined}
                  title={r.what}
                  className={`flex items-baseline gap-2 py-1.5 ${r.personRef ? "cursor-pointer hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-primary" : ""}`}>
                  <span className={`w-[8px] shrink-0 ${r.critical ? "text-[var(--crit)]" : "text-[var(--warn)]"}`}>●</span>
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{r.age}</span>
                  <span className="max-w-[34%] shrink-0 truncate text-[var(--ink2)]">{r.owner}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <Panel icon={<ShieldAlert className="h-3.5 w-3.5" />} title="Consent operations"
           action={<button type="button" onClick={() => void load()} className="hover:underline">reload</button>}>
      {body}
    </Panel>
  );
}
