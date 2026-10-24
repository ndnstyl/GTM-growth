import { withBase } from "./base";

const cache = new Map<string, Promise<unknown>>();
const nativeFetch: typeof fetch | null = typeof window !== "undefined" ? window.fetch.bind(window) : null;

export function fixture<T>(url: string): Promise<T | null> {
  const hit = cache.get(url);
  if (hit) return hit as Promise<T | null>;
  const f = nativeFetch ?? fetch;
  const p = f(withBase(url), { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);
  cache.set(url, p);
  return p;
}
