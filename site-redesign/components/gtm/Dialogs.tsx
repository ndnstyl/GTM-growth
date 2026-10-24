import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "./lib/cx";
import { useMotionAllowed } from "./lib/useMotion";

/* ===== Controller: one dialog open at a time; opening another closes the current one first (swap). ===== */

export type DialogName = "book" | "menu" | "gtmos" | "folder" | "feat" | "case";
interface Req {
  name: DialogName;
  payload?: unknown;
  opener?: HTMLElement | null;
}
interface Ctx {
  current: Req | null;
  open: (name: DialogName, payload?: unknown, opener?: HTMLElement | null) => void;
  /** Close whatever is open; `after` runs once the exit animation has finished. */
  close: (after?: () => void) => void;
  /** Called by a Dialog when its exit has finished. */
  exited: () => void;
}

const DialogCtx = createContext<Ctx | null>(null);

export function useDialogs(): Ctx {
  const c = useContext(DialogCtx);
  if (!c) throw new Error("useDialogs needs <DialogProvider> above it in the tree");
  return c;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Req | null>(null);
  const pending = useRef<Req | null>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const currentRef = useRef<Req | null>(null);
  currentRef.current = current;

  const open = useCallback((name: DialogName, payload?: unknown, opener?: HTMLElement | null) => {
    // a swap (folder to booking) keeps the original opener, so closing returns focus to the card the visitor started from
    const keep = currentRef.current?.opener;
    const req = { name, payload, opener: keep || opener || (document.activeElement as HTMLElement | null) };
    if (currentRef.current) {
      pending.current = req;
      setCurrent(null);
    } else setCurrent(req);
  }, []);

  const close = useCallback((after?: () => void) => {
    if (!currentRef.current) {
      if (after) after();
      return;
    }
    afterClose.current = after || null;
    setCurrent(null);
  }, []);

  const exited = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    if (p) setCurrent(p);
    const a = afterClose.current;
    afterClose.current = null;
    if (a) a();
  }, []);

  const value = useMemo(() => ({ current, open, close, exited }), [current, open, close, exited]);
  return <DialogCtx.Provider value={value}>{children}</DialogCtx.Provider>;
}

/* ===== The dialog itself: native <dialog> (focus trap, Esc, inert page) with an animated open and close. ===== */

let openCount = 0;
function lock() {
  openCount += 1;
  document.documentElement.classList.add("g-modal-open");
}
function unlock() {
  openCount = Math.max(0, openCount - 1);
  if (!openCount) document.documentElement.classList.remove("g-modal-open");
}

interface DialogProps {
  name: DialogName;
  id?: string;
  label?: string;
  labelledBy?: string;
  className?: string;
  /** property whose transition end marks the exit as finished */
  exitProp?: "transform" | "clip-path";
  children: React.ReactNode;
}

export function Dialog({ name, id, label, labelledBy, className, exitProp = "transform", children }: DialogProps) {
  const ctx = useDialogs();
  const isOpen = ctx.current?.name === name;
  const opener = ctx.current?.opener || null;
  const motion = useMotionAllowed();
  const ref = useRef<HTMLDialogElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const locked = useRef(false);
  const finishing = useRef(false);

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    const d = ref.current;
    if (d && d.open) d.close();
    if (locked.current) {
      locked.current = false;
      unlock();
    }
    setMounted(false);
    const o = openerRef.current;
    openerRef.current = null;
    if (o && o.isConnected) o.focus({ preventScroll: true });
    ctx.exited();
  }, [ctx]);

  // open
  useEffect(() => {
    if (!isOpen) return;
    finishing.current = false;
    openerRef.current = opener;
    setMounted(true);
  }, [isOpen, opener]);

  useEffect(() => {
    if (!mounted || !isOpen) return;
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    if (!locked.current) {
      locked.current = true;
      lock();
    }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [mounted, isOpen]);

  // close: animate out, then really close when the transition ends (never on a guess)
  useEffect(() => {
    if (isOpen || !mounted) return;
    setShown(false);
    const d = ref.current;
    if (!d) return;
    // nothing to wait for when motion is off, or when it was closed before it finished opening
    if (!motion || !d.classList.contains("open")) {
      finish();
      return;
    }
    let timer = 0;
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== exitProp) return;
      if (e.target !== d && !(e.target as HTMLElement).classList.contains("g-sheet")) return;
      cleanup();
      finish();
    };
    const cleanup = () => {
      d.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timer);
    };
    d.addEventListener("transitionend", onEnd);
    // fallback only: if the browser never reports the end (tab hidden), do not strand a closed-looking dialog
    timer = window.setTimeout(() => {
      cleanup();
      finish();
    }, 1200);
    return cleanup;
  }, [isOpen, mounted, motion, exitProp, finish]);

  // Esc and the backdrop route through the controller so state never disagrees with the DOM
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      ctx.close();
    };
    // a native close (Chrome allows a second Escape through) must still reset our state
    const onClose = () => {
      if (isOpen) ctx.close();
      if (locked.current) {
        locked.current = false;
        unlock();
      }
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onClose);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onClose);
    };
  });

  useEffect(
    () => () => {
      if (locked.current) {
        locked.current = false;
        unlock();
      }
    },
    [],
  );

  return (
    <dialog
      ref={ref}
      id={id}
      className={cx("g-m", className, shown && "open")}
      aria-label={label}
      aria-labelledby={mounted ? labelledBy : undefined}
      onClick={(e) => {
        if (e.target === ref.current) ctx.close();
      }}
    >
      {mounted ? children : null}
    </dialog>
  );
}

export function CloseButton({ label = "Close" }: { label?: string }) {
  const { close } = useDialogs();
  return (
    <button type="button" className="g-xbtn" aria-label={label} onClick={() => close()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 5l14 14M19 5L5 19" />
      </svg>
    </button>
  );
}

/** Sheet with a sticky head (label + close) so the close button never scrolls away on a phone. */
function useScrollable<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.scrollHeight > el.clientHeight + 1) el.setAttribute("tabindex", "0");
      else el.removeAttribute("tabindex");
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

export function Sheet({
  label,
  labelId,
  children,
  foot,
  className,
}: {
  label?: React.ReactNode;
  labelId?: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
  className?: string;
}) {
  const body = useScrollable<HTMLDivElement>();
  return (
    <div className={cx("g-sheet", className)}>
      <div className="g-sheet-head">
        {label ? (
          <span className="g-label" id={labelId}>
            {label}
          </span>
        ) : (
          <span />
        )}
        <CloseButton />
      </div>
      <div className="g-sheet-body" ref={body} role="region" aria-label="Details">
        {children}
      </div>
      {foot ? <div className="g-sheet-foot">{foot}</div> : null}
    </div>
  );
}
