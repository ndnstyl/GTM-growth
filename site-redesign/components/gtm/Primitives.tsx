import React, { useEffect, useRef, useState } from "react";
import { cx } from "./lib/cx";
import { useReveal } from "./lib/useReveal";
import { useMotionAllowed } from "./lib/useMotion";

/* ----- Reveal: fades and lifts into view; staggered by --i. ----- */
export function Reveal({
  as: Tag = "div",
  i = 0,
  className,
  children,
  ...rest
}: {
  as?: any;
  i?: number;
  className?: string;
  children?: React.ReactNode;
  [k: string]: any;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag ref={ref} className={cx("g-rv", className)} style={{ ["--i" as string]: i }} {...rest}>
      {children}
    </Tag>
  );
}

/* ----- Expander: the toggle comes first in the DOM, the panel right after, so Tab walks into the panel. ----- */
export function Expander({
  id,
  openLabel = "Show less",
  closedLabel,
  children,
  className,
  toggleClassName,
  lazy = false,
}: {
  id: string;
  openLabel?: string;
  closedLabel: string;
  children: React.ReactNode;
  className?: string;
  toggleClassName?: string;
  /** do not put the panel in the page until it has been opened once (keeps a heavy panel out of the first paint) */
  lazy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(!lazy);
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // `inert` is set as an attribute: React 18 does not know the prop
    const el = panel.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);
  return (
    <div className="g-xwrap">
      <button
        type="button"
        className={cx("g-xtoggle", toggleClassName)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setSeen(true);
          setOpen((o) => !o);
        }}
      >
        <span className="g-pl" aria-hidden="true">
          +
        </span>
        <span>{open ? openLabel : closedLabel}</span>
      </button>
      <div className={cx("g-xp", open && "open", className)} id={id}>
        <div>
          <div className="g-xin" ref={panel} {...({ inert: "" } as any)}>
            {seen ? children : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----- TiltCard: pointer spotlight and a small tilt on real hover devices only. ----- */
export function TiltCard({
  className,
  children,
  as: Tag = "article",
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
  as?: any;
  [k: string]: any;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const motion = useMotionAllowed();
  const hoverable = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  return (
    <Tag
      ref={ref}
      className={cx("g-glass", "g-tilt", className)}
      onPointerEnter={() => {
        if (motion && hoverable() && ref.current) ref.current.style.willChange = "transform";
      }}
      onPointerMove={(e: React.PointerEvent) => {
        const el = ref.current;
        if (!el || e.pointerType === "touch" || !hoverable()) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
        if (motion) {
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(1000px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
          // the scene and the heading shift at their own rates, so the card reads as layers under the tilt
          el.style.setProperty("--tx", x.toFixed(3));
          el.style.setProperty("--ty", y.toFixed(3));
        }
      }}
      onPointerLeave={() => {
        const el = ref.current;
        if (!el) return;
        el.style.transform = "";
        el.style.willChange = "";
        el.style.setProperty("--tx", "0");
        el.style.setProperty("--ty", "0");
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ----- CountUp: the final figure is always in the DOM and read by assistive tech; the count is visual only. ----- */
export function CountUp({ from, to, text, className }: { from?: number; to: number; text?: string; className?: string }) {
  const motion = useMotionAllowed();
  const ref = useRef<HTMLSpanElement | null>(null);
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    if (!motion || !ref.current) {
      setV(null);
      return;
    }
    const el = ref.current;
    let raf = 0;
    const start = (from ?? to * 0.6) as number; // never starts at zero: a fast scroll must not read "0 systems"
    const run = () => {
      const t0 = performance.now();
      const step = (n: number) => {
        const k = Math.min(1, (n - t0) / 700);
        const e = 1 - Math.pow(1 - k, 3);
        setV(Math.round(start + (to - start) * e));
        if (k < 1) raf = requestAnimationFrame(step);
        else setV(null);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (es) => {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        run();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [motion, from, to]);
  const final = text ?? String(to);
  return (
    <span className={cx("g-count", className)} ref={ref} style={{ ["--w" as string]: `${final.length}ch` } as React.CSSProperties}>
      <span aria-hidden="true">{v === null ? final : v}</span>
      <span className="g-sr">{final}</span>
    </span>
  );
}
