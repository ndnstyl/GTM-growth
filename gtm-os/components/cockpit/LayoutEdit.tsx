"use client";

// Widget grid edit mode: show/hide/reorder the side-column panels and add snapshot widgets.
// Layout persists in the visitor's own browser storage through the demo adapter.

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { Panel } from "./Panel";
import { useActiveInterval } from "@/lib/motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { reportLog } from "@/lib/reports/log";

export type PanelSpec = { id: string; col: "left" | "right"; visible: boolean; weight?: number };

export const DEFAULT_PANELS: PanelSpec[] = [
  { id: "numbers", col: "left", visible: true },
  { id: "clocknext", col: "left", visible: true },
  { id: "microapps", col: "left", visible: false },
  { id: "media", col: "left", visible: false },
  { id: "chat", col: "right", visible: true },
  { id: "routines", col: "right", visible: true },
  { id: "consentops", col: "right", visible: false },
];

const nice = (id: string) => id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const LABELS: Record<string, string> = {
  microapps: "Tools", clocknext: "Calendar", media: "Media calendar", numbers: "Key numbers",
  chat: "Ask the data", needsyou: "Ask the data", routines: "Loops",
  consentops: "Consent operations",
};

// Per-id defaults: 0 = natural height, >0 = flexible share. Reset
// restores this exact map, so a panel moved between columns resets to its
// own default, not a foreign proportion.
export const DEFAULT_WEIGHTS: Record<string, number> = {
  routines: 1, chat: 1, needsyou: 1, microapps: 0, clocknext: 0, media: 0, numbers: 0, consentops: 1,
};

// Renderable ids: the panels this app version knows how to draw, plus
// snapshot widgets and the per-column slack spacer. Render-only: a stale
// stored id is filtered from rendering/weighting/dividers here but is never
// dropped from `panels` state, so it isn't deleted by the next save (a later
// app version that knows the id gets it back).
export const KNOWN_PANEL_IDS = new Set(DEFAULT_PANELS.map((p) => p.id));
// Retired ids that saved layouts may still carry. They render (page.tsx maps them to
// their successor) and validate, so an old layout is never a hole.
// On load a legacy id is rewritten to its successor IN PLACE, so the successor default is
export const LEGACY_PANEL_IDS = new Set(["needsyou"]);
export const LEGACY_SUCCESSOR: Record<string, string> = { needsyou: "chat" };
export function migrateLegacyPanels(stored: PanelSpec[]): PanelSpec[] {
  const out: PanelSpec[] = [];
  const seen = new Set<string>();
  for (const p of stored) {
    const id = LEGACY_SUCCESSOR[p.id] ?? p.id;
    if (seen.has(id)) continue;          // a layout carrying both needsyou and chat keeps the first
    seen.add(id);
    out.push(p.id === id ? p : { ...p, id });
  }
  return out;
}
export function isKnownPanelId(id: string): boolean {
  return KNOWN_PANEL_IDS.has(id) || LEGACY_PANEL_IDS.has(id) || id.startsWith("snap:") || id.startsWith("_spacer:");
}

// Weight sanitizer (client side of the both-sides rule; host mirrors it in
// the data): weight present and finite; 0 passes
// as-is; negative/NaN -> undefined (caller falls back to DEFAULT_WEIGHTS);
// otherwise clamp to [0.2, 10] -- identical bounds to the host.
export function sanitizeStoredWeight(id: string, raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    reportLog.warn(`layout: invalid weight for ${id}, falling back to default`);
    return undefined;
  }
  if (raw === 0) return 0;
  return Math.min(10, Math.max(0.2, raw));
}

export function useLayout() {
  const [panels, setPanels] = useState<PanelSpec[]>(DEFAULT_PANELS);
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // Dismissal is per-error-instance: a NEW failure after dismissal re-arms
  const [saveErrSeq, setSaveErrSeq] = useState(0);

  useEffect(() => {
    fetch("/api/layout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSnapshots(d.snapshots ?? []);
        if (d.layout?.panels?.length) {
          // merge: stored order/visibility wins; unknown-new defaults appended
          const stored = migrateLegacyPanels(d.layout.panels as PanelSpec[]).map((p) => ({
            ...p,
            weight: sanitizeStoredWeight(p.id, p.weight),
          }));
          const known = new Set(stored.map((p) => p.id));
          setPanels([...stored, ...DEFAULT_PANELS.filter((p) => !known.has(p.id))]);
        }
      })
      .catch(() => null); // host down: defaults render, nothing breaks
  }, []);

  const save = useCallback((next: PanelSpec[]) => {
    const clean = next.map((p) => ({ ...p, weight: sanitizeStoredWeight(p.id, p.weight) }));
    setPanels(clean);
    fetch("/api/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ panels: clean }),
    })
      .then((r) => {
        if (r.ok) { setSaveErr(null); return; }
        setSaveErr(`layout save refused: HTTP ${r.status}`);
        setSaveErrSeq((n) => n + 1);
      })
      .catch((e) => {
        setSaveErr(`layout save failed: ${e.message}`);
        setSaveErrSeq((n) => n + 1);
      });
  }, []);

  return { panels, snapshots, save, saveErr, saveErrSeq };
}

// Generic renderer for a snapshot-file widget (SNAPSHOTS.md convention):
// {as_of, data} → key/value rows; absent file → quiet "not wired yet".
export function SnapshotWidget({ name }: { name: string }) {
  const [snap, setSnap] = useState<{ as_of?: string; data?: Record<string, unknown> } | null | "missing">(null);

  useEffect(() => {
    const load = () =>
      fetch(`/data/snapshots/${name}.json`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : "missing"))
        .then(setSnap)
        .catch(() => setSnap("missing"));
    load();
  }, [name]);
  useActiveInterval(() => {
    void fetch(`/data/snapshots/${name}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setSnap)
      .catch(() => setSnap("missing"));
  }, 5 * 60 * 1000);

  const asOf = snap && snap !== "missing" && snap.as_of ? String(snap.as_of).slice(0, 10) : null;
  return (
    <Panel title={nice(name)} action={asOf ? <span>as of {asOf}</span> : undefined}>
      {snap === "missing" ? (
        <div className="py-2 text-[12px] text-muted-foreground">snapshot not available</div>
      ) : !snap ? (
        <div aria-busy="true" className="space-y-2 py-2"><div className="g-skel h-[16px] w-2/3" /><div className="g-skel h-[16px] w-1/2" /></div>
      ) : !snap.as_of ? (
        <div className="py-2 text-[12px] font-semibold text-[var(--crit)]">malformed snapshot: as_of is required</div>
      ) : (
        <div className="flex flex-col gap-1 py-1 text-[13px]">
          {Object.entries(snap.data ?? {}).slice(0, 12).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{k}</span>
              <span className="truncate font-semibold">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function LayoutEditSheet({
  open, onOpenChange, panels, snapshots, save, saveErr,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  panels: PanelSpec[];
  snapshots: string[];
  save: (p: PanelSpec[]) => void;
  saveErr?: string | null;
}) {
  const move = (id: string, dir: -1 | 1) => {
    const idx = panels.findIndex((p) => p.id === id);
    // Exclude the spacer pseudo-panel: it isn't a real reorder target, so
    // the last real panel's down-arrow was swapping with it and looking
    const inCol = panels.filter((p) => p.col === panels[idx].col && !p.id.startsWith("_spacer:"));
    const colIdx = inCol.findIndex((p) => p.id === id);
    const swapWith = inCol[colIdx + dir];
    if (!swapWith) return;
    const next = [...panels];
    const j = next.findIndex((p) => p.id === swapWith.id);
    [next[idx], next[j]] = [next[j], next[idx]];
    save(next);
  };
  const toggle = (id: string) => save(panels.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)));
  const addSnapshot = (name: string, col: "left" | "right") => {
    if (panels.some((p) => p.id === `snap:${name}`)) return;
    save([...panels, { id: `snap:${name}`, col, visible: true }]);
  };
  const unplaced = snapshots.filter((s) => !panels.some((p) => p.id === `snap:${s}`));
  const resetColumn = (col: "left" | "right") => {
    const next = panels
      .filter((p) => !(p.col === col && p.id === `_spacer:${col}`))
      .map((p) => (p.col === col ? { ...p, weight: DEFAULT_WEIGHTS[p.id] } : p));
    save(next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[380px] !max-w-[380px] overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-4 py-2">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <SlidersHorizontal size={14} className="text-primary" /> Edit layout
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 py-3 text-[13px]">
          {saveErr ? <div className="text-[12px] font-semibold text-[var(--crit)]">{saveErr}</div> : null}
          {(["left", "right"] as const).map((col) => (
            <section key={col}>
              <h3 className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {col} column
                <button onClick={() => resetColumn(col)} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground hover:border-primary hover:text-primary">reset sizes</button>
              </h3>
              {panels.filter((p) => p.col === col && !p.id.startsWith("_spacer:")).map((p) => (
                <div key={p.id} className={`mb-1 flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 ${p.visible ? "" : "opacity-50"}`}>
                  <span className="font-medium">{LABELS[p.id] ?? nice(p.id.replace("snap:", ""))}</span>
                  <span className="ml-auto" />
                  <button onClick={() => move(p.id, -1)} aria-label={`Move ${LABELS[p.id] ?? p.id} up`} className="rounded p-1 text-muted-foreground hover:text-primary"><ArrowUp size={14} /></button>
                  <button onClick={() => move(p.id, 1)} aria-label={`Move ${LABELS[p.id] ?? p.id} down`} className="rounded p-1 text-muted-foreground hover:text-primary"><ArrowDown size={14} /></button>
                  <button onClick={() => toggle(p.id)} aria-label={`${p.visible ? "Hide" : "Show"} ${LABELS[p.id] ?? p.id}`} className="rounded p-1 text-muted-foreground hover:text-primary" title={p.visible ? "Hide" : "Show"}>
                    {p.visible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              ))}
            </section>
          ))}
          <section>
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">snapshot widgets</h3>
            {unplaced.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">
                no unplaced snapshots
              </div>
            ) : (
              unplaced.map((s) => (
                <div key={s} className="mb-1 flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                  <span className="font-medium">{nice(s)}</span>
                  <span className="ml-auto" />
                  <button onClick={() => addSnapshot(s, "left")} className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:border-primary">+ left</button>
                  <button onClick={() => addSnapshot(s, "right")} className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:border-primary">+ right</button>
                </div>
              ))
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
