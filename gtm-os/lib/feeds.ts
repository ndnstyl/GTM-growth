/* Data contract: static JSON files under /data/ (see DEMO-CONTRACT.md). The app is a
   window over them; it never computes a business number itself. */

import { moneyDollars } from "@/lib/reports/format";

export type Card = {
  file: string; name: string; title: string; description: string;
  status: string; status_raw: string; priority: string; priority_raw: string;
  domain: string; owner: string; due: string | null; blocked_on: string;
  created: string; mtime: number;
};
export type BoardFeed = {
  cards: Card[];
  views: Record<string, string[]>;
  counts: { total: number; open: number; overdue: number; blocked: number };
};
export type KpiTile = {
  key: string; label: string; value: number | null; unit: string;
  as_of: string; source: string; confidence: string; detail: string;
};
export type NumbersTile = {
  key: string; label: string; value: number | null; unit: "count" | "usd" | "ratio" | "pct";
  delta_pct: number | null; detail: string;
};
export type NumbersBlock = {
  as_of: string;
  tiles: NumbersTile[];
  pace: { goal: number; actual: number; pct_to_pace: number; through: string } | null;
};
export type KpiFeed = {
  tiles: KpiTile[];
  one_thing: { date: string; text: string; file: string } | null;
  numbers?: NumbersBlock | null;
};
export type Job = {
  label: string; schedule: string; loaded: boolean;
  pid: number | null; last_exit: number | null; plist: string;
  // The TCP port this job is responsible for, when the builder could establish
  // one. An always-on job with no pid but a listening port is not down.
  serves_port?: number | null;
};
export type RoutinesFeed = {
  jobs: Job[];
  services: { name: string; port: number; listening: boolean }[];
  alerts: { path: string; mtime: number; age_h: number; head: string }[];
  // When this snapshot was written. The panel dates its own reading with
  // it rather than presenting a snapshot as live.
  built_at?: string;
};
export type MetaFeed = {
  built_at: string; feeds: Record<string, string>;
  north_star_as_of: string | null; queue_as_of: string | null;
  queue_newest_delta: string | null; today: string;
};
// Marketing initiatives (media calendar). Classified by the data file against its own today; the app draws, never dates.
export type MediaEvent = {
  initiative: string; initiative_label: string; label: string; channel: string; market: string | null;
  date: string; time: string | null; end_time: string | null; window_end: string | null;
  priority: string; owner: string | null; phones: string | null; source: string | null;
};
export type LiveInitiative = {
  id: string; channel: string; label: string; market: string | null; start: string; end: string;
  owner: string | null; phones: string | null; exec: string | null; lp_subsource: string | null;
  tracking: { status: string; owner?: string; note?: string; due?: string } | null; days_left: number;
};
export type CoverDay = { date: string; stack: boolean; why: string };
export type MediaOpenItem = {
  id: string; label: string; owner: string; due: string | null; status: string;
  initiative: string; initiative_label?: string; note?: string; overdue: boolean;
};
export type InitiativesFeed = {
  today_date: string; today: MediaEvent[]; live: LiveInitiative[]; upcoming14: MediaEvent[]; calendar: MediaEvent[];
  cover_today: CoverDay | null; next_cover: CoverDay | null; quiet_today: { date: string; why: string } | null;
  volume_week: { start: string; end: string; band: string; why: string } | null;
  open_items: MediaOpenItem[]; standing_asks: string[]; alert: boolean;
  counts: { initiatives: number; live: number; today: number; upcoming14: number; open_items: number };
  as_of: string; registry_updated: string | null; registry: string;
};

export type Feeds = {
  meta: MetaFeed | null;
  board: BoardFeed | null;
  kpi: KpiFeed | null;
  routines: RoutinesFeed | null;
  initiatives: InitiativesFeed | null;
};

async function one<T>(name: string): Promise<T | null> {
  try {
    const r = await fetch(`/data/${name}.json`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function loadFeeds(): Promise<Feeds> {
  const [meta, board, kpi, routines, initiatives] = await Promise.all([
    one<MetaFeed>("meta"),
    one<BoardFeed>("board"),
    one<KpiFeed>("kpi"),
    one<RoutinesFeed>("routines"),
    one<InitiativesFeed>("initiatives"),
  ]);
  return { meta, board, kpi, routines, initiatives };
}

export const fmtMoney = (v: number) => moneyDollars(v);
export const fmtDate = (iso: string | null) => (iso ? iso.slice(5).replace("-", "/") : "");
export const fmtAge = (h: number | null | undefined) =>
  h == null ? "" : h < 24 ? Math.round(h) + "h" : Math.round(h / 24) + "d";
