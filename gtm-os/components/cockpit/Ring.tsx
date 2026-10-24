"use client";

// Artifacts ring: everything ever shipped, searchable, in a
// sheet off the status strip. Soft-delete is a view flag: files never move.

import { useCallback, useEffect, useState } from "react";
import { CircleDot, Search, EyeOff, Eye, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type RingCard = {
  path: string;
  title: string;
  kind: string;
  tags: string[];
  source: string | null;
  note: string | null;
  created: string;
  state: "ok" | "missing_file" | "parse_error";
  hidden: boolean;
};

export function RingPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [cards, setCards] = useState<RingCard[]>([]);
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (showHidden) params.set("hidden", "1");
      const r = await fetch(`/api/ring?${params}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCards(await r.json());
      setErr(null);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }, [q, showHidden]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe read: fetches ring cards only once the sheet opens.
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  async function setHidden(card: RingCard, hidden: boolean) {
    try {
      const r = await fetch("/api/ring/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: card.path, hidden }),
      });
      if (!r.ok) throw new Error(`hide refused: HTTP ${r.status}`);
      setErr(null);
    } catch (e) {
      setErr(String((e as Error).message)); // a refused write renders, never a silent no-op
    }
    refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[540px] !max-w-[540px] overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-4 py-2">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <CircleDot size={14} className="text-primary" /> Everything shipped
            <span className="text-[12px] font-normal text-muted-foreground">searchable</span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Search size={13} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refresh()}
              placeholder="Search titles, tags and notes, then press Enter"
              aria-label="Search artifacts"
              className="w-full rounded-lg border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              className={`rounded-full border px-2 py-1 text-[12px] ${showHidden ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
              onClick={() => setShowHidden((v) => !v)}
              aria-pressed={showHidden}
            >
              Show hidden
            </button>
          </div>
          {err ? <div className="text-[12px] font-semibold text-[var(--crit)]">The list is unavailable: {err}</div> : null}
          {cards.map((c) => (
            <div key={c.path + c.created} className={`rounded-lg border px-3 py-2 ${c.hidden ? "opacity-50" : ""} ${c.state === "ok" ? "border-border" : "border-[var(--crit)]/50"}`}>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="truncate font-semibold">{c.title}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.kind}</span>
                {c.state !== "ok" ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-[var(--crit)]" title={c.state === "missing_file" ? "registered but the file is gone" : "sidecar JSON is malformed"}>
                    <AlertTriangle size={10} /> {c.state.replace("_", " ")}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{c.created.slice(0, 10)}</span>
                <button className="text-muted-foreground hover:text-primary" title={c.hidden ? "Unhide" : "Hide from the list"} aria-label={(c.hidden ? "Unhide " : "Hide ") + c.title} onClick={() => setHidden(c, !c.hidden)}>
                  {c.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
              {(c.note || c.tags.length) ? (
                <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                  {c.tags.map((t) => `#${t}`).join(" ")} {c.note}
                </div>
              ) : null}
            </div>
          ))}
          {!cards.length && !err ? <div className="text-[12px] text-muted-foreground">Nothing matches that search.</div> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
