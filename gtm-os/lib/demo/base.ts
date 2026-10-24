export const BASE = "/gtm-os";

export function withBase(p: string): string {
  if (!p.startsWith("/") || p.startsWith("//")) return p;
  if (p === BASE || p.startsWith(BASE + "/")) return p;
  return BASE + p;
}

export function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const s = store();
    const raw = s ? s.getItem("gtm-os:" + key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem("gtm-os:" + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
