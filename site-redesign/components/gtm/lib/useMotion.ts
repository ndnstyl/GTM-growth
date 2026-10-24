import { useEffect, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const STORE = "tin-motion";
const EVENT = "gtm:motion";

function manualOff(): boolean {
  try {
    return localStorage.getItem(STORE) === "off";
  } catch (e) {
    return false;
  }
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener(EVENT, cb);
  };
}
const snapshot = () => !window.matchMedia(QUERY).matches && !manualOff();

/** The visitor's own pause: the same static path reduced motion uses, remembered on this device. */
export function setMotionPaused(paused: boolean) {
  try {
    if (paused) localStorage.setItem(STORE, "off");
    else localStorage.removeItem(STORE);
  } catch (e) {
    /* storage blocked: the pause holds for this page view only */
  }
  window.dispatchEvent(new Event(EVENT));
}
const serverSnapshot = () => true;

/** true when the visitor allows motion. Reacts to the OS setting changing mid-session. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Keeps the `g-motion` class on <html> in step with the preference; CSS keys every animation off it. */
export function useMotionFlag(): boolean {
  const allowed = useMotionAllowed();
  useEffect(() => {
    const r = document.documentElement;
    r.classList.toggle("g-motion", allowed);
    r.classList.add("g-ready");
    return () => {
      r.classList.remove("g-ready");
    };
  }, [allowed]);
  return allowed;
}

/** One media query hook for layout decisions (e.g. the folder scrub only runs on wide screens). */
export function useMediaQuery(query: string, initial = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => initial,
  );
}
