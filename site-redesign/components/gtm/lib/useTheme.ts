import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const KEY = "tin-theme";
const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.getAttribute("data-gtm-theme") === "light" ? "light" : "dark";
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Dark is the brand default; light is an opt-in toggle stored on this device only. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const toggle = useCallback(() => {
    const next: Theme = read() === "light" ? "dark" : "light";
    if (next === "light") document.documentElement.setAttribute("data-gtm-theme", "light");
    else document.documentElement.removeAttribute("data-gtm-theme");
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {
      /* private mode: the choice lasts for this page view only, which is the honest behaviour */
    }
    listeners.forEach((l) => l());
    document.dispatchEvent(new Event("gtm:themechange"));
  }, []);
  return [theme, toggle];
}
