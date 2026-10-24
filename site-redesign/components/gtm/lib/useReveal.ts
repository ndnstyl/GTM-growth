import { useEffect, useRef } from "react";

let io: IntersectionObserver | null = null;
function observer(): IntersectionObserver {
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          io && io.unobserve(e.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
  }
  return io;
}

/** Adds `in` once the element scrolls into view. CSS only hides `.g-rv` after hydration and with motion on. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = observer();
    o.observe(el);
    return () => o.unobserve(el);
  }, []);
  return ref;
}

/** Toggles `on` on an element only while it is on screen, so looping animations stop when scrolled away. */
export function useInView<T extends HTMLElement>(margin = "80px") {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver((es) => el.classList.toggle("on", es[0].isIntersecting), { rootMargin: margin });
    o.observe(el);
    return () => o.disconnect();
  }, [margin]);
  return ref;
}
