// Typed client for the GTM OS host action API.
// One module owns every /api/actions call so lifecycle semantics stay uniform:
// acknowledged, never resets on its own.
"use client";

export type N8nButton = {
  workflow_id: string;
  label: string;
  state: "ready" | "inactive" | "unreachable" | "unresolved" | "drifted";
  detail?: string;
  last_run: { run_id: string; status: string; ts: string; link: string; acknowledged: boolean } | null;
};

export type SkillRow = {
  name: string;
  model: string;
  effort: string;
  max_turns: number;
  running: boolean;
  // of the deck renders without a Run affordance.
  runnable: boolean;
};

export type Run = {
  run_id: string;
  type: "skill" | "loop";
  target: string;
  label?: string;
  model?: string;
  effort?: string;
  started: string;
  ended: string | null;
  /** simulated runs only: how long the demo run takes, so the console can draw honest time-based progress */
  est_ms?: number;
  status: "running" | "succeeded" | "failed" | "timeout_latched";
  loop_status?: string | null;
  detail: string | null;
  link?: string;
  log?: string;
  log_tail?: string | null;
  acknowledged: boolean;
};

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { cache: "no-store", ...init });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error((body && (body.error + (body.detail ? `: ${body.detail}` : ""))) || `HTTP ${r.status}`) as Error & { status: number; payload: unknown };
    e.status = r.status;
    e.payload = body;
    throw e;
  }
  return body as T;
}

export const actions = {
  loopButtons: () => j<N8nButton[]>("/api/actions/loops/buttons"),
  loopTrigger: (workflow_id: string) =>
    j<{ run_id: string }>("/api/actions/loops/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_id }),
    }),
  skills: () => j<SkillRow[]>("/api/actions/skills"),
  runSkill: (skill: string) =>
    j<{ run_id: string }>("/api/actions/skills/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill }),
    }),
  runs: () => j<Run[]>("/api/actions/runs"),
  run: (id: string) => j<Run>(`/api/actions/runs/${id}`),
  ack: (id: string) => j<{ ok: boolean }>(`/api/actions/runs/${id}/ack`, { method: "POST" }),
};

// A terminal failure that hasn't been acknowledged: the latch the status
// strip badges and the panel surfaces first.
export function latched(runs: Run[]): Run[] {
  return runs.filter((r) => (r.status === "failed" || r.status === "timeout_latched") && !r.acknowledged);
}
export function running(runs: Run[]): Run[] {
  return runs.filter((r) => r.status === "running");
}
