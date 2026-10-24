// The one demo adapter. Every /api/* call the app makes lands here and is answered from static
// fixtures, timer-simulated runs and localStorage. Nothing leaves the origin.
import { BASE, withBase, lsGet, lsSet } from "./base";
import { fixture } from "./fixtures";
import { installClock, realNow } from "./clock";

type Json = Record<string, unknown> | unknown[];

const jsonRes = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Run = {
  run_id: string; type: "skill" | "loop"; target: string; label?: string; model?: string; effort?: string;
  started: string; ended: string | null; est_ms?: number; status: "running" | "succeeded" | "failed" | "timeout_latched";
  loop_status?: string | null; detail: string | null; link?: string; log?: string; log_tail?: string | null;
  acknowledged: boolean;
};
type LocalRun = Run & { dur_ms: number };

const RUN_MS = 6000;

function localRuns(): LocalRun[] {
  return lsGet<LocalRun[]>("runs", []);
}

function settle(r: LocalRun): LocalRun {
  if (r.status !== "running") return r;
  const started = Date.parse(r.started);
  if (Date.now() - started < r.dur_ms) return r;
  return {
    ...r,
    status: "succeeded",
    ended: new Date(started + r.dur_ms).toISOString(),
    detail: "finished",
    log_tail: ["queued", "pulled the latest data", "ran the playbook", "wrote the result", "done"].join("\n"),
  };
}

function allRuns(seed: Run[] | null): Run[] {
  const mine = localRuns().map(settle);
  lsSet("runs", mine);
  const seedRuns = (seed ?? []).filter((s) => !mine.some((m) => m.run_id === s.run_id));
  return [...mine, ...seedRuns].map(({ ...r }) => {
    const dur = (r as Partial<LocalRun>).dur_ms;
    delete (r as Partial<LocalRun>).dur_ms;
    if (dur) (r as Run).est_ms = dur;
    return r as Run;
  });
}

function startRun(type: "skill" | "loop", target: string, label: string): { run_id: string } {
  const run_id = "demo-" + realNow().toString(36) + "-" + Math.floor(Math.random() * 1000).toString(36);
  const run: LocalRun = {
    run_id, type, target, label, started: new Date().toISOString(), ended: null, status: "running",
    detail: null, acknowledged: false, log_tail: null, dur_ms: RUN_MS, model: type === "skill" ? "demo" : undefined,
  };
  lsSet("runs", [run, ...localRuns()].slice(0, 30));
  return { run_id };
}

let refreshAt = 0;

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "was", "were", "do", "does", "did", "how", "what", "which", "who", "why", "me", "my", "we", "our", "it", "this", "that", "about", "tell", "show", "give", "with", "at", "by", "from", "be", "can", "you", "please", "last", "this"]);
const stem = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9% ]+/g, " ").split(/\s+/).filter(Boolean);

/** Whole-word, whole-phrase scoring: a keyword counts only as a complete word (or phrase), never as a substring. */
export function scoreEntry(q: string, e: { match?: string[]; q?: string }): number {
  const qw = words(q);
  const qs = new Set(qw.map(stem));
  const joined = " " + qw.join(" ") + " ";
  let s = 0;
  for (const k of e.match ?? []) {
    const kw = words(k);
    if (!kw.length) continue;
    if (kw.length > 1) {
      if (joined.includes(" " + kw.join(" ") + " ")) s += 3 * kw.length;
    } else if (!STOP.has(kw[0]) && qs.has(stem(kw[0]))) s += 2;
  }
  if (e.q) {
    const ew = words(e.q).filter((w) => !STOP.has(w)).map(stem);
    if (ew.length) {
      const hit = ew.filter((w) => qs.has(w)).length;
      s += (hit / ew.length) * 6;
      if (words(e.q).join(" ") === qw.join(" ")) s += 20;
    }
  }
  return s;
}

const SCORE_FLOOR = 4;

type ChatFile = {
  intro?: string; suggestions?: string[]; fallback?: string;
  entries: { id: string; match: string[]; q: string; answer: string; sources?: { label: string; href: string }[]; follow_ups?: string[] }[];
};

const FALLBACK: ChatFile = {
  intro: "Ask about leads, spend, speed to lead, the sales floor or content.",
  suggestions: [],
  fallback: "That one is outside this demo script. Try one of the suggested questions.",
  entries: [],
};

export async function demoApi(method: string, pathname: string, search: URLSearchParams, body: unknown): Promise<Response> {
  const p = pathname.replace(/\/+$/, "");
  const b = (body ?? {}) as Record<string, unknown>;

  if (p === "/api/layout") {
    if (method === "GET") {
      const snaps = (await fixture<string[]>("/data/snapshots/_index.json")) ?? [];
      return jsonRes({ layout: lsGet("layout", null), snapshots: snaps });
    }
    return lsSet("layout", b) ? jsonRes({ ok: true }) : jsonRes({ ok: true, note: "storage unavailable, kept for this visit only" });
  }

  if (p === "/api/ring") {
    const cards = ((await fixture<Record<string, unknown>[]>("/demo/ring.json")) ?? []) as Record<string, unknown>[];
    const hid = new Set(lsGet<string[]>("ring-hidden", []));
    const q = (search.get("q") ?? "").toLowerCase();
    const showHidden = search.get("hidden") === "1";
    const out = cards
      .map((c) => ({ ...c, hidden: hid.has(String(c.path)) }))
      .filter((c) => (showHidden ? true : !c.hidden))
      .filter((c) => !q || JSON.stringify(c).toLowerCase().includes(q));
    return jsonRes(out);
  }
  if (p === "/api/ring/hide" && method === "POST") {
    const hid = new Set(lsGet<string[]>("ring-hidden", []));
    if (b.hidden) hid.add(String(b.path)); else hid.delete(String(b.path));
    lsSet("ring-hidden", [...hid]);
    return jsonRes({ ok: true });
  }

  if (p === "/api/ext") return jsonRes({ plugins: [] });

  if (p === "/api/actions/refresh") {
    if (method === "POST") {
      refreshAt = realNow() + 1800;
      return jsonRes({ status: "running" });
    }
    return jsonRes({ status: realNow() >= refreshAt ? "done" : "running" });
  }

  if (p === "/api/actions/loops/buttons") return jsonRes((await fixture<unknown[]>("/demo/runs/buttons.json")) ?? []);
  if (p === "/api/actions/skills") return jsonRes((await fixture<unknown[]>("/demo/runs/skills.json")) ?? []);
  if (p === "/api/actions/loops/trigger" && method === "POST") {
    const buttons = (await fixture<{ workflow_id: string; label: string }[]>("/demo/runs/buttons.json")) ?? [];
    const id = String(b.workflow_id ?? "loop");
    return jsonRes(startRun("loop", id, buttons.find((x) => x.workflow_id === id)?.label ?? "Loop run"));
  }
  if (p === "/api/actions/skills/run" && method === "POST") return jsonRes(startRun("skill", String(b.skill ?? "playbook"), String(b.skill ?? "Playbook")));
  if (p === "/api/actions/runs") {
    return jsonRes(allRuns(await fixture<Run[]>("/demo/runs/seed_runs.json")));
  }
  const runMatch = p.match(/^\/api\/actions\/runs\/([^/]+)(\/ack)?$/);
  if (runMatch) {
    const id = decodeURIComponent(runMatch[1]);
    if (runMatch[2] && method === "POST") {
      const mine = localRuns().map((r) => (r.run_id === id ? { ...r, acknowledged: true } : r));
      lsSet("runs", mine);
      return jsonRes({ ok: true });
    }
    const found = allRuns(await fixture<Run[]>("/demo/runs/seed_runs.json")).find((r) => r.run_id === id);
    return found ? jsonRes(found as unknown as Json) : jsonRes({ error: "not_found" }, 404);
  }

  if (p === "/api/actions/chat" && method === "POST") {
    const cf = (await fixture<ChatFile>("/demo/chat.json")) ?? FALLBACK;
    const q = String(b.q ?? "");
    let best: ChatFile["entries"][number] | null = null;
    let bestScore = 0;
    for (const e of cf.entries) {
      const s = scoreEntry(q, e);
      if (s > bestScore) { best = e; bestScore = s; }
    }
    if (!best || bestScore < SCORE_FLOOR) return jsonRes({ answer: "I can only answer questions about this demo company, and that one is outside the script. Try one of these:", sources: [], follow_ups: (cf.suggestions ?? []).slice(0, 4), matched: null });
    return jsonRes({ answer: best.answer.replace(/\\n/g, "\n"), sources: best.sources ?? [], follow_ups: best.follow_ups ?? [], matched: best.id });
  }

  return jsonRes({ error: "not_in_demo", detail: `${method} ${pathname} is not part of the demo` }, 404);
}

export function installDemo(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __gtmDemo?: boolean };
  if (w.__gtmDemo) return;
  w.__gtmDemo = true;
  installClock();
  const native = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string | null = null;
    let method = (init?.method ?? "GET").toUpperCase();
    let bodyText: string | null = typeof init?.body === "string" ? init.body : null;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.origin === window.location.origin ? input.pathname + input.search : null;
    else if (input instanceof Request) {
      const u = new URL(input.url);
      if (u.origin === window.location.origin) url = u.pathname + u.search;
      method = input.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD") bodyText = await input.clone().text();
    }
    if (url && url.startsWith("/") && !url.startsWith("//")) {
      const u = new URL(url, window.location.href);
      if (u.pathname.startsWith("/api/") || u.pathname.startsWith(BASE + "/api/")) {
        let body: unknown = null;
        try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = null; }
        return demoApi(method, u.pathname.replace(BASE, ""), u.searchParams, body);
      }
      return native(withBase(url), init);
    }
    return native(input, init);
  };
}
