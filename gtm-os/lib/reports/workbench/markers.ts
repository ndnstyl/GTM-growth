// Markers: the honesty
// state attached to a number, resolved PER PERIOD from the batch's state
// presence is WITHHELD: the same refusal the functions make, from
// the same state, so the workbench can never render a number the database

export type Marker = {
  kind:
    | "provisional"
    | "partial"
    | "withheld"
    | "mtd"
    | "stale"
    | "method-note"
    // P0. The trust file answers the four questions every number owes a reader:
    // what produced it, whether it was verified and when, where it can skew, and how old
    // it is. These kinds are how those answers reach a cell.
    | "data-through"   // pinned, always shown: the day this feed's data runs to
    | "hold"           // the publisher is holding this feed; the number is not current
    | "skew"           // a named, registered way this number can mislead
    | "proposed"       // the definition behind it is unsigned
    | "coverage"       // the lens does not reach this measure, or not for this period
    | "crossfoot";     // this period's lenses do not agree on the company total
  reason: string;
  effectiveDate?: string;
};

/** `the data`, one entry per published feed.
 *
 * The strip and the cells read this. A feed absent from it is a feed nobody has written
 * anything down about, which is not the same as a feed in good standing, so the reader
 * of this type has to decide which it is rather than defaulting. */
export type FeedTrust = {
  data_through?: string | null;
  status?: string | null;
  registered?: boolean;
  verdict?: string | null;
  verdict_date?: string | null;
  review_cadence_days?: string | number | null;
  holds?: { kind?: string; state?: string; why?: string | null }[];
  skews?: string[];
  settlement?: { pattern?: string; settlement_days?: number | null; reason?: string } | null;
  lens_read?: boolean;
};

export type TrustFile = {
  generated_at?: string;
  feeds: Record<string, FeedTrust>;
};

export type EffectiveDateEntry = {
  source: string;
  date: string;
  what: string;
  ruling: "ruled" | "open";
};

export type BatchState = {
  batch_id: string;
  as_of: string;
  platforms_expected: string[];
  platforms_reporting_by_period: Record<string, string[]>;
  cost_definition_ruled: boolean;
  months: { period: string; status: "open" | "closed" }[];
  effective_dates: EffectiveDateEntry[];
  current_period: string;
};

export type MeasureMeta = {
  markers?: string[];
  presenceGated?: boolean;
  /** the database deliberately does not publish this measure, and why. */
  withheldReason?: string;
};

/** Missing platforms for one period; a NULL period (an aggregate spanning
 * periods, or a slice without the period dim) fails CLOSED: presence must be
 * complete in EVERY known period, and an empty map is never complete. */
export function missingPlatforms(
  period: string | null | undefined,
  state: BatchState
): string[] {
  const byPeriod = state.platforms_reporting_by_period ?? {};
  const expected = state.platforms_expected ?? [];
  const missingFor = (p: string) =>
    expected.filter((x) => !(byPeriod[p] ?? []).includes(x));
  if (period) return missingFor(period);
  const periods = Object.keys(byPeriod);
  if (!periods.length) return [...expected];
  const union = new Set<string>();
  for (const p of periods) for (const m of missingFor(p)) union.add(m);
  return [...union];
}

// A NULL state fails CLOSED for presence-gated measures [p1-r3]: if the batch
// state feed did not load, presence cannot be verified, so the number withholds
//: the one path where the whole withhold architecture otherwise failed OPEN.
/** P0: the four answers a number owes its reader, turned into markers.
 *
 * `feedKey` is the declared source's feed name; `trust` is the parsed trust file. A feed
 * the trust file does not mention gets a marker SAYING so. That is the whole point: the
 * previous state of this surface was that nothing read the file at all, so every number
 * rendered with no age on it and no way to tell a verified feed from an unexamined one.
 *
 * Nothing here fails silent. A missing trust file, a missing feed and a held feed each
 * produce a different, named marker.
 */
export function trustMarkers(
  feedKey: string | null | undefined,
  trust: TrustFile | null,
  measure?: MeasureMeta
): Marker[] {
  const out: Marker[] = [];

  // The definition's own standing travels with the measure, not with the feed.
  if (measure?.withheldReason) {
    out.push({ kind: "withheld", reason: measure.withheldReason });
  }
  if ((measure?.markers ?? []).includes("proposed")) {
    out.push({
      kind: "proposed",
      reason:
        "proposed definition, unsigned. Only the metric owner rules a definition; until he does this " +
        "renders with this caveat and never feeds a projection.",
    });
  }

  if (!trust) {
    out.push({
      kind: "stale",
      reason:
        "no trust file loaded, so this number cannot say how old it is or whether anyone " +
        "has verified it. Absence of the file is not evidence the number is current.",
    });
    return out;
  }
  if (!feedKey) {
    out.push({
      kind: "stale",
      reason: "this measure names no feed, so its age cannot be looked up.",
    });
    return out;
  }
  const feed = trust.feeds?.[feedKey];
  if (!feed) {
    out.push({
      kind: "stale",
      reason:
        `the trust file carries no entry for '${feedKey}', so nothing is written down ` +
        "about where this number came from or when it was last checked.",
    });
    return out;
  }

  // Pinned and always shown: how old the number is.
  out.push({
    kind: "data-through",
    reason: feed.data_through
      ? `data through ${feed.data_through}`
      : "this feed's entry carries no data-through day",
    effectiveDate: feed.data_through ?? undefined,
  });

  for (const hold of feed.holds ?? []) {
    out.push({
      kind: "hold",
      reason:
        `held: ${hold.state ?? "unknown state"}` +
        (hold.why ? ` (${hold.why})` : "") +
        ". The last good file is still being served; this is not today's number.",
    });
  }

  if (!feed.registered) {
    out.push({
      kind: "skew",
      reason:
        "this feed has no lineage entry, so nobody has written down its path, its skews " +
        "or its delays.",
    });
  } else if ((feed.verdict ?? "").toUpperCase() !== "VERIFIED") {
    out.push({
      kind: "skew",
      reason:
        `accuracy verdict: ${feed.verdict ?? "none recorded"}. A feed nobody has tied out ` +
        "is not a feed anyone has shown to be wrong; it is one nobody has checked.",
    });
  }

  if ((feed.skews ?? []).length) {
    out.push({
      kind: "skew",
      reason: `known skews on this feed: ${(feed.skews ?? []).join(", ")}`,
    });
  }

  if (feed.settlement?.pattern === "full_history_rewrite") {
    out.push({
      kind: "skew",
      reason:
        "this feed's whole published history is replaced on most build days, so a number " +
        "read today can change tomorrow without anything being wrong. Compare two " +
        "readings by their as-of day.",
    });
  }

  return out;
}

/** the row's own cross-foot and coverage state, which live on the feed row
 * rather than in the trust file because they are per period, not per feed. */
export function rowStateMarkers(row: {
  crossfoot_ok?: boolean | null;
  coverage_state?: string | null;
  partial?: boolean | null;
  still_accruing?: boolean | null;
}): Marker[] {
  const out: Marker[] = [];
  if (row.crossfoot_ok === false) {
    out.push({
      kind: "crossfoot",
      reason:
        "the lenses do not agree on the company total for this period. Two lenses " +
        "disagreeing on one number is a defect, so the movement figure is withheld and " +
        "both totals are named.",
    });
  } else if (row.crossfoot_ok === null || row.crossfoot_ok === undefined) {
    // NULL is NOT ok. It means the tie-out did not cover this period.
    out.push({
      kind: "crossfoot",
      reason: "the tie-out has not checked this period. Not checked is not the same as passed.",
    });
  }
  const coverage = row.coverage_state ?? null;
  if (coverage && coverage !== "full") {
    out.push({ kind: "coverage", reason: `coverage: ${coverage}` });
  }
  if (row.partial) {
    out.push({
      kind: "partial",
      reason: "this period has not closed, so it carries no movement figure.",
    });
  }
  if (row.still_accruing) {
    out.push({
      kind: "partial",
      reason:
        "measures on the entry clock are still filling in for this period; the number " +
        "will grow after today.",
    });
  }
  return out;
}

export function markersFor(
  measure: MeasureMeta | undefined,
  cellDims: Record<string, string | null>,
  state: BatchState | null
): Marker[] {
  if (!state) {
    if (measure?.presenceGated) {
      return [{ kind: "withheld", reason: "batch state unavailable: platform presence cannot be verified; fails closed" }];
    }
    return [];
  }
  const out: Marker[] = [];
  const keys = measure?.markers ?? [];
  const period = cellDims["period"] ?? null;
  const missing = missingPlatforms(period, state);

  // presence-gated: the WITHHELD path: same refusal as the spine [B1/B2]
  if (measure?.presenceGated && missing.length) {
    out.push({
      kind: "withheld",
      reason:
        `withheld: spend is partial for ${period ?? "the sliced periods"} ` +
        `(missing: ${missing.join(", ")}); the database refuses this measure ` +
        "under partial presence and so does the workbench",
    });
  } else if (keys.includes("platform_presence") && missing.length) {
    out.push({ kind: "partial", reason: `spend partial: missing: ${missing.join(", ")}` });
  }

  if (keys.includes("provisional_cost") && !state.cost_definition_ruled) {
    out.push;
  }
  if (keys.includes("method_note")) {
    for (const e of state.effective_dates ?? []) {
      out.push({
        kind: "method-note",
        reason:
          e.ruling === "open"
            ? `OPEN RULING: ${e.what} (candidate date ${e.date}, ${e.source})`
            : `${e.what} effective ${e.date} (${e.source})`,
        effectiveDate: e.date,
      });
    }
  }
  if (period && period === state.current_period) {
    out.push({ kind: "mtd", reason: "month-to-date: partial month" });
  }
  return out;
}

/** Aggregate inheritance [conv R4 + r2 R-H6]: the UNION of member markers,
 * and if ANY member is withheld the aggregate itself becomes a REFUSAL. */
export function inheritMarkers(members: Marker[][]): {
  markers: Marker[];
  refused: Marker | null;
} {
  const seen = new Map<string, Marker>();
  let refused: Marker | null = null;
  for (const set of members) {
    for (const m of set) {
      seen.set(`${m.kind}:${m.reason}`, m);
      if (m.kind === "withheld" && !refused) {
        refused = {
          kind: "withheld",
          reason: `an aggregate over a withheld member is not assertable: member reason: ${m.reason}`,
        };
      }
    }
  }
  return { markers: [...seen.values()], refused };
}

export function staleHours(asOf: string): number | null {
  const t = Date.parse(asOf);
  return Number.isNaN(t) ? null : (Date.now() - t) / 3_600_000;
}
