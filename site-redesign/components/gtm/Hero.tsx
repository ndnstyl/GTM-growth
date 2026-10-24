import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDialogs } from "./Dialogs";
import CockpitFrame from "./CockpitFrame";
import { Arrow } from "./Icons";
import { subscribeScroll, clamp } from "./lib/scrollBus";
import { useMotionAllowed } from "./lib/useMotion";

const L1 = "Fractional Chief AI Officer and CTO for".split(" ");
const L2 = "growth that runs on AI systems.".split(" ");

/** Seeded so the starfield is the same on every load and never reshuffles on resize. */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  x: number;
  y: number;
  z: number;
  c: number;
  p: number;
}

export default function Hero({ total }: { total: number; stageCount?: number }) {
  const dialogs = useDialogs();
  const motion = useMotionAllowed();
  const heroRef = useRef<HTMLElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gradRef = useRef<HTMLSpanElement | null>(null);
  const [demoStart, setDemoStart] = useState(false);
  // a data-saver visitor does not get a 300 KB app loaded for them unasked
  const saveData = typeof navigator !== "undefined" && !!(navigator as any).connection?.saveData;
  const frameWrap = useRef<HTMLDivElement | null>(null);

  /* gradient flows across the whole second line: each word is offset into one shared gradient */
  useLayoutEffect(() => {
    const g = gradRef.current;
    if (!g) return;
    const measure = () => {
      const words = g.querySelectorAll<HTMLElement>(".g-gw");
      const line = g.getBoundingClientRect();
      words.forEach((w) => {
        const r = w.getBoundingClientRect();
        w.style.setProperty("--gw", `${Math.max(line.width, 1)}px`);
        w.style.setProperty("--gx", `${r.left - line.left}px`);
      });
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(g);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    return () => {
      if (ro) ro.disconnect();
    };
  }, []);

  /* start the demo once the frame is a third in view and the page has finished loading */
  useEffect(() => {
    const el = frameWrap.current;
    if (!el) return;
    let loaded = document.readyState === "complete";
    let seen = false;
    const go = () => {
      if (loaded && seen) setDemoStart(true);
    };
    const onLoad = () => {
      loaded = true;
      go();
    };
    if (!loaded) window.addEventListener("load", onLoad, { once: true });
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          seen = true;
          io.disconnect();
          go();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener("load", onLoad);
    };
  }, []);

  /* Scroll flattens the tilt, the pointer leans it; both are written as one transform on the three elements that move,
     so no custom property sits on the section and re-resolves every descendant on every frame. */
  useEffect(() => {
    const hero = heroRef.current;
    const t = tiltRef.current;
    const cv = canvasRef.current;
    if (!hero || !t || !cv) return;
    const orbs = Array.from(hero.querySelectorAll<HTMLElement>(".g-orb"));
    const ctx = cv.getContext("2d");
    const rnd = mulberry32(7);
    const stars: Star[] = Array.from({ length: 80 }, (_, i) => ({ x: rnd(), y: rnd(), z: rnd() * 0.9 + 0.1, c: i % 7 === 0 ? 1 : i % 3 === 0 ? 0 : 2, p: rnd() * 6 }));
    let W = 0;
    let H = 0;
    let dpr = 1;
    let col = ["#00e5ff", "#ff3df5", "#ffffff"];
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    let flat = motion ? 0 : 1;
    let centre = 0;
    let visible = true;
    let hidden = document.hidden;
    let raf = 0;
    let to = 0;
    let lastDraw = 0;

    const apply = () => {
      if (!motion) return;
      t.style.transform = `rotateX(${(16 * (1 - flat) - py * 3).toFixed(2)}deg) rotateY(${(px * 5 * (1 - flat * 0.6)).toFixed(2)}deg) scale(${(0.93 + 0.07 * flat).toFixed(3)})`;
      const d = [-30, 24];
      orbs.forEach((o, i) => {
        o.style.transform = `translate3d(${(px * d[i] || 0).toFixed(1)}px,${(py * d[i] || 0).toFixed(1)}px,0)`;
      });
    };

    const colors = () => {
      const cs = getComputedStyle(hero);
      col = [cs.getPropertyValue("--color-accent-text").trim(), cs.getPropertyValue("--color-mark").trim(), cs.getPropertyValue("--color-text").trim()];
    };
    const draw = (now: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const narrow = W < 700;
      for (let i = 0; i < stars.length; i += narrow ? 2 : 1) {
        const s = stars[i];
        if (motion) s.p += 0.03;
        const x = s.x * W + px * -24 * s.z;
        const y = s.y * H + py * -14 * s.z;
        ctx.globalAlpha = 0.25 + 0.45 * Math.abs(Math.sin(s.p)) * s.z + 0.1;
        ctx.fillStyle = col[s.c] || "#fff";
        ctx.beginPath();
        ctx.arc(x, y, s.z * 1.5, 0, 6.283);
        ctx.fill();
      }
      lastDraw = now;
    };
    const size = () => {
      if (!ctx) return;
      const w = hero.clientWidth;
      const h = hero.clientHeight;
      if (w === W && Math.abs(h - H) < 60) return; // a phone address bar changes height only: keep the field still
      W = w;
      H = h;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    const tick = (now: number) => {
      raf = 0;
      if (!visible || hidden || document.documentElement.classList.contains("g-modal-open")) return;
      px += (tx - px) * 0.08;
      py += (ty - py) * 0.08;
      const moving = Math.abs(tx - px) > 0.002 || Math.abs(ty - py) > 0.002;
      apply();
      if (moving || now - lastDraw > 120) draw(now);
      if (moving) raf = requestAnimationFrame(tick);
      else to = window.setTimeout(wake, 140); // idle: twinkle at a slow tick instead of 60 frames a second
    };
    const wake = () => {
      window.clearTimeout(to);
      if (!raf && motion) raf = requestAnimationFrame(tick);
    };

    colors();
    size();
    apply();
    const onTheme = () => {
      colors();
      draw(performance.now());
    };
    document.addEventListener("gtm:themechange", onTheme);
    const onPointer = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      wake();
    };
    const onVis = () => {
      hidden = document.hidden;
      if (!hidden) wake();
    };
    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      hero.classList.toggle("g-off", !visible); // CSS pauses the looping animations while the hero is off screen
      if (visible) wake();
    });
    io.observe(hero);
    const ro = new ResizeObserver(size);
    ro.observe(hero);
    const unsub = subscribeScroll({
      measure() {
        // measure the untransformed wrapper so the tilt itself never moves the number
        const w = frameWrap.current || t;
        centre = w.getBoundingClientRect().top + window.scrollY + w.offsetHeight / 2;
      },
      update(y, vh) {
        const c = centre - y;
        const p = motion ? clamp((vh * 0.95 - c) / (vh * 0.45 - 40), 0, 1) : 1;
        if (Math.abs(p - flat) < 0.004) return;
        flat = p;
        apply();
      },
    });
    if (motion) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      wake();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(to);
      unsub();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("gtm:themechange", onTheme);
    };
  }, [motion]);

  return (
    <section className="g-hero" id="home" tabIndex={-1} ref={heroRef} aria-labelledby="g-h1">
      <div className="g-hero-bg" aria-hidden="true">
        <div className="g-orb g-orb--a" />
        <div className="g-orb g-orb--b" />
        <canvas ref={canvasRef} />
      </div>
      <div className="g-wrap">
        <span className="g-status">
          <i />
          {total} systems in the stack
        </span>
        <h1 id="g-h1">
          <span className="g-l1">
            {L1.map((w, i) => (
              <React.Fragment key={i}>
                <span className="g-w" style={{ ["--k" as string]: i } as React.CSSProperties}>
                  {w}
                </span>{" "}
              </React.Fragment>
            ))}
          </span>
          <span className="g-l2" ref={gradRef}>
            {L2.map((w, i) => (
              <React.Fragment key={i}>
                <span className="g-w g-gw" style={{ ["--k" as string]: L1.length + i } as React.CSSProperties}>
                  {w}
                </span>
                {i < L2.length - 1 ? " " : ""}
              </React.Fragment>
            ))}
          </span>
        </h1>
        <p className="g-lede g-lede--center">
          I own the AI and technology behind your go-to-market: the systems that find buyers, answer them fast and prove the spend.
        </p>
        <div className="g-cta-row">
          <MagButton primary bracket onClick={(e) => dialogs.open("book", null, e.currentTarget)}>
            Book a 30-minute call <Arrow />
          </MagButton>
          <MagButton onClick={(e) => dialogs.open("gtmos", null, e.currentTarget)}>See the live demo</MagButton>
        </div>

        <div className="g-persp" ref={frameWrap}>
          <div className="g-tilt3d" ref={tiltRef}>
            <div className="g-layer g-layer--2" />
            <div className="g-layer g-layer--1" />
            <div className="g-float">
              <CockpitFrame variant="inline" start={demoStart} requireClick={!motion || saveData} />
              <span className="g-chip g-fchip g-fchip--1">
                <i />
                Spend proven
              </span>
              <span className="g-chip g-fchip g-fchip--2">
                <i />
                Consent sealed
              </span>
              <span className="g-chip g-fchip g-fchip--3">
                <i />
                Leads answered in seconds
              </span>
            </div>
          </div>
        </div>
        <p className="g-caption">A live demo of the cockpit I run go-to-market from. Fictional company, sample numbers, nothing to install.</p>

      </div>
    </section>
  );
}

/** Button that leans toward the pointer on real hover devices; eased in both directions. */
export function MagButton({
  primary,
  bracket,
  onClick,
  children,
  className,
}: {
  primary?: boolean;
  bracket?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const motion = useMotionAllowed();
  const ref = useRef<HTMLButtonElement | null>(null);
  const can = () => motion && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  return (
    <button
      ref={ref}
      type="button"
      className={["g-btn", primary ? "g-btn--primary" : "g-btn--ghost", bracket ? "g-btn--bracket" : "", className || ""].join(" ").trim()}
      onClick={onClick}
      onPointerEnter={() => {
        if (can()) ref.current?.classList.add("following");
      }}
      onPointerMove={(e) => {
        const b = ref.current;
        if (!b || !can()) return;
        const r = b.getBoundingClientRect();
        b.style.setProperty("--bx", `${((e.clientX - r.left - r.width / 2) * 0.16).toFixed(1)}px`);
        b.style.setProperty("--by", `${((e.clientY - r.top - r.height / 2) * 0.24).toFixed(1)}px`);
      }}
      onPointerLeave={() => {
        const b = ref.current;
        if (!b) return;
        b.classList.remove("following");
        b.style.setProperty("--bx", "0px");
        b.style.setProperty("--by", "0px");
      }}
    >
      {children}
    </button>
  );
}
