/**
 * One scroll/resize scheduler for the whole page. Every consumer registers a `measure` (reads layout, runs on
 * resize and first paint) and an `update` (writes only, runs once per frame on scroll). That keeps reads and
 * writes in two phases so nothing forces layout inside the frame.
 */
export interface ScrollConsumer {
  measure?: () => void;
  update: (y: number, vh: number) => void;
}

const consumers = new Set<ScrollConsumer>();
let raf = 0;
let attached = false;
let needMeasure = true;

function frame() {
  raf = 0;
  const y = window.scrollY;
  const vh = window.innerHeight;
  if (needMeasure) {
    needMeasure = false;
    consumers.forEach((c) => c.measure && c.measure());
  }
  consumers.forEach((c) => c.update(y, vh));
}
function schedule() {
  if (!raf) raf = requestAnimationFrame(frame);
}
function onResize() {
  needMeasure = true;
  schedule();
}

function attach() {
  if (attached) return;
  attached = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
}
function detach() {
  if (!attached) return;
  attached = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", onResize);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

export function subscribeScroll(c: ScrollConsumer): () => void {
  consumers.add(c);
  attach();
  needMeasure = true;
  schedule();
  return () => {
    consumers.delete(c);
    if (!consumers.size) detach();
  };
}

export function requestMeasure() {
  onResize();
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Document-space top of an element from layout offsets, so CSS transforms on it cannot skew the number. */
export function docTop(el: HTMLElement): number {
  let y = 0;
  let n: HTMLElement | null = el;
  while (n) {
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return y;
}
