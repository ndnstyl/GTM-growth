import { ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { NaturalContext, useDragging } from "./ResizableColumn";

export function Panel({
  icon,
  title,
  action,
  children,
  className = "",
  bodyRef,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <section
      className={`g-elev flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card ${className}`}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="panel-title">
          {icon}
          {title}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {action}
        </span>
      </header>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5">{children}</div>
    </section>
  );
}

// Size-aware content. Measures the panel body via
// ResizeObserver and returns how many `rowPx`-tall rows fit after
// `chromePx` of non-row furniture (headers, counts strips). Suspended while
// the column's DragContext reports a live drag, so a mid-drag re-render
// never fights ResizableColumn's imperative flexGrow writes.
export function usePanelCapacity(rowPx: number, chromePx: number) {
  const dragging = useDragging();
  // A weight-0 (natural-height) panel's body height is driven BY its own
  // content: measuring it to decide how much content to show is a
  // entirely; `fit` stays 0 and callers' `max(floor, fit)` floors govern,
  // reproducing today's uncapped/natural rendering.
  const natural = useContext(NaturalContext);
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const bodyRef = useCallback((el: HTMLDivElement | null) => setBodyEl(el), []);

  useEffect(() => {
    if (!bodyEl) return;
    if (dragging || natural) {
      observerRef.current?.disconnect();
      return;
    }
    const measure = () => {
      const rows = Math.floor((bodyEl.clientHeight - chromePx) / rowPx);
      setFit(Math.max(0, rows));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bodyEl);
    observerRef.current = ro;
    return () => ro.disconnect();
  }, [bodyEl, dragging, natural, rowPx, chromePx]);

  // Reviewer fix B: on a weighted -> natural transition (e.g. reset sizes)
  // `fit` state was left holding its last measured (weighted) value, so a
  // natural panel kept rendering the weighted row count until reload. Zeroed
  // here as a derived read (not `setFit(0)` inside the effect above: the
  // react-compiler set-state-in-effect rule forbids a synchronous setState
  // in an effect body; deriving it avoids the extra render AND the stale
  // value in one move) so a live drag suspension (natural === false) still
  // shows the last real measurement with no flicker.
  return { bodyRef, fit: natural ? 0 : fit };
}

export function Row({
  onClick,
  left,
  primary,
  aux,
  right,
}: {
  onClick?: () => void;
  left?: ReactNode;
  primary: ReactNode;
  aux?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`g-fade flex items-baseline gap-2.5 border-b border-border/70 py-1.5 text-[13px] transition-colors duration-150 last:border-b-0 ${
        onClick ? "cursor-pointer hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-primary" : ""
      }`}
    >
      {left}
      <span className="min-w-0 flex-1 line-clamp-2 break-words md:truncate" title={typeof primary === "string" ? primary : undefined}>{primary}</span>
      {aux ? <span className="max-w-[40%] truncate text-[11px] text-muted-foreground">{aux}</span> : null}
      {right}
    </div>
  );
}
