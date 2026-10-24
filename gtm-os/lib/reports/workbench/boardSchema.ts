// boardSchema: a Board is WIRING, never numbers [data-model]:
// panels reference saved views (or carry an inline view), plus cross-filter
// rules. Canon boards live in public/data-views/board-*.json listed by
// boards-index.json (git = truth); personal boards in localStorage with
// export/import, stamped origin=personal at the import boundary [p1-review F7].

import { validateView, type View } from "./viewSchema";
import { findSource } from "./sources";
import type { ChartSpec } from "./chartSpec";

export type BoardPanel = {
  viewId?: string; // a canon view id
  inlineView?: unknown; // or a full inline view (validated)
  layout?: { span?: 1 | 2 }; // grid columns the panel takes
};

export type CrossFilterRule = {
  fromPanel: number; // index into panels: must be a chart panel
  selection: "category"; // v1: category clicks; dateRange lands with brushes
  toPanels: number[];
};

export type Board = {
  id: string;
  name: string;
  description?: string;
  panels: BoardPanel[];
  crossFilter: CrossFilterRule[];
  origin: "canon" | "personal" | "agent";
  created_by: string;
  created_at: string;
};

export type ResolvedPanel = { view: View; span: 1 | 2 };
export type ResolvedBoard = Omit<Board, "panels"> & { panels: ResolvedPanel[] };

const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

export type BoardValidation = { ok: true; board: ResolvedBoard } | { ok: false; errors: string[] };

export function validateBoard(json: unknown, canonViews: View[]): BoardValidation {
  const errors: string[] = [];
  const b = json as Partial<Board>;
  if (!b || typeof b !== "object") return { ok: false, errors: ["not an object"] };
  if (!b.id || !ID.test(b.id)) errors.push("id: lowercase kebab-case, 2-64 chars");
  if (!b.name) errors.push("name: required");
  if (!b.origin || !["canon", "personal", "agent"].includes(b.origin)) {
    errors.push("origin: canon | personal | agent");
  }
  if (!b.created_by) errors.push("created_by: required");
  if (!Array.isArray(b.panels) || !b.panels.length) {
    return { ok: false, errors: [...errors, "panels: at least one"] };
  }

  const byId = new Map(canonViews.map((v) => [v.id, v]));
  const panels: ResolvedPanel[] = [];
  b.panels.forEach((p, i) => {
    if (p.viewId) {
      const v = byId.get(p.viewId);
      if (!v) errors.push(`panels[${i}]: unknown viewId '${p.viewId}'`);
      else panels.push({ view: v, span: p.layout?.span === 2 ? 2 : 1 });
    } else if (p.inlineView) {
      const r = validateView(p.inlineView);
      if (!r.ok) errors.push(`panels[${i}] inlineView: ${r.errors.join("; ")}`);
      else panels.push({ view: r.view, span: p.layout?.span === 2 ? 2 : 1 });
    } else {
      errors.push(`panels[${i}]: viewId or inlineView required`);
    }
  });

  const seenFrom = new Set<number>();
  for (const [ri, rule] of (b.crossFilter ?? []).entries()) {
    if (seenFrom.has(rule.fromPanel)) {
      errors.push(`crossFilter[${ri}]: a second rule from panel ${rule.fromPanel}: merge toPanels into one rule`);
    }
    seenFrom.add(rule.fromPanel);
    const from = panels[rule.fromPanel];
    if (!from) {
      errors.push(`crossFilter[${ri}]: fromPanel ${rule.fromPanel} out of range`);
      continue;
    }
    if (rule.selection !== "category") {
      errors.push(`crossFilter[${ri}]: selection 'category' only in v1 (dateRange lands with brushes)`);
      continue;
    }
    if (from.view.presentation !== "chart") {
      errors.push(`crossFilter[${ri}]: fromPanel must be a chart (selections come from chart clicks)`);
      continue;
    }
    const xDim = (from.view.chartSpec as ChartSpec | undefined)?.x;
    for (const t of rule.toPanels) {
      const target = panels[t];
      if (!target) {
        errors.push(`crossFilter[${ri}]: toPanel ${t} out of range`);
        continue;
      }
      if (t === rule.fromPanel) errors.push(`crossFilter[${ri}]: a panel cannot filter itself`);
      const src = findSource(target.view.sourceKey);
      if (xDim && src && !src.dims.some((d) => d.key === xDim)) {
        errors.push(
          `crossFilter[${ri}]: toPanel ${t} (${target.view.id}) has no dim '${xDim}': the selection cannot bind`
        );
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    board: { ...(b as Board), panels },
  };
}

export async function loadCanonBoards(canonViews: View[]): Promise<{ boards: ResolvedBoard[]; errors: string[] }> {
  const errors: string[] = [];
  const boards: ResolvedBoard[] = [];
  try {
    const idx = await fetch("/data-views/boards-index.json", { cache: "no-store" });
    if (!idx.ok) return { boards, errors: [`boards-index.json HTTP ${idx.status}`] };
    const ids = (await idx.json()) as string[];
    for (const id of ids) {
      const r = await fetch(`/data-views/${id}.json`, { cache: "no-store" });
      if (!r.ok) {
        errors.push(`${id}: HTTP ${r.status}`);
        continue;
      }
      const result = validateBoard(await r.json(), canonViews);
      if (result.ok) boards.push(result.board);
      else errors.push(`${id}: ${result.errors.join("; ")}`);
    }
  } catch (e) {
    errors.push(String(e));
  }
  return { boards, errors };
}

const LS_KEY = "echo_workbench_boards_v1";

// invalid personal boards surface their reasons [p2-review r2 W3]: a canon
// rename silently deleting a user's saved board is a trust failure
export function loadPersonalBoards(canonViews: View[]): { boards: ResolvedBoard[]; errors: string[] } {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { boards: [], errors: [] };
    const boards: ResolvedBoard[] = [];
    const errors: string[] = [];
    for (const j of JSON.parse(raw) as unknown[]) {
      const r = validateBoard({ ...(j as object), origin: "personal" }, canonViews);
      if (r.ok) boards.push(r.board);
      else errors.push(`personal board '${(j as { id?: string }).id ?? "?"}': ${r.errors[0]}`);
    }
    return { boards, errors };
  } catch {
    return { boards: [], errors: [] };
  }
}

export function savePersonalBoard(raw: Board): void {
  try {
    const existing = JSON.parse(window.localStorage.getItem(LS_KEY) ?? "[]") as Board[];
    const all = existing.filter((x) => x.id !== raw.id);
    all.push(raw);
    window.localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* localStorage unavailable: session-only */
  }
}
