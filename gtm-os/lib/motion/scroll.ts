// The demo runs inside a host page. Nothing here may scroll the host: only containers this app owns scroll.
// `scrollWithin` brings an element into view inside its nearest scrolling ancestor and never touches the page.

function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
    p = p.parentElement;
  }
  return null;
}

export function scrollWithin(el: HTMLElement | null | undefined, smooth = false): void {
  if (!el) return;
  const box = scrollParent(el);
  if (!box) return;
  const a = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (a.top >= b.top && a.bottom <= b.bottom) return;
  const delta = a.top < b.top ? a.top - b.top : a.bottom - b.bottom;
  box.scrollTo({ top: box.scrollTop + delta, behavior: smooth ? "smooth" : "auto" });
}

/** Centre the active item inside a horizontally scrolling strip, touching only that strip. */
export function centreInStrip(strip: HTMLElement | null, item: HTMLElement | null): void {
  if (!strip || !item) return;
  const target = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
  strip.scrollLeft = Math.max(0, target);
}
