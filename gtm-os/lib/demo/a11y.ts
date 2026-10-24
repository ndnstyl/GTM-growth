"use client";

/** Every region that scrolls must be reachable from the keyboard. This marks them as they appear. */
export function watchScrollRegions(): () => void {
  if (typeof document === "undefined") return () => {};
  let timer: number | null = null;
  const mark = () => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("div, section, ul, ol, pre, table"))) {
      if (el.hasAttribute("tabindex") || el.closest("[data-radix-focus-guard]")) continue;
      const cs = getComputedStyle(el);
      const scrolls = (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1);
      if (!scrolls) continue;
      el.tabIndex = 0;
      if (!el.getAttribute("role")) el.setAttribute("role", "region");
      if (!el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) el.setAttribute("aria-label", "Scrollable content");
    }
  };
  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(mark, 400);
  };
  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  schedule();
  return () => { mo.disconnect(); window.removeEventListener("resize", schedule); if (timer) window.clearTimeout(timer); };
}
