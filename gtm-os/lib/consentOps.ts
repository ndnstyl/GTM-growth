//
// The panel reads ONE centrally rendered artifact, /data/consent_ops.json, written by
// the nightly job on the host that holds the consent store. It never reads the store or a
// carry no names, but it holds person-level stop history recorded to a the CRM prospect id, and one CRM search on that
// id returns the person. It is served by the consent host's loopback server only. This module re-checks the one thing a
// browser can check cheaply and refuses to draw an artifact that carries a contact value.
//
// header counts the true total of open rows, not the rows listed.
//
// Every failure is a named error the panel prints in place: missing, unreachable, unreadable, wrong schema, unmasked.
// A stale artifact is still drawn, under a named stale error, because yesterday's queue beats a blank one as long as it
// says it is yesterday's.

export type Severity = "critical" | "warning";
export type QueueItem = {
  kind: "failed_job" | "spool" | "failed_dispatch" | "ambiguous_stop" | "pending_booking" | string;
  severity: Severity; state?: string; age_s: number | null; at?: string | null;
  owner: string; owner_basis?: "named" | "default";
  what: string; contact?: string; person_ref?: string | null; prospect_id?: string | null;
  job?: string; lane?: string; channel?: string; status?: string; source_lane?: string;
  candidate_id?: number; request_id?: number; held?: number | null; revokes_held?: number | null;
};
export type Section = { state: "ok" | "not_built" | "unread" | "unreadable"; count: number | null; shown: number;
                        owner?: string; why?: string; capped?: boolean; cap?: number; kept?: "newest"; jobs_read?: string[] };
export type TimelineEntry = { at: string; kind: string; what: string; lane: string | null; channel: string | null; contact: string };
export type Person = { ref: string; prospect_ids: string[]; contacts: string[]; last_at: string | null;
                       entries_total: number; entries_shown: number; timeline: TimelineEntry[] };
export type ConsentOps = {
  schema: "consent_ops/1"; generated_at: string; stale_after_s: number; tier: string;
  source: { store: string; database: string; transaction: string; owners_version: string; owners_signed_by: string | null };
  exceptions: { counts: Record<string, number>; sections: Record<string, Section>; items: QueueItem[] };
  timeline: { window_days: number; contact_points_in_window: number; contact_points_cap: number; persons_shown: number;
              entries_cap: number; basis: string; shared_person_keys_split: number };
  persons: Person[];
};
export type Read =
  | { ok: true; art: ConsentOps; stale: string | null; notBuilt: string[]; capped: string[]; openTotal: number; ageS: number }
  | { ok: false; error: string };

export const ARTIFACT_URL = "/data/consent_ops.json";
const WHO = "the consent operator artifact (" + ARTIFACT_URL + ")";

export function fmtAgeS(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "age unknown";
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const SECTION_NAME: Record<string, string> = {
  failed_job: "failed jobs", spool: "capture spool", failed_dispatch: "failed dispatches",
  ambiguous_stop: "ambiguous stops", pending_booking: "pending bookings",
};

/** status 0 = the fetch itself failed (host down, network). raw null = no body. */
export function readConsentOps(status: number, raw: string | null, now: Date): Read {
  if (status === 0) return { ok: false, error: `${WHO} could not be fetched: the data service did not answer` };
  if (status === 404) return { ok: false, error: `${WHO} is missing (HTTP 404): the renderer has not written it on this host, or it refused; run the consent operator surface renderer and read its error` };
  if (status !== 200) return { ok: false, error: `${WHO} answered HTTP ${status}` };
  if (raw == null || raw.trim() === "") return { ok: false, error: `${WHO} is empty` };
  // Defense in depth. The renderer's T2 guard refuses these before writing; a browser that finds one anyway draws nothing.
  if (raw.includes("@") || /\+\d{7,}/.test(raw))
    return { ok: false, error: `${WHO} failed the T2 check (it carries what reads as a contact value); not drawn. Re-render it and read the renderer's guard` };
  let art: ConsentOps;
  try { art = JSON.parse(raw) as ConsentOps; }
  catch { return { ok: false, error: `${WHO} is unreadable (not JSON)` }; }
  if (!art || art.schema !== "consent_ops/1")
    return { ok: false, error: `${WHO} has schema ${JSON.stringify(art?.schema ?? null)}; this panel reads consent_ops/1` };
  if (!art.exceptions || !Array.isArray(art.exceptions.items) || !art.exceptions.sections || !Array.isArray(art.persons))
    return { ok: false, error: `${WHO} is missing its exception queue or its persons; not drawn` };
  const gen = Date.parse(art.generated_at);
  if (!Number.isFinite(gen)) return { ok: false, error: `${WHO} carries no readable generated_at` };
  const rawAge = Math.floor((now.getTime() - gen) / 1000);
  const ageS = Math.max(0, rawAge);
  const limit = Number.isFinite(art.stale_after_s) && art.stale_after_s > 0 ? art.stale_after_s : 900;
  const stale = rawAge < -120
    ? `${WHO} is stamped ${fmtAgeS(-rawAge)} in the future: the renderer's clock and this browser's disagree, so its age cannot be read. Treat every row below as unverified`
    : ageS > limit
    ? `${WHO} is stale: rendered ${fmtAgeS(ageS)} ago, the limit is ${fmtAgeS(limit)}. Every row below is as of then; the renderer has stopped or is refusing`
    : null;
  const notBuilt = Object.entries(art.exceptions.sections)
    .filter(([, s]) => s.state !== "ok")
    .map(([k, s]) => `${SECTION_NAME[k] ?? k}: ${s.state.replace("_", " ")}${s.why ? ` (${s.why})` : ""}${s.owner ? `, owner ${s.owner}` : ""}`);
  // C-1: a section whose total exceeds what it lists is named in words, whether or not the renderer set `capped`.
  const capped = Object.entries(art.exceptions.sections)
    .filter(([, s]) => typeof s.count === "number" && s.count > s.shown)
    .map(([k, s]) => `${SECTION_NAME[k] ?? k}: showing ${s.shown} of ${s.count}${s.kept === "newest" ? ", the newest" : ""}; ${(s.count as number) - s.shown} more are open and not listed here`);
  const openTotal = Object.values(art.exceptions.sections)
    .reduce((n, s) => n + (typeof s.count === "number" ? s.count : 0), 0);
  return { ok: true, art, stale, notBuilt, capped, openTotal, ageS };
}

export type Row = { key: string; kind: string; section: string; critical: boolean; age: string; owner: string;
                    ownerDefault: boolean; label: string; what: string; personRef: string | null };

export function queueRows(art: ConsentOps): Row[] {
  const rows = art.exceptions.items.map((x, i): Row => {
    const who = [x.contact, x.prospect_id ? `prospect id ${x.prospect_id}` : null].filter(Boolean).join(" · ");
    const head = x.what;
    return {
      key: `${x.kind}:${x.candidate_id ?? x.request_id ?? x.job ?? i}`,
      kind: x.kind, section: SECTION_NAME[x.kind] ?? x.kind,
      critical: x.severity === "critical", age: fmtAgeS(x.age_s), owner: x.owner || "Unassigned",
      ownerDefault: x.owner_basis === "default",
      label: who ? `${head} · ${who}` : head, what: x.what, personRef: x.person_ref ?? null,
    };
  });
  // critical first; the artifact already orders each band oldest first, and the sort is stable
  return rows.sort((a, b) => Number(b.critical) - Number(a.critical));
}

/** EVERY person matching a person ref (P001, valid inside this artifact only), a prospect id, or the last four of a
 *  first match silently is the wrong-person failure. Empty when nothing matches. */
export function personsByQuery(art: ConsentOps, q: string): Person[] {
  const s = q.trim().replace(/^…/, "");
  if (!s) return [];
  const byRef = art.persons.filter((p) => p.ref.toLowerCase() === s.toLowerCase());
  if (byRef.length) return byRef;
  const byPid = art.persons.filter((p) => p.prospect_ids.includes(s));
  if (byPid.length) return byPid;
  return art.persons.filter((p) => p.contacts.some((c) => c.endsWith(`…${s}`)));
}
