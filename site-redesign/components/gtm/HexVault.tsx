import React, { useEffect, useRef } from "react";
import { useMotionAllowed } from "./lib/useMotion";

const W = 51.96; // tile width of the static lattice (pointy-top hexes, radius 30); the field itself is CSS
const H = 90;
const R = 30;
const SIZE = 480;

/**
 * The hex field is a static, repeating CSS mask: the browser draws it once. The only thing this component draws is a
 * small glow, a 480 px canvas that follows the pointer and lights the few cells around it (lifted, cyan). It redraws
 * only while the pointer moves inside the zone, stops the moment it is still, does nothing on touch or under reduced
 * motion, and does nothing while the zone is off screen. Decoration: aria-hidden, pointer-events none.
 */
export default function HexVault() {
  const motion = useMotionAllowed();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cvRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const cv = cvRef.current;
    if (!host || !cv || !motion) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = 1;
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    let visible = false;
    let raf = 0;
    let idle = 0;
    let px = 0;
    let py = 0;
    let col = "0,229,255";
    const rgb = () => {
      const v = getComputedStyle(host).getPropertyValue("--color-accent-text").trim();
      const m = v.match(/^#([0-9a-f]{6})$/i);
      col = m ? `${parseInt(m[1].slice(0, 2), 16)},${parseInt(m[1].slice(2, 4), 16)},${parseInt(m[1].slice(4, 6), 16)}` : col;
    };
    rgb();
    const hex = (x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const X = x + r * Math.cos(a);
        const Y = y + r * Math.sin(a);
        if (k) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
      }
      ctx.closePath();
    };
    const draw = () => {
      raf = 0;
      // the canvas sits on a whole number of tiles, so its lattice lines up with the CSS one
      const ox = Math.floor((px - SIZE / 2) / W) * W;
      const oy = Math.floor((py - SIZE / 2) / H) * H;
      cv.style.transform = `translate3d(${ox}px,${oy}px,0)`;
      ctx.clearRect(0, 0, SIZE, SIZE);
      const lx = px - ox;
      const ly = py - oy;
      const cells = Math.ceil(SIZE / W) + 1;
      const rows = Math.ceil(SIZE / H) + 1;
      for (let j = -1; j <= rows; j++) {
        for (let i = -1; i <= cells; i++) {
          for (const [cx, cy] of [
            [W / 2 + W * i, R + H * j],
            [W * i, 75 + H * j],
          ]) {
            const d = Math.hypot(cx - lx, cy - ly);
            const near = Math.max(0, 1 - d / 150);
            if (near < 0.02) continue;
            hex(cx, cy - near * 5, R * 0.9);
            ctx.fillStyle = `rgba(${col},${0.02 + near * 0.16})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${col},${0.12 + near * 0.6})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!visible || e.pointerType === "touch") return;
      const r = host.getBoundingClientRect();
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      if (py < -60 || py > r.height + 60) return;
      cv.classList.add("on");
      if (!raf) raf = requestAnimationFrame(draw);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => cv.classList.remove("on"), 1600);
    };
    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (!visible) cv.classList.remove("on");
    });
    io.observe(host);
    window.addEventListener("pointermove", onMove, { passive: true });
    const onTheme = () => rgb();
    document.addEventListener("gtm:themechange", onTheme);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("gtm:themechange", onTheme);
    };
  }, [motion]);

  return (
    <div className="g-vault" ref={hostRef} aria-hidden="true">
      <div className="g-vault-field" />
      <canvas ref={cvRef} className="g-vault-glow" />
    </div>
  );
}
