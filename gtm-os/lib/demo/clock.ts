// One client-side date shift for the whole demo. The data ends on a fixed day; the viewer's clock does not.
// Every `new Date()` and `Date.now()` in the app reads as the data's present (its build day, read from
// meta.json), so report presets, "yesterday", freshness banners and fixture dates (media events, due dates)
// always agree and always read fresh. `realNow()` is the escape hatch for the visible wall clock.
const RealDate = Date;

export const realNow = (): number => RealDate.now();

function anchorDay(): string | null {
  try {
    const x = new XMLHttpRequest();
    x.open("GET", "/gtm-os/data/meta.json", false);
    x.send();
    if (x.status !== 200) return null;
    const j = JSON.parse(x.responseText) as { built_at?: string; today?: string };
    const s = j.built_at ?? j.today;
    return s ? s.slice(0, 10) : null;
  } catch {
    return null;
  }
}

export function installClock(): void {
  if (typeof window === "undefined") return;
  const day = anchorDay();
  if (!day) return;
  const [y, m, d] = day.split("-").map(Number);
  // The app's "now" is always the data's own day, late evening (23:00 to midnight), so no fixture timestamp
  // is ever in the future and nothing ages: today = the data's build day, yesterday = its last data day.
  const base = new RealDate(y, m - 1, d, 23, 0, 0).getTime();
  const shifted = (): number => base + (RealDate.now() % 3_600_000);
  class ShiftedDate extends RealDate {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(shifted());
      else super(...(a as [number]));
    }
    static now(): number {
      return shifted();
    }
  }
  window.Date = ShiftedDate as unknown as DateConstructor;
}
