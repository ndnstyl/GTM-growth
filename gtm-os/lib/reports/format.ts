// One place for money/percent/count/number-coercion formatting (audit A27).
// Every tab used to carry its own copy of these, each with a different null
// token ("", "unavailable", "n/a", "withheld") and a different input unit
// (cents vs dollars); the absent-number rendering now agrees everywhere.
export const UNAVAILABLE = "unavailable";

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const s = v.replace(/^"+|"+$/g, "").trim();
    // Number("") and Number("  ") both coerce to 0 (a
    // finite number), so an empty/whitespace string used to render as a
    // silent 0 instead of the UNAVAILABLE token the old local helpers gave a
    // non-numeric string via NaN. Empty/whitespace is non-numeric, not zero.
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v as number);
  return Number.isFinite(n) ? n : null;
}

// Coerces DuckDB-WASM cell values (number, bigint, quoted string) to a
// number; never null, defaults to 0. Matches the three identical local
// copies this replaces (LeadMap, Organic, PaidMedia).
export function asNumber(v: unknown): number {
  return toNumber(v) ?? 0;
}

// cents -> dollars, e.g. spend_cents, gross_mtd stored in cents.
export function moneyCents(v: unknown): string {
  const n = toNumber(v);
  return n === null ? UNAVAILABLE : `$${(n / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// v already in dollars.
export function moneyDollars(v: unknown): string {
  const n = toNumber(v);
  return n === null ? UNAVAILABLE : `$${Math.round(n).toLocaleString()}`;
}

// v is a fraction (0-1); renders as a percent.
export function pct(v: unknown, digits = 1): string {
  const n = toNumber(v);
  return n === null ? UNAVAILABLE : `${(n * 100).toFixed(digits)}%`;
}

// Plain count, comma-grouped.
export function count(v: unknown): string {
  const n = toNumber(v);
  return n === null ? UNAVAILABLE : n.toLocaleString();
}
