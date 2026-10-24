"use client";

// Resizable side column. Renders one of the cockpit's two side
// columns with a drag divider between EVERY adjacent visible panel. A
// weight-0 (natural-height) panel converts the WHOLE column on first drag,
// seeding every panel's weight from its measured pixel height and parking
// the column's free space in an invisible trailing spacer pseudo-panel
// (`_spacer:<col>`) so the layout is pixel-identical at the moment of
// conversion and on reload (plan.md §2, rev 4).

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { DEFAULT_WEIGHTS, isKnownPanelId, type PanelSpec } from "./LayoutEdit";

// Suspension channel: usePanelCapacity subscribes to this to
// pause its ResizeObserver-driven row counting while a drag is live, so a
// mid-drag re-render never fights the imperative flexGrow writes below.
export const DragContext = createContext(false);
export function useDragging() {
  return useContext(DragContext);
}

// A weight-0 (natural-height) panel's body height is driven by its own
// content, so a capacity hook that measures that body and then re-renders
// natural panels; the id-driven row-count floors already reproduce today's
// behavior with no measurement needed.
export const NaturalContext = createContext(false);

const MIN_PANEL_PX = 96;
const WEIGHT_MIN = 0.2;
const WEIGHT_MAX = 10;

function spacerId(col: "left" | "right") {
  return `_spacer:${col}`;
}

function defaultWeight(id: string): number {
  return DEFAULT_WEIGHTS[id] ?? 0;
}

function weightOf(p: PanelSpec): number {
  return p.weight !== undefined && Number.isFinite(p.weight) ? p.weight : defaultWeight(p.id);
}

// Distribute measured pixel sizes (panels + trailing slack) into weights
// that sum to WEIGHT_MAX, flooring any entry below WEIGHT_MIN and shaving the
// difference proportionally off the entries that have room above the floor.
function conversionWeights(pxSizes: number[]): number[] {
  const total = pxSizes.reduce((a, b) => a + b, 0) || 1;
  const raw = pxSizes.map((px) => (WEIGHT_MAX * px) / total);
  const floored = raw.map((w) => Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w)));
  const sum = floored.reduce((a, b) => a + b, 0);
  const over = sum - WEIGHT_MAX;
  if (Math.abs(over) < 1e-6) return floored;
  const room = floored.map((w, i) => (raw[i] > WEIGHT_MIN ? w - WEIGHT_MIN : 0));
  const roomTotal = room.reduce((a, b) => a + b, 0);
  if (roomTotal <= 0) return floored;
  return floored.map((w, i) => w - (room[i] / roomTotal) * over);
}

type DragState = {
  a: string;
  b: string;
  hA: number;
  hB: number;
  wA: number;
  wB: number;
  startY: number;
  pending: Map<string, number>;
};

export function ResizableColumn({
  col,
  panels,
  save,
  renderPanel,
}: {
  col: "left" | "right";
  panels: PanelSpec[];
  save: (next: PanelSpec[]) => void;
  renderPanel: (id: string) => ReactNode;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const spacerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const spId = spacerId(col);
  const items = useMemo(
    () => panels.filter((p) => p.col === col && p.visible && p.id !== spId && isKnownPanelId(p.id)),
    [panels, col, spId]
  );
  const spacer = panels.find((p) => p.id === spId);
  const hasNaturalPanel = items.some((p) => weightOf(p) === 0);

  const setItemRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) itemRefs.current.set(id, el);
      else itemRefs.current.delete(id);
    },
    []
  );

  // minH is parameterized so the spacer (a real flex item, never subject to
  // the 96px panel floor) can be pinned to 0 explicitly (CRITICAL-2) instead
  // of inheriting the panel default.
  const applyWeightedStyle = (el: HTMLDivElement, w: number, minH: number = MIN_PANEL_PX) => {
    el.style.flexGrow = String(w);
    el.style.flexBasis = "0px";
    el.style.flexShrink = "1";
    el.style.minHeight = `${minH}px`;
  };

  const elFor = (id: string): HTMLDivElement | null => (id === spId ? spacerRef.current : itemRefs.current.get(id) ?? null);
  const weightById = (id: string): number => {
    if (id === spId) return spacer ? weightOf(spacer) : 0;
    const p = items.find((it) => it.id === id);
    return p ? weightOf(p) : 0;
  };

  // Stable listener identities (needed so add/removeEventListener target the
  // same function) that dispatch to the latest closure each render via a
  // ref, so a mid-drag render (none expected, but defensive) never leaves a
  // stale `panels`/`save` bound into the handler.
  const impl = useRef<{ move: (e: PointerEvent) => void; up: () => void }>({ move: () => {}, up: () => {} });
  // useCallback (not `useRef(...).current`): the wrapper body accesses
  // impl.current when the LISTENER FIRES, not during render, which is what
  // the react-compiler ref-purity rule requires.
  const stableMove = useCallback((e: PointerEvent) => impl.current.move(e), []);
  const stableUp = useCallback(() => impl.current.up(), []);

  // Refresh the impl closures after every render (never during render , 
  // ref writes belong in an effect) so a drag session always dispatches
  // against the latest `panels`/`save` without add/removeEventListener ever
  // targeting a different function identity.
  // Unmount cleanup (INFO-10): stableMove/stableUp identities never change
  // (created once via useRef), so this effect only fires its cleanup on
  // unmount, never on an ordinary re-render.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", stableMove);
      window.removeEventListener("pointerup", stableUp);
      window.removeEventListener("pointercancel", stableUp);
    };
  }, [stableMove, stableUp]);

  useEffect(() => {
    impl.current.move = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      const aEl = elFor(st.a);
      const bEl = elFor(st.b);
      if (!aEl || !bEl) return;
      // Per-partner floors (reviewer fix A): the spacer has no 96px panel
      // floor: it's not a panel: so clamping it to MIN_PANEL_PX like a
      // real neighbor force-snapped the OTHER side by the negative headroom
      // on the very first pointermove whenever the spacer was under 96px,
      // and left that slack permanently unreclaimable.
      const minA = st.a === spId ? 0 : MIN_PANEL_PX;
      const minB = st.b === spId ? 0 : MIN_PANEL_PX;
      const min = -(st.hA - minA);
      const max = st.hB - minB;
      const delta = Math.min(max, Math.max(min, e.clientY - st.startY));
      const ratio = (st.wA + st.wB) / (st.hA + st.hB);
      const newWA = ratio * (st.hA + delta);
      const newWB = ratio * (st.hB - delta);
      aEl.style.flexGrow = String(newWA);
      bEl.style.flexGrow = String(newWB);
      st.pending.set(st.a, newWA);
      st.pending.set(st.b, newWB);
    };

    impl.current.up = () => {
      const st = dragState.current;
      window.removeEventListener("pointermove", stableMove);
      window.removeEventListener("pointerup", stableUp);
      window.removeEventListener("pointercancel", stableUp);
      setDragging(false);
      dragState.current = null;
      if (!st) return;
      let result = panels.map((p) => (st.pending.has(p.id) ? { ...p, weight: st.pending.get(p.id) } : p));
      if (st.pending.has(spId) && !result.some((p) => p.id === spId)) {
        result = [...result, { id: spId, col, visible: true, weight: st.pending.get(spId) }];
      }
      save(result);
    };
  });

  // Generic pair-drag starter: works for an internal item/item divider AND
  // valid drag partner, converted slack can never be reclaimed).
  const beginDrag = (aId: string, bId: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const aEl = elFor(aId);
    const bEl = elFor(bId);
    if (!aEl || !bEl) return;

    const pending = new Map<string, number>();

    if (hasNaturalPanel) {
      // Whole-column conversion: measure everything BEFORE any style
      // write, so the seed reproduces today's pixels exactly. Subtract the
      // divider pixels (10px each: one between every adjacent pair of
      // items, plus one more before the spacer once it exists) from the
      // free-space slack, or the dividers themselves eat into the seeded
      const heights = items.map((p) => itemRefs.current.get(p.id)?.offsetHeight ?? 0);
      const contentH = colRef.current?.clientHeight ?? heights.reduce((x, y) => x + y, 0);
      const sumH = heights.reduce((x, y) => x + y, 0);
      const dividerPx = 10 * items.length; // (items.length - 1) internal + 1 before the spacer
      // Note: only the n-1 dividers that were already mounted (pre-conversion,
      // no spacer yet) actually occupy layout at THIS measurement; the divider
      // before the spacer doesn't exist until this same conversion adds the
      // spacer. So panels sit ~10px large during the drag and land exact only
      // once pointerup commits and the new divider mounts: intentional.
      const slackPx = Math.max(0, contentH - sumH - dividerPx);
      const weights = conversionWeights([...heights, slackPx]);
      items.forEach((p, i) => {
        pending.set(p.id, weights[i]);
        const el = itemRefs.current.get(p.id);
        if (el) applyWeightedStyle(el, weights[i]);
      });
      const spacerW = weights[weights.length - 1];
      pending.set(spId, spacerW);
      if (spacerRef.current) applyWeightedStyle(spacerRef.current, spacerW, 0);
    } else {
      items.forEach((p) => pending.set(p.id, weightOf(p)));
      if (spacer) pending.set(spacer.id, weightOf(spacer));
    }

    const hA = aEl.offsetHeight;
    const hB = bEl.offsetHeight;
    const wA = pending.get(aId) ?? weightById(aId);
    const wB = pending.get(bId) ?? weightById(bId);

    dragState.current = { a: aId, b: bId, hA, hB, wA, wB, startY: e.clientY, pending };
    setDragging(true);
    window.addEventListener("pointermove", stableMove);
    window.addEventListener("pointerup", stableUp);
    window.addEventListener("pointercancel", stableUp);
  };

  return (
    <DragContext.Provider value={dragging}>
      <div ref={colRef} className="flex flex-col overflow-y-auto xl:min-h-0 max-xl:overflow-visible">
        {items.map((p, i) => {
          const w = weightOf(p);
          const next = items[i + 1];
          // Divider partner: the next item, or: on the last item, when a
          const dividerPartner = next ? next.id : spacer ? spId : null;
          return (
            <Fragment key={p.id}>
              <div
                ref={setItemRef(p.id)}
                className="g-rise flex flex-col xl:min-h-0 max-xl:min-h-[300px]! max-xl:grow-0! max-xl:shrink-0! max-xl:basis-auto!"
                style={{
                  ...(w > 0
                    ? { flexGrow: w, flexBasis: 0, flexShrink: 1, minHeight: MIN_PANEL_PX }
                    : { flexGrow: 0, flexBasis: "auto", flexShrink: 0 }),
                  ["--i" as string]: (col === "left" ? 0 : 3) + i,
                }}
              >
                <NaturalContext.Provider value={w === 0}>{renderPanel(p.id)}</NaturalContext.Provider>
              </div>
              {dividerPartner ? (
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  onPointerDown={beginDrag(p.id, dividerPartner)}
                  className="group flex h-[10px] shrink-0 cursor-row-resize touch-none items-center justify-center"
                >
                  <div className="h-[2px] w-full rounded-full bg-border transition-colors group-hover:bg-primary group-active:bg-primary" />
                </div>
              ) : null}
            </Fragment>
          );
        })}
        <div
          ref={spacerRef}
          aria-hidden
          className="max-xl:hidden"
          style={
            spacer
              ? { flexGrow: weightOf(spacer), flexBasis: 0, flexShrink: 1, minHeight: 0 }
              : { flexGrow: 0, flexBasis: 0, flexShrink: 0, minHeight: 0 }
          }
        />
      </div>
    </DragContext.Provider>
  );
}
