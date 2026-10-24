// What needs attention, as pure data. Order: alarms (a broken loop outranks a due date),
// media live today, overdue tasks (uncapped, oldest due first), then tasks due within 14 days.

import { BoardFeed, Card, InitiativesFeed, RoutinesFeed, fmtAge, fmtDate } from "@/lib/feeds";

export type Need = {
  sev: "crit" | "warn";
  kind: "latch" | "media" | "overdue" | "due14";
  what: string;
  who: string;
  when: string;
  overdue?: boolean;
  card?: Card;
  url?: string;
  path?: string;
  sort: string;
};

// A media placement live TODAY ranks right after a broken loop; it outranks a due date for the one day it runs.
const RANK: Record<Need["kind"], number> = { latch: 0, media: 1, overdue: 2, due14: 3 };

export function needKey(n: Need): string {
  return n.card?.file ?? n.url ?? n.path ?? `${n.kind}:${n.what}`;
}

export function buildNeeds(board: BoardFeed | null, routines: RoutinesFeed | null, media: InitiativesFeed | null = null): Need[] {
  const needs: Need[] = [];
  const byFile = new Map((board?.cards ?? []).map((c) => [c.file, c]));
  for (const f of board?.views.overdue ?? []) {
    const c = byFile.get(f);
    if (c)
      needs.push({ sev: "crit", kind: "overdue", what: c.title, who: c.owner || "Unassigned", when: fmtDate(c.due), overdue: true, card: c, sort: c.due ?? "z" });
  }
  for (const f of board?.views.due14 ?? []) {
    const c = byFile.get(f);
    if (c) needs.push({ sev: "warn", kind: "due14", what: c.title, who: c.owner, when: fmtDate(c.due), card: c, sort: c.due ?? "z" });
  }
  for (const a of (routines?.alerts ?? []).filter((x) => x.age_h < 72))
    needs.push({ sev: "crit", kind: "latch", what: "Alert latch: " + a.path.split("/").pop(), who: "loop", when: fmtAge(a.age_h), path: a.path, sort: String(a.age_h) });
  const coverToday = !!media?.cover_today;
  for (const e of media?.today ?? [])
    needs.push({
      sev: e.priority === "high" || coverToday ? "crit" : "warn", kind: "media", what: "Media today: " + e.label,
      who: e.initiative_label, when: fmtClock(e.time) || "today", path: `media:${e.initiative}:${e.date}:${e.label}`, sort: e.time ?? "99:99",
    });
  if (media?.cover_today && !(media.today ?? []).length)
    needs.push({ sev: "crit", kind: "media", what: "Cover day: " + media.cover_today.why, who: "call floor", when: "today", path: `media:cover:${media.cover_today.date}`, sort: "00:00" });
  return dedupeAndOrder(needs);
}

/** Latch → media → overdue (uncapped) → due14, each bucket by its own sort key; one row per key. */
export function dedupeAndOrder(rows: Need[]): Need[] {
  const seen = new Set<string>();
  const out: Need[] = [];
  const sorted = [...rows].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.sort.localeCompare(b.sort));
  for (const n of sorted) {
    const k = needKey(n);
    if (seen.has(k)) continue;         // a card in both overdue and due14 keeps its higher bucket
    seen.add(k);
    out.push(n);
  }
  return out;
}

/** Rows to show: overdue never cut; other buckets fill the measured height, floor of overdue + 10. */
export function visibleCount(needs: Need[], fit: number): number {
  const overdueCount = needs.filter((n) => n.overdue).length;
  return Math.max(overdueCount + 10, fit);
}

/** "20:20" -> "8:20 PM"; null/"" -> "". Times in the registry are America/New_York wall-clock. */
export function fmtClock(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
