"use client";
import { useEffect, useState } from "react";
import { fixture } from "./fixtures";

export function useFixture<T>(url: string): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: true });
  useEffect(() => {
    let live = true;
    fixture<T>(url).then((d) => { if (live) setState({ data: d, loading: false }); });
    return () => { live = false; };
  }, [url]);
  return state;
}

export function useHashTab<K extends string>(keys: readonly K[], fallback: K): [K, (k: K) => void] {
  const [tab, setTab] = useState<K>(fallback);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#/, "") as K;
      if ((keys as readonly string[]).includes(h)) setTab(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (k: K) => {
    setTab(k);
    history.replaceState(null, "", `${window.location.pathname}#${k}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  return [tab, set];
}
