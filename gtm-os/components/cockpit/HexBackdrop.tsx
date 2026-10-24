"use client";

import { useEffect, useRef } from "react";
import { seeded, useActive, useReducedMotion } from "@/lib/motion";

/* The hexFade backdrop the second brain draws, painted across the whole cockpit so the embedded brain is continuous
   with the page, not a window. Two layers with their own depth: the hex field (painted once) and a sparse layer of
   glow points (painted once, seeded) that drifts slowly. The pointer shifts the layers by different amounts
   (parallax), written as two CSS variables with one animation frame per move burst; the CSS does the easing.
   Nothing runs while the demo is off screen, and nothing moves under reduced motion. */

function paintHex(cv: HTMLCanvasElement, W: number, H: number) {
  const DPR = Math.min(devicePixelRatio || 1, 2);
  cv.width = W * DPR;
  cv.height = H * DPR;
  const g = cv.getContext("2d")!;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = "#0b0c1a";
  g.fillRect(0, 0, W, H);
  const hexSize = 20, hS = hexSize * Math.sqrt(3), vS = hexSize * 1.5;
  const cx0 = W / 2, cy0 = H / 2;
  const maxD = Math.sqrt(cx0 * cx0 + cy0 * cy0);
  const k = 0.55;
  for (let row = -1; row < H / vS + 2; row++)
    for (let col = -1; col < W / hS + 2; col++) {
      const hx = col * hS + (row % 2 ? hS / 2 : 0), hy = row * vS;
      const dist = Math.sqrt((hx - cx0) ** 2 + (hy - cy0) ** 2);
      const fade = Math.max(0, 1 - (dist / maxD) * 0.6);
      const alpha = 0.064 * fade * fade * (k * 2);
      if (alpha < 0.005) continue;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = hx + hexSize * Math.cos(a), py = hy + hexSize * Math.sin(a);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.strokeStyle = "rgba(255,255,255," + alpha + ")";
      g.lineWidth = 0.6;
      g.stroke();
    }
  const v = g.createRadialGradient(cx0, cy0, Math.min(W, H) * 0.3, cx0, cy0, Math.max(W, H) * 0.72);
  v.addColorStop(0, "rgba(11,12,26,0)");
  v.addColorStop(1, "rgba(11,12,26,0.5)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

function paintGlow(cv: HTMLCanvasElement, W: number, H: number) {
  const DPR = Math.min(devicePixelRatio || 1, 2);
  cv.width = W * DPR;
  cv.height = H * DPR;
  const g = cv.getContext("2d")!;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, W, H);
  const rand = seeded(7141);
  const n = Math.round((W * H) / 26000);
  for (let i = 0; i < n; i++) {
    const x = rand() * W, y = rand() * H, r = 1 + rand() * 2.2;
    const cyan = rand() > 0.28;
    const rgb = cyan ? "0,229,255" : "255,61,245";
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 7);
    glow.addColorStop(0, `rgba(${rgb},${0.16 + rand() * 0.14})`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = glow;
    g.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
    g.fillStyle = `rgba(${rgb},0.55)`;
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.fill();
  }
}

export function HexBackdrop() {
  const root = useRef<HTMLDivElement>(null);
  const hex = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const active = useActive();

  // paint once, repaint at most once per frame while resizing
  useEffect(() => {
    const a = hex.current, b = glow.current;
    if (!a || !b) return;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const W = innerWidth, H = innerHeight;
      paintHex(a, W, H);
      paintGlow(b, W, H);
    };
    draw();
    const onResize = () => { if (!raf) raf = requestAnimationFrame(draw); };
    addEventListener("resize", onResize);
    return () => { removeEventListener("resize", onResize); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // pointer parallax: event-driven, no loop
  useEffect(() => {
    const el = root.current;
    if (!el || reduced || !active) return;
    let raf = 0, nx = 0, ny = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--px", nx.toFixed(3));
      el.style.setProperty("--py", ny.toFixed(3));
    };
    const move = (e: PointerEvent) => {
      nx = e.clientX / innerWidth - 0.5;
      ny = e.clientY / innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => { removeEventListener("pointermove", move); if (raf) cancelAnimationFrame(raf); };
  }, [reduced, active]);

  return (
    <div ref={root} className="g-bd" aria-hidden="true">
      <canvas ref={hex} className="g-bd-layer g-bd-a" />
      <div className="g-bd-layer g-bd-b"><canvas ref={glow} className="g-bd-drift" /></div>
    </div>
  );
}
