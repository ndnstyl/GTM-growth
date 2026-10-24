"use client";

// Client-side area switches. The shell stays mounted, so the DuckDB singleton and every cached feed survive
// a switch; the route slot fades out for 130 ms, the new page rises in for 280 ms (see .g-route in globals.css).
// Same-page links (a different tab hash or board query) never leave the page: they push history and tell the shell.

import { MouseEvent, ReactNode, useCallback, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BASE, withBase } from "@/lib/demo/base";
import { reducedMotionNow } from "./index";

export const NAV_EVENT = "gtm:navigate";
const LEAVE_MS = 130;
const norm = (p: string) => (p.endsWith("/") ? p : p + "/");

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      const u = new URL(withBase(href), window.location.origin);
      if (norm(u.pathname) === norm(window.location.pathname)) {
        window.history.pushState(null, "", u.pathname + u.search + u.hash);
        window.dispatchEvent(new Event(NAV_EVENT));
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        return;
      }
      const go = () => router.push(href.startsWith(BASE) ? href.slice(BASE.length) || "/" : href);
      const slot = document.getElementById("route-slot");
      if (!slot || reducedMotionNow()) {
        go();
        return;
      }
      slot.classList.add("g-route-leaving");
      window.setTimeout(go, LEAVE_MS);
      window.setTimeout(() => slot.classList.remove("g-route-leaving"), 2500);
    },
    [router],
  );
}

type NavLinkProps = Omit<React.ComponentProps<typeof Link>, "href" | "onClick"> & {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
};

/** An internal link that switches area without a document reload. `href` is app-relative, base path added by Next. */
export function NavLink({ href, children, onNavigate, ...rest }: NavLinkProps) {
  const navigate = useNavigate();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate?.();
    navigate(href);
  };
  return (
    <Link href={href} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}

/**
 * A sliding indicator for a row of tabs or links. Put `ref={box}` on a `relative` container whose active child
 * carries data-on="true", and render <span ref={ind} className="g-ind" aria-hidden /> inside it. The bar moves with
 * transform only; the first placement is instant, every later one glides.
 */
export function useSlider<T extends HTMLElement>(dep: string) {
  const box = useRef<T | null>(null);
  const ind = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const c = box.current;
    const i = ind.current;
    if (!c || !i) return;
    const place = () => {
      const a = c.querySelector<HTMLElement>('[data-on="true"]');
      if (!a) {
        i.classList.remove("ready");
        return;
      }
      i.style.transform = `translate3d(${a.offsetLeft}px, 0, 0) scaleX(${a.offsetWidth / 100})`;
      window.requestAnimationFrame(() => i.classList.add("ready"));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(c);
    void document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, [dep]);
  return { box, ind };
}
