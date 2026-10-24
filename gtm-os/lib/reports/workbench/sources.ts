// Declared-source registry v2.
// Every dataset the workbench can touch is DECLARED here: its feeds, its
// join shape, its dimensions, its measures (each with exactly ONE SQL
// definition and an allowedDims grain law), its marker keys, and its drill
// path. Nothing renders that is not declared, and nothing aggregates
// outside pivotSql.ts (enforced by test/singleDefinition.test.ts).

export type FeedRef = {
  name: string; // DuckDB view name after registration
  url: string; // fetch path, e.g. /data/reports/spine_funnel_monthly.parquet
  registration: "explicit"; // all workbench feeds register explicitly [r3 F-M2]
};

export type Dim = { key: string; label: string; expr: string };

export type Measure = {
  key: string;
  label: string;
  expr: string; // the ONE definition 
  kind: "sum" | "count" | "avg" | "derived";
  // TTM-summable [p1-r2 G2]: true only when summing 12 monthly values IS the
  // trailing-twelve-month figure (linear exprs). Ratios (NULLIF divisions)
  // are never additive: a sum of monthly ratios is not a TTM.
  additive?: boolean;
  format: "dollars" | "count" | "pct";
  // grain law [conv C9]: a slice outside this list RENDERS a refusal
  allowedDims: string[];
  // marker keys resolved against the batch state feed [conv C4/F4]
  markers?: string[];
  // expected platform lacks media dollars: the workbench must too, or it
  // becomes a second definition. Honored in markersFor (per-period).
  presenceGated?: boolean;
  // present, single-defined, computable OR withheld-with-reason)
  withheldReason?: string;
};

export type DrillSpec = {
  rowFeed: string; // feed name at row grain
  // fetch path when the row feed does not live flat in /data/reports/
  rowFeedUrl?: string;
  joinKeys: { dimKey: string; rowExpr: string }[];
  reconcile: { measureKey: string; rowExpr: string };
  // record view field enumeration (tier receipt covers exactly these)
  recordFields: { key: string; label: string; tier: "T2" }[];
  recordTitle: string;
};

// the growth lens sources are GENERATED from the metric dictionary, so a
// definition lives in exactly one place. See the nightly job; its
// --check mode is what proves the committed file still matches the dictionary.
import { LENS_SOURCES } from "./sources.lens.generated";
import { DM_SOURCES } from "./sources.dm";

export type DeclaredSource = {
  key: string;
  label: string;
  // "month" for a YYYY-MM key, "week" for an ISO IYYY-Www key (Monday start).
  // Absent means month, which is what every source before this one was.
  periodKind?: "month" | "week";
  // The expression that is true when a row's period has not closed yet. When a source
  // declares it, the compare legs refuse to publish a movement figure for those rows:
  // a month that is six days old against a whole month reads as collapse every time,
  // and the reader has no way to see that from the number alone.
  partialExpr?: string;
  feeds: FeedRef[]; // 1..n [conv C1]
  from: string; // SQL FROM clause over the registered feed views
  dateExpr: string; // castable-to-DATE expression
  dims: Dim[];
  measures: Measure[];
  drill?: DrillSpec;
  drillNote?: string; // honest reason when no drill is declared [sr-T024 M]
  tier: "T2";
  notes?: string;
};

/** FR-014: measure keys that were renamed, old key -> new key.
 *
 * A saved view is someone's saved question. Renaming a measure out from under it would
 * either break the view or, worse, silently drop the measure and leave a view that looks
 * fine and answers less. Both are worse than carrying a rename map, so the map is carried
 * and it is applied before a view is validated, never after.
 *
 * An entry here is permanent. The old key is hidden from every picker so nobody starts
 * using it again, and it resolves for as long as a saved view might still name it.
 */
export const MEASURE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // DEMOS. Two definitions wearing one name is the drift exists to end.
  close_rate: "sale_per_issue",
});

/** Rewrite any renamed measure keys in a saved view's measure list. */
export function applyMeasureAliases(measures: string[]): string[] {
  return measures.map((m) => MEASURE_ALIASES[m] ?? m);
}

export class RegistryError extends Error {}

/** Normalize an expr enough that a renamed key with a divergent definition
 * of the same computation is caught, and cosmetic whitespace is not. */
export function normalizeExpr(expr: string): string {
  return expr.replace(/\s+/g, " ").trim().toLowerCase();
}

export function validateRegistry(sources: DeclaredSource[]): void {
  const exprByMeasureKey = new Map<string, string>();
  const seenSourceKeys = new Set<string>();
  for (const s of sources) {
    if (seenSourceKeys.has(s.key)) throw new RegistryError(`duplicate source key ${s.key}`);
    seenSourceKeys.add(s.key);
    if (!s.feeds.length) throw new RegistryError(`${s.key}: at least one feed required`);
    if (s.tier !== "T2") throw new RegistryError(`${s.key}: tier ceiling is T2 `);
    for (const f of s.feeds) {
      if (f.registration !== "explicit") {
        throw new RegistryError(`${s.key}/${f.name}: workbench feeds register explicitly [r3 F-M2]`);
      }
    }
    const dimKeys = new Set(s.dims.map((d) => d.key));
    // [p1-r2 G-INFO2] the compare outer filter rewrites the period dim expr
    // inside dateExpr by string replacement: refuse a source where that
    // replacement cannot bind, instead of erroring at query time
    const periodDim = s.dims.find((d) => d.key === "period");
    // token-boundary match [p1-r3 W2]: `f.period` inside `f.period_start`
    // must NOT satisfy the guard: the rebind would emit broken SQL
    const periodToken = periodDim
      ? new RegExp(periodDim.expr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9_])")
     : null;
    if (periodDim && periodToken && !periodToken.test(s.dateExpr)) {
      throw new RegistryError(`${s.key}: dateExpr must contain the period dim expr verbatim (compare outer filter rebinds it)`);
    }
    for (const m of s.measures) {
      const norm = normalizeExpr(m.expr);
      const prior = exprByMeasureKey.get(m.key);
      if (prior !== undefined && prior !== norm) {
        throw new RegistryError(
          `measure key '${m.key}' carries TWO definitions: the close_rate class [conv C5]; ` +
            `one definition per key, registry-wide`
        );
      }
      exprByMeasureKey.set(m.key, norm);
      for (const d of m.allowedDims) {
        if (!dimKeys.has(d)) {
          throw new RegistryError(`${s.key}/${m.key}: allowedDims names unknown dim '${d}'`);
        }
      }
    }
    if (s.drill) {
      if (!s.drill.reconcile) throw new RegistryError(`${s.key}: drill requires reconcile`);
      for (const jk of s.drill.joinKeys) {
        if (!dimKeys.has(jk.dimKey)) {
          throw new RegistryError(`${s.key}: drill joinKey names unknown dim '${jk.dimKey}'`);
        }
      }
      for (const f of s.drill.recordFields) {
        if (f.tier !== "T2") throw new RegistryError(`${s.key}: record field ${f.key} above T2`);
      }
    }
  }
}

// Every evaluability dimension is allowed on every review-fraud measure. It is
// one array, not six copies, because the failure mode is a new evaluability
// dimension that is pivotable on one measure and silently absent on the next , 
// which is how a reader ends up looking at a count whose unmeasured share they
// cannot break out.
const RF_CASE_DIMS = [
  "rf_run",
  "rf_subject",
  "rf_case",
  "rf_kind",
  "rf_tier",
  "rf_tier_actionable",
  "rf_triage",
  "rf_coverage",
  "rf_coverage_label",
  "rf_unmeasured_signals",
  "rf_sibling_floor",
  "rf_exonerating",
  "rf_evaluability_reading",
  "rf_branch_reading",
  "rf_locations_complete",
  "rf_ruleset",
  "rf_engine",
  "rf_platforms",
];

const RF_SIGNAL_DIMS = [
  "rf_run",
  "rf_current_run",
  "rf_case",
  "rf_subject",
  "rf_tier",
  "rf_signal",
  "rf_status",
  "rf_strong",
  "rf_unmeasured_strong_flag",
  "rf_gap_kind",
  "rf_not_evaluable_reason",
  "rf_basis",
  "rf_fired",
  "rf_per_reviewer",
  "rf_coverage",
  "rf_coverage_label",
  "rf_ruleset",
];

// ---------------------------------------------------------------------------
// every measure is single-defined; cross-fact ratios live ONLY in the
// spend×funnel preset at PERIOD grain (per-period pre-rollups in `from`
export const SOURCES: DeclaredSource[] = [
  {
    key: "spine_funnel_monthly",
    label: "Revenue and funnel: monthly by market",
    feeds: [{ name: "spine_funnel_monthly", url: "/data/reports/spine_funnel_monthly.parquet", registration: "explicit" }],
    from: "spine_funnel_monthly f",
    dateExpr: "(f.period || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "f.period" },
      { key: "office", label: "Market", expr: "f.office" },
    ],
    measures: [
      { key: "gross", label: "Gross revenue ($)", expr: "SUM(f.gross_cents) / 100.0", kind: "sum", format: "dollars", allowedDims: ["period", "office"], markers: ["method_note"] },
      { key: "net", label: "Net revenue ($)", expr: "SUM(f.net_cents) / 100.0", kind: "sum", format: "dollars", allowedDims: ["period", "office"] },
      { key: "leads", label: "Leads", expr: "SUM(f.leads)", kind: "sum", format: "count", allowedDims: ["period", "office"] },
      { key: "sets", label: "Sets", expr: "SUM(f.sets)", kind: "sum", format: "count", allowedDims: ["period", "office"] },
      { key: "issues", label: "Issues", expr: "SUM(f.issues)", kind: "sum", format: "count", allowedDims: ["period", "office"] },
      { key: "demos", label: "Demos", expr: "SUM(f.demos)", kind: "sum", format: "count", allowedDims: ["period", "office"] },
      { key: "sales", label: "Sales", expr: "SUM(f.sales)", kind: "sum", format: "count", allowedDims: ["period", "office"] },
      { key: "aov", label: "Avg gross per sale ($)", expr: "SUM(f.gross_cents) / 100.0 / NULLIF(SUM(f.sales), 0)", kind: "derived", format: "dollars", allowedDims: ["period", "office"] },
      // close rate is sales over demos and has been since before this
      // key was written. The numbers are unchanged and the label always said what it
      // really was; only the key was lying. Saved views naming the old key are rewritten
      // through MEASURE_ALIASES below rather than breaking.
      { key: "sale_per_issue", label: "Sales per issue (%)", expr: "100.0 * SUM(f.sales) / NULLIF(SUM(f.issues), 0)", kind: "derived", format: "pct", allowedDims: ["period", "office"] },
    ],
    drill: {
      rowFeed: "spine_funnel_rows_daily",
      joinKeys: [
        { dimKey: "period", rowExpr: "substr(r.date, 1, 7)" },
        { dimKey: "office", rowExpr: "r.office" },
      ],
      reconcile: { measureKey: "gross", rowExpr: "SUM(r.gross_cents) / 100.0" },
      recordFields: [
        { key: "date", label: "Day", tier: "T2" },
        { key: "office", label: "Market", tier: "T2" },
        { key: "leads", label: "Leads", tier: "T2" },
        { key: "sets", label: "Sets", tier: "T2" },
        { key: "issues", label: "Issues", tier: "T2" },
        { key: "demos", label: "Demos", tier: "T2" },
        { key: "sales", label: "Sales", tier: "T2" },
        { key: "gross_cents", label: "Gross (¢)", tier: "T2" },
        { key: "net_cents", label: "Net (¢)", tier: "T2" },
      ],
      recordTitle: "date",
    },
    tier: "T2",
  },
  {
    key: "spine_spend_monthly",
    label: "Ad spend: monthly by platform and fee",
    feeds: [{ name: "spine_spend_monthly", url: "/data/reports/spine_spend_monthly.parquet", registration: "explicit" }],
    from: "spine_spend_monthly s",
    dateExpr: "(s.period || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "s.period" },
      { key: "platform", label: "Platform", expr: "s.platform" },
      { key: "source_key", label: "Source", expr: "s.source_key" },
      { key: "row_type", label: "Media vs fee", expr: "s.row_type" },
    ],
    measures: [
      { key: "spend", label: "Spend ($)", expr: "SUM(s.amount_cents) / 100.0", kind: "sum", format: "dollars", allowedDims: ["period", "platform", "source_key", "row_type"], markers: ["platform_presence", "provisional_cost"] },
      { key: "media_spend", label: "Media spend ($)", expr: "SUM(CASE WHEN s.row_type = 'media' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: ["period", "platform", "source_key"], markers: ["platform_presence"] },
      { key: "fees", label: "Fees ($)", expr: "SUM(CASE WHEN s.row_type = 'fee' THEN s.amount_cents ELSE 0 END) / 100.0", kind: "derived", additive: true, format: "dollars", allowedDims: ["period", "platform", "source_key"], markers: ["provisional_cost"] },
    ],
    drill: {
      rowFeed: "spine_spend_rows",
      joinKeys: [
        { dimKey: "period", rowExpr: "r.period" },
        { dimKey: "platform", rowExpr: "r.platform" },
        { dimKey: "source_key", rowExpr: "r.source_key" },
        { dimKey: "row_type", rowExpr: "r.row_type" },
      ],
      reconcile: { measureKey: "spend", rowExpr: "SUM(r.amount_cents) / 100.0" },
      recordFields: [
        { key: "period", label: "Month", tier: "T2" },
        { key: "platform", label: "Platform", tier: "T2" },
        { key: "source_key", label: "Source", tier: "T2" },
        { key: "row_type", label: "Media vs fee", tier: "T2" },
        { key: "fee_seq", label: "Fee line", tier: "T2" },
        { key: "amount_cents", label: "Amount (¢)", tier: "T2" },
        { key: "batch_key", label: "Load", tier: "T2" },
      ],
      recordTitle: "platform",
    },
    tier: "T2",
  },
  {
    key: "spend_funnel_monthly",
    label: "Unit economics: spend and funnel by month, company total",
    feeds: [
      { name: "spine_spend_monthly", url: "/data/reports/spine_spend_monthly.parquet", registration: "explicit" },
      { name: "spine_funnel_monthly", url: "/data/reports/spine_funnel_monthly.parquet", registration: "explicit" },
    ],
    // per-period pre-rollups prevent join fan-out (spend has no office rows;
    // funnel has nine offices: a naive period join multiplies spend x9)
    // reverse) must surface as a row whose ratios are NULL, never vanish
    from:
      "(SELECT period, SUM(amount_cents) AS spend_cents FROM spine_spend_monthly GROUP BY 1) s " +
      "FULL JOIN (SELECT period, SUM(gross_cents) AS gross_cents, SUM(leads) AS leads, SUM(sets) AS sets, " +
      "SUM(issues) AS issues, SUM(sales) AS sales FROM spine_funnel_monthly GROUP BY 1) f " +
      "ON s.period = f.period",
    dateExpr: "(COALESCE(s.period, f.period) || '-01')",
    dims: [{ key: "period", label: "Month", expr: "COALESCE(s.period, f.period)" }],
    measures: [
      { key: "mer", presenceGated: true, label: "MER (spend/revenue %)", expr: "100.0 * SUM(s.spend_cents) / NULLIF(SUM(f.gross_cents), 0)", kind: "derived", format: "pct", allowedDims: ["period"], markers: ["platform_presence", "provisional_cost"] },
      { key: "cost_per_lead", presenceGated: true, label: "Cost per lead ($)", expr: "SUM(s.spend_cents) / 100.0 / NULLIF(SUM(f.leads), 0)", kind: "derived", format: "dollars", allowedDims: ["period"], markers: ["platform_presence", "provisional_cost"] },
      { key: "cost_per_set", presenceGated: true, label: "Cost per set ($)", expr: "SUM(s.spend_cents) / 100.0 / NULLIF(SUM(f.sets), 0)", kind: "derived", format: "dollars", allowedDims: ["period"], markers: ["platform_presence", "provisional_cost"] },
      { key: "cost_per_issue", presenceGated: true, label: "Cost per issued appointment ($)", expr: "SUM(s.spend_cents) / 100.0 / NULLIF(SUM(f.issues), 0)", kind: "derived", format: "dollars", allowedDims: ["period"], markers: ["platform_presence", "provisional_cost"] },
      { key: "cost_per_sale", presenceGated: true, label: "Cost per sale ($)", expr: "SUM(s.spend_cents) / 100.0 / NULLIF(SUM(f.sales), 0)", kind: "derived", format: "dollars", allowedDims: ["period"], markers: ["platform_presence", "provisional_cost"] },
    ],
    tier: "T2",
  },
  // ---- marketing cost marketing cost target (Net revenue per issued appointment x target) + CRM report tie-out ----
  // office domain is wider than dim_office on purpose: COMPANY, UNFILED (no-branch appointments),
  // the eight offices; the tie-out adds ALL (CRM's company pull) and market_sum (the Σ-offices check).
  // universe: rep_assigned (what the CRM report counts) | all_appts (company total incl. no-rep appointments).
  {
    key: "golden_rule_monthly",
    label: "Marketing cost target: Net revenue per issued appointment, ceiling per issued lead, by month and market ",
    feeds: [{ name: "golden_rule__monthly", url: "/data/reports/golden_rule__monthly.parquet", registration: "explicit" }],
    // the feed carries a COMPANY rollup row beside the offices and two universes; a pivot must never sum a rollup
    // rollup row: the company total is the sum of the office rows (UNFILED included), which is what a pivot does anyway.
    from: "(SELECT * FROM golden_rule__monthly WHERE office <> 'COMPANY' AND universe = 'rep_assigned') g",
    dateExpr: "(g.period || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "g.period" },
      { key: "office", label: "Market (Unassigned = no market on the lead)", expr: "g.office" },
      { key: "settle_status", label: "Settle status", expr: "g.settle_status" },
      { key: "trust_flag", label: "Trust flag", expr: "g.trust_flag" },
      { key: "cost_status", label: "Cost status", expr: "g.cost_status" },
      { key: "bonus_tier", label: "Bonus tier (% of net volume)", expr: "COALESCE(g.bonus_tier, 'UNAVAILABLE until cost lands')" },
      { key: "bonus_tier_decidable", label: "Tier decidable (outside the ±0.8% band)", expr: "CASE g.bonus_tier_decidable WHEN 1 THEN 'yes' WHEN 0 THEN 'no: inside the band' ELSE 'n/a' END" },
    ],
    measures: [
      { key: "iss", label: "Issued appts", expr: "SUM(g.iss)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "net_iss", label: "Net issued appts", expr: "SUM(g.net_iss)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "demo", label: "Demos", expr: "SUM(g.demo)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "close_n", label: "Sales", expr: "SUM(g.close_n)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "close_usd", label: "Close (gross $)", expr: "SUM(g.close_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "prenet_usd", label: "Pending net ($)", expr: "SUM(g.prenet_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "cancel_usd", label: "Cancelled ($)", expr: "SUM(g.cancel_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "credit_decl_usd", label: "Credit declined ($)", expr: "SUM(g.credit_decl_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "net_usd", label: "Net sales ($)", expr: "SUM(g.net_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "no_rep_appts", label: "Appointments with no rep", expr: "SUM(g.no_rep_appts)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "sales_without_job", label: "Sales with no job record", expr: "SUM(g.sales_without_job)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "zero_amount_sales", label: "Sales with no dollar amount", expr: "SUM(g.zero_amount_sales)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "nsli", label: "Net revenue per issued appointment ($)", expr: "SUM(g.net_cents) / 100.0 / NULLIF(SUM(g.net_iss), 0)", kind: "derived", format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "nsli_plus_prenet", label: "Net revenue per issued appointment incl. pending net ($)", expr: "(SUM(g.net_cents) + SUM(g.prenet_cents)) / 100.0 / NULLIF(SUM(g.net_iss), 0)", kind: "derived", format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "ceiling_at_target", label: "Cost ceiling per issued lead at target ($)", expr: "(MAX(g.target_pct) / 100.0) * NULLIF(SUM(g.net_cents) + SUM(g.prenet_cents), 0) / 100.0 / NULLIF(SUM(g.net_iss), 0)", kind: "derived", format: "dollars", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "target_pct", label: "Target (%)", expr: "MAX(g.target_pct)", kind: "derived", format: "pct", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "dup_sale_appts", label: "Second-sale appointment on one job (counted once)", expr: "SUM(g.dup_sale_appts)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "mer_traditional", label: "Revenue per marketing dollar (x)", expr: "(SUM(g.net_cents) + SUM(g.prenet_cents)) / NULLIF(SUM(g.cost_per_issued_cents) * 1.0, 0)", kind: "derived", format: "count", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
      { key: "marketing_cost_pct", label: "Marketing cost as a share of net revenue (%)", expr: "100.0 * SUM(g.cost_per_issued_cents) / NULLIF(SUM(g.net_cents) + SUM(g.prenet_cents), 0)", kind: "derived", format: "pct", allowedDims: ["period", "office", "settle_status", "trust_flag", "cost_status", "bonus_tier", "bonus_tier_decidable"] },
    ],
    tier: "T2",
  },
  {
    key: "golden_rule_monthly_all_appts",
    label: "Marketing cost target: company total incl. appointments with no rep (every appointment, with or without a rep)",
    feeds: [{ name: "golden_rule__monthly", url: "/data/reports/golden_rule__monthly.parquet", registration: "explicit" }],
    from: "(SELECT * FROM golden_rule__monthly WHERE office <> 'COMPANY' AND universe = 'all_appts') g",
    dateExpr: "(g.period || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "g.period" },
      { key: "office", label: "Market (Unassigned = no market on the lead)", expr: "g.office" },
      { key: "settle_status", label: "Settle status", expr: "g.settle_status" },
    ],
    measures: [
      { key: "iss", label: "Issued appts (all, incl. no rep)", expr: "SUM(g.iss)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status"] },
      { key: "net_iss", label: "Net issued appts (all)", expr: "SUM(g.net_iss)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status"] },
      { key: "close_n", label: "Sales (all)", expr: "SUM(g.close_n)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status"] },
      { key: "net_usd", label: "Net sales ($, all)", expr: "SUM(g.net_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["period", "office", "settle_status"] },
      { key: "no_rep_appts", label: "Appointments with no rep", expr: "SUM(g.no_rep_appts)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status"] },
      { key: "no_rep_sales", label: "Sales with no rep", expr: "SUM(g.no_rep_sales)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "settle_status"] },
      { key: "nsli_plus_prenet", label: "Net revenue per issued appointment incl. pending net ($, all)", expr: "(SUM(g.net_cents) + SUM(g.prenet_cents)) / 100.0 / NULLIF(SUM(g.net_iss), 0)", kind: "derived", format: "dollars", allowedDims: ["period", "office", "settle_status"] },
    ],
    tier: "T2",
  },
  {
    key: "golden_rule_daily",
    label: "Marketing cost target: daily by market",
    feeds: [{ name: "golden_rule__daily", url: "/data/reports/golden_rule__daily.parquet", registration: "explicit" }],
    from: "(SELECT * FROM golden_rule__daily WHERE office <> 'COMPANY' AND universe = 'rep_assigned') g",
    dateExpr: "g.period",
    dims: [
      { key: "date", label: "Day", expr: "g.period" },
      { key: "month", label: "Month", expr: "substr(g.period, 1, 7)" },
      { key: "office", label: "Market (Unassigned = no market on the lead)", expr: "g.office" },
    ],
    measures: [
      { key: "iss", label: "Issued appts", expr: "SUM(g.iss)", kind: "sum", additive: true, format: "count", allowedDims: ["date", "month", "office"] },
      { key: "net_iss", label: "Net issued appts", expr: "SUM(g.net_iss)", kind: "sum", additive: true, format: "count", allowedDims: ["date", "month", "office"] },
      { key: "close_n", label: "Sales", expr: "SUM(g.close_n)", kind: "sum", additive: true, format: "count", allowedDims: ["date", "month", "office"] },
      { key: "net_usd", label: "Net sales ($)", expr: "SUM(g.net_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["date", "month", "office"] },
      { key: "prenet_usd", label: "Pending net ($)", expr: "SUM(g.prenet_cents) / 100.0", kind: "sum", additive: true, format: "dollars", allowedDims: ["date", "month", "office"] },
      { key: "nsli_plus_prenet", label: "Net revenue per issued appointment incl. pending net ($)", expr: "(SUM(g.net_cents) + SUM(g.prenet_cents)) / 100.0 / NULLIF(SUM(g.net_iss), 0)", kind: "derived", format: "dollars", allowedDims: ["date", "month", "office"] },
      { key: "ceiling_at_target", label: "Cost ceiling per issued lead at target ($)", expr: "(MAX(g.target_pct) / 100.0) * NULLIF(SUM(g.net_cents) + SUM(g.prenet_cents), 0) / 100.0 / NULLIF(SUM(g.net_iss), 0)", kind: "derived", format: "dollars", allowedDims: ["date", "month", "office"] },
    ],
    tier: "T2",
  },
  {
    key: "golden_rule_tieout",
    label: "Marketing cost target matches the CRM, per column",
    feeds: [{ name: "golden_rule__tieout", url: "/data/reports/golden_rule__tieout.parquet", registration: "explicit" }],
    from: "golden_rule__tieout t",
    dateExpr: "(t.period || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "t.period" },
      { key: "office", label: "Market (ALL = company total)", expr: "t.office" },
      { key: "column", label: "Report column", expr: "t.column" },
      { key: "result", label: "Result", expr: "t.result" },
      { key: "residual_id", label: "Residual", expr: "t.residual_id" },
    ],
    measures: [
      { key: "rows", label: "Comparisons", expr: "COUNT(*)", kind: "count", format: "count", allowedDims: ["period", "office", "column", "result", "residual_id"] },
      { key: "fails", label: "FAIL rows", expr: "SUM(CASE WHEN t.result = 'FAIL' THEN 1 ELSE 0 END)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "column", "result", "residual_id"] },
      { key: "residuals", label: "Explained-by-residual rows", expr: "SUM(CASE WHEN t.result = 'PASS_RESIDUAL' THEN 1 ELSE 0 END)", kind: "sum", additive: true, format: "count", allowedDims: ["period", "office", "column", "result", "residual_id"] },
    ],
    tier: "T2",
  },

  // ---- AI inference cost + AI chat accuracy (meter.* views, T2-clean feeds) ----
  {
    key: "meter_cost",
    label: "AI cost: daily by model tier and model",
    feeds: [{ name: "meter_cost_daily", url: "/data/reports/meter_cost_daily.parquet", registration: "explicit" }],
    from: "meter_cost_daily c",
    dateExpr: "c.call_date",
    dims: [
      { key: "call_date", label: "Day", expr: "c.call_date" },
      { key: "lane", label: "Workload", expr: "c.lane" },
      { key: "model", label: "Local model", expr: "c.model" },
      { key: "endpoint_family", label: "Endpoint", expr: "c.endpoint_family" },
      { key: "box_id", label: "Machine", expr: "c.box_id" },
      { key: "complete", label: "Day reconciled", expr: "CASE WHEN c.complete THEN 'complete' ELSE 'incomplete' END" },
    ],
    measures: [
      { key: "cost_calls", label: "Calls", expr: "SUM(c.calls)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_prompt_tokens", label: "Prompt tokens", expr: "SUM(c.prompt_tokens)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_output_tokens", label: "Output tokens", expr: "SUM(c.output_tokens)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_frontier_usd", label: "Cost at vendor list price ($)", expr: "SUM(c.frontier_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_actual_usd", label: "Actual cost to run locally ($)", expr: "SUM(c.actual_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_net_usd", label: "Net savings ($)", expr: "SUM(c.net_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_frontier_all_usd", label: "Vendor list price, every call ($)", expr: "SUM(c.frontier_micro_all) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_excluded_from_net", label: "Calls left out of savings", expr: "SUM(c.excluded_from_net_n)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_proposed_n", label: "Calls priced on draft rates", expr: "SUM(c.proposed_n)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_unmapped_n", label: "Calls with no vendor equivalent", expr: "SUM(c.unmapped_n)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_unpriced_n", label: "Calls with no token counts", expr: "SUM(c.unpriced_n)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_unattributed_n", label: "Calls with no workload tag", expr: "SUM(c.unattributed_n)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_unnamed_n", label: "Calls with no workload tag or client", expr: "SUM(c.unnamed_n)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_errors", label: "Errors", expr: "SUM(c.errors)", kind: "sum", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"], additive: true },
      { key: "cost_tokens_per_call", label: "Tokens per call", expr: "(SUM(c.prompt_tokens) + SUM(c.output_tokens)) * 1.0 / NULLIF(SUM(c.calls), 0)", kind: "derived", format: "count", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"] },
      { key: "cost_unnamed_pct", label: "Share of calls with no workload tag (%)", expr: "100.0 * SUM(c.unattributed_n) / NULLIF(SUM(c.calls), 0)", kind: "derived", format: "pct", allowedDims: ["call_date", "lane", "model", "endpoint_family", "box_id", "complete"] },
    ],
    tier: "T2",
  },
  {
    key: "meter_seat",
    label: "AI seats: daily usage at API prices vs flat fee",
    feeds: [{ name: "meter_seat_daily", url: "/data/reports/meter_seat_daily.parquet", registration: "explicit" }],
    from: "meter_seat_daily s",
    dateExpr: "s.msg_date",
    dims: [
      { key: "msg_date", label: "Day", expr: "s.msg_date" },
      { key: "seat_id", label: "Seat", expr: "s.seat_id" },
      { key: "billing_month", label: "Billing month", expr: "s.billing_month" },
      { key: "pricing_state", label: "Pricing state", expr: "s.pricing_state" },
    ],
    measures: [
      { key: "seat_messages", label: "API messages", expr: "SUM(s.messages)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "billing_month", "pricing_state"], additive: true },
      { key: "seat_session_days", label: "Session-days", expr: "SUM(s.sessions)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "billing_month", "pricing_state"], additive: true },
      { key: "seat_api_equiv_usd", label: "Cost at API prices ($)", expr: "SUM(s.api_equiv_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["msg_date", "seat_id", "billing_month", "pricing_state"], additive: true },
      { key: "seat_fee_usd", label: "Seat fee, per day ($)", expr: "SUM(s.fee_micro_day) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["msg_date", "seat_id", "billing_month", "pricing_state"], additive: true },
      { key: "seat_net_usd", label: "Net ($)", expr: "SUM(s.net_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["msg_date", "seat_id", "billing_month", "pricing_state"], additive: true },
      { key: "seat_proposed_n", label: "Messages priced on unsigned config", expr: "SUM(s.proposed_n)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "billing_month", "pricing_state"], additive: true },
      { key: "seat_unpriced_n", label: "Messages with no price", expr: "SUM(s.unpriced_n)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "billing_month", "pricing_state"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "meter_seat_model",
    label: "AI seats: daily by model and conversation type",
    feeds: [{ name: "meter_seat_model_daily", url: "/data/reports/meter_seat_model_daily.parquet", registration: "explicit" }],
    from: "meter_seat_model_daily sm",
    dateExpr: "sm.msg_date",
    dims: [
      { key: "msg_date", label: "Day", expr: "sm.msg_date" },
      { key: "seat_id", label: "Seat", expr: "sm.seat_id" },
      { key: "model", label: "Model", expr: "sm.model" },
      { key: "transcript_kind", label: "Transcript", expr: "sm.transcript_kind" },
    ],
    measures: [
      { key: "seatm_messages", label: "API messages", expr: "SUM(sm.messages)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "model", "transcript_kind"], additive: true },
      { key: "seatm_input_tokens", label: "Input tokens (uncached)", expr: "SUM(sm.input_tokens)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "model", "transcript_kind"], additive: true },
      { key: "seatm_output_tokens", label: "Output tokens", expr: "SUM(sm.output_tokens)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "model", "transcript_kind"], additive: true },
      { key: "seatm_cache_write_5m", label: "Cache write tokens (5 min)", expr: "SUM(sm.cache_write_5m)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "model", "transcript_kind"], additive: true },
      { key: "seatm_cache_write_1h", label: "Cache write tokens (1 hour)", expr: "SUM(sm.cache_write_1h)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "model", "transcript_kind"], additive: true },
      { key: "seatm_cache_read", label: "Cache read tokens", expr: "SUM(sm.cache_read)", kind: "sum", format: "count", allowedDims: ["msg_date", "seat_id", "model", "transcript_kind"], additive: true },
      { key: "seatm_api_equiv_usd", label: "API-equivalent cost ($)", expr: "SUM(sm.api_equiv_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["msg_date", "seat_id", "model", "transcript_kind"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "meter_workflow",
    label: "AI workflows: tokens per completed workflow",
    feeds: [{ name: "meter_workflow_tokens", url: "/data/reports/meter_workflow_tokens.parquet", registration: "explicit" }],
    from: "meter_workflow_tokens w",
    dateExpr: "w.call_date",
    dims: [
      { key: "call_date", label: "Day", expr: "w.call_date" },
      { key: "workflow_type", label: "Workflow type", expr: "w.workflow_type" },
      { key: "pricing_state", label: "Pricing state", expr: "w.pricing_state" },
      { key: "day_complete", label: "Day reconciled", expr: "CASE WHEN w.day_complete THEN 'complete' ELSE 'incomplete' END" },
    ],
    measures: [
      { key: "wf_workflows", label: "Workflow-days", expr: "COUNT(*)", kind: "count", format: "count", allowedDims: ["call_date", "workflow_type", "pricing_state", "day_complete"] },
      { key: "wf_calls", label: "Calls", expr: "SUM(w.calls)", kind: "sum", format: "count", allowedDims: ["call_date", "workflow_type", "pricing_state", "day_complete"], additive: true },
      { key: "wf_total_tokens", label: "Total tokens", expr: "SUM(w.total_tokens)", kind: "sum", format: "count", allowedDims: ["call_date", "workflow_type", "pricing_state", "day_complete"], additive: true },
      { key: "wf_tokens_per_workflow", label: "Tokens per completed workflow-day", expr: "SUM(w.total_tokens) * 1.0 / NULLIF(COUNT(*), 0)", kind: "derived", format: "count", allowedDims: ["call_date", "workflow_type", "pricing_state", "day_complete"] },
      { key: "wf_calls_without_counts", label: "Calls without token counts", expr: "SUM(w.calls_without_counts)", kind: "sum", format: "count", allowedDims: ["call_date", "workflow_type", "pricing_state", "day_complete"], additive: true },
      { key: "wf_frontier_usd", label: "Vendor list price ($)", expr: "SUM(w.frontier_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["call_date", "workflow_type", "pricing_state", "day_complete"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "meter_tier_mix",
    label: "AI model mix: calls and tokens by local model, per day",
    feeds: [{ name: "meter_tier_mix_daily", url: "/data/reports/meter_tier_mix_daily.parquet", registration: "explicit" }],
    from: "meter_tier_mix_daily t",
    dateExpr: "t.call_date",
    dims: [
      { key: "call_date", label: "Day", expr: "t.call_date" },
      { key: "model", label: "Local model", expr: "t.model" },
      { key: "day_complete", label: "Day reconciled", expr: "CASE WHEN t.day_complete THEN 'complete' ELSE 'incomplete' END" },
    ],
    measures: [
      { key: "tier_calls", label: "Calls", expr: "SUM(t.calls)", kind: "sum", format: "count", allowedDims: ["call_date", "model", "day_complete"], additive: true },
      { key: "tier_tokens", label: "Tokens", expr: "SUM(t.tokens)", kind: "sum", format: "count", allowedDims: ["call_date", "model", "day_complete"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "meter_completeness",
    label: "AI usage completeness: counted calls vs the server's log",
    feeds: [{ name: "meter_completeness", url: "/data/reports/meter_completeness.parquet", registration: "explicit" }],
    from: "meter_completeness r",
    dateExpr: "r.recon_date",
    dims: [
      { key: "recon_date", label: "Day", expr: "r.recon_date" },
      { key: "box_id", label: "Machine", expr: "r.box_id" },
      { key: "complete", label: "Complete", expr: "CASE WHEN r.complete THEN 'complete' ELSE 'incomplete' END" },
    ],
    measures: [
      { key: "comp_days", label: "Days", expr: "COUNT(*)", kind: "count", format: "count", allowedDims: ["recon_date", "box_id", "complete"] },
      { key: "comp_server_requests", label: "Server requests (local request log)", expr: "SUM(r.server_requests)", kind: "sum", format: "count", allowedDims: ["recon_date", "box_id", "complete"], additive: true },
      { key: "comp_meter_rows", label: "Meter rows (door)", expr: "SUM(r.meter_rows)", kind: "sum", format: "count", allowedDims: ["recon_date", "box_id", "complete"], additive: true },
      { key: "comp_difference", label: "Difference (server minus counted)", expr: "SUM(r.difference)", kind: "sum", format: "count", allowedDims: ["recon_date", "box_id", "complete"], additive: true },
      { key: "comp_tdd_fail_n", label: "Matrix FAIL rows", expr: "SUM(r.tdd_fail_n)", kind: "sum", format: "count", allowedDims: ["recon_date", "box_id", "complete"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "meter_questions",
    label: "AI chat: questions asked and how they were answered",
    feeds: [{ name: "meter_question_daily", url: "/data/reports/meter_question_daily.parquet", registration: "explicit" }],
    from: "meter_question_daily q",
    dateExpr: "q.q_date",
    dims: [
      { key: "q_date", label: "Day", expr: "q.q_date" },
      { key: "seat_role", label: "Seat role", expr: "q.seat_role" },
      { key: "intent", label: "Intent", expr: "q.intent" },
    ],
    measures: [
      { key: "q_asked", label: "Asked", expr: "SUM(q.asked)", kind: "sum", format: "count", allowedDims: ["q_date", "seat_role", "intent"], additive: true },
      { key: "q_answered", label: "Answered (answer, documents, timeline)", expr: "SUM(q.answered)", kind: "sum", format: "count", allowedDims: ["q_date", "seat_role", "intent"], additive: true },
      { key: "q_refused", label: "Refused (no answer, unsupported)", expr: "SUM(q.refused)", kind: "sum", format: "count", allowedDims: ["q_date", "seat_role", "intent"], additive: true },
      { key: "q_deflected", label: "Deflected to a number surface", expr: "SUM(q.deflected)", kind: "sum", format: "count", allowedDims: ["q_date", "seat_role", "intent"], additive: true },
      { key: "q_errored", label: "Errored or abandoned", expr: "SUM(q.errored)", kind: "sum", format: "count", allowedDims: ["q_date", "seat_role", "intent"], additive: true },
      { key: "q_other_n", label: "Other kinds", expr: "SUM(q.other_n)", kind: "sum", format: "count", allowedDims: ["q_date", "seat_role", "intent"], additive: true },
      { key: "q_deflect_overrides", label: "Deflect overrides", expr: "SUM(q.deflect_overrides)", kind: "sum", format: "count", allowedDims: ["q_date", "seat_role", "intent"], additive: true },
      { key: "q_answer_rate", label: "Answer rate (%)", expr: "100.0 * SUM(q.answered) / NULLIF(SUM(q.asked), 0)", kind: "derived", format: "pct", allowedDims: ["q_date", "seat_role", "intent"] },
    ],
    tier: "T2",
  },
  {
    key: "meter_accuracy",
    label: "AI chat: graded accuracy (latest human verdict per question)",
    feeds: [{ name: "meter_accuracy_period", url: "/data/reports/meter_accuracy_period.parquet", registration: "explicit" }],
    from: "(SELECT * FROM meter_accuracy_period WHERE grain = 'day') a",
    dateExpr: "a.period",
    dims: [
      { key: "period", label: "Day", expr: "a.period" },
      { key: "seat_role", label: "Seat role", expr: "a.seat_role" },
      { key: "intent", label: "Intent", expr: "a.intent" },
    ],
    measures: [
      { key: "acc_gradeable_n", label: "Gradeable replies", expr: "SUM(a.gradeable_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_graded_n", label: "Graded", expr: "SUM(a.graded_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_ungraded_n", label: "Ungraded", expr: "SUM(a.ungraded_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_re_verify_n", label: "Re-checked (earlier right answer withdrawn)", expr: "SUM(a.re_verify_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_right_n", label: "Right", expr: "SUM(a.right_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_wrong_source_n", label: "Wrong source", expr: "SUM(a.wrong_source_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_better_source_n", label: "Better source", expr: "SUM(a.better_source_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_wrong_tool_n", label: "Wrong tool", expr: "SUM(a.wrong_tool_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_unfaithful_n", label: "Unfaithful", expr: "SUM(a.unfaithful_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_stale_n", label: "Stale", expr: "SUM(a.stale_n)", kind: "sum", format: "count", allowedDims: ["period", "seat_role", "intent"], additive: true },
      { key: "acc_graded_accuracy_pct", label: "Graded accuracy (%) = right / graded", expr: "100.0 * SUM(a.right_n) / NULLIF(SUM(a.graded_n), 0)", kind: "derived", format: "pct", allowedDims: ["period", "seat_role", "intent"] },
      { key: "acc_routing_accuracy_pct", label: "Routing accuracy (%)", expr: "100.0 * (1 - SUM(a.wrong_tool_n) * 1.0 / NULLIF(SUM(a.graded_n), 0))", kind: "derived", format: "pct", allowedDims: ["period", "seat_role", "intent"] },
      { key: "acc_stale_pct", label: "Stale rate (%)", expr: "100.0 * SUM(a.stale_n) / NULLIF(SUM(a.graded_n), 0)", kind: "derived", format: "pct", allowedDims: ["period", "seat_role", "intent"] },
    ],
    tier: "T2",
  },
  {
    key: "meter_faithfulness",
    label: "AI chat: checker faithfulness (validated nights only)",
    feeds: [{ name: "meter_faithfulness_period", url: "/data/reports/meter_faithfulness_period.parquet", registration: "explicit" }],
    from: "(SELECT * FROM meter_faithfulness_period WHERE grain = 'day') f",
    dateExpr: "f.period",
    dims: [
      { key: "period", label: "Day", expr: "f.period" },
    ],
    measures: [
      { key: "faith_checked_n", label: "Checked (validated)", expr: "SUM(f.checked_n)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "faith_supported_n", label: "Supported", expr: "SUM(f.supported_n)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "faith_unfaithful_n", label: "Unfaithful", expr: "SUM(f.unfaithful_n)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "faith_unverified_n", label: "Unverified", expr: "SUM(f.unverified_n)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "faith_excluded_unvalidated_n", label: "Excluded (night failed calibration)", expr: "SUM(f.excluded_unvalidated_n)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "faith_no_record_n", label: "Labels with no loaded question", expr: "SUM(f.no_record_n)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "faith_faithfulness_pct", label: "Faithfulness (%) = supported / checked", expr: "100.0 * SUM(f.supported_n) / NULLIF(SUM(f.checked_n), 0)", kind: "derived", format: "pct", allowedDims: ["period"] },
    ],
    tier: "T2",
  },
  {
    key: "meter_latency",
    label: "AI chat: response time per stage vs the 3.5 second budget",
    feeds: [{ name: "meter_latency_period", url: "/data/reports/meter_latency_period.parquet", registration: "explicit" }],
    from: "(SELECT * FROM meter_latency_period WHERE grain = 'day') l",
    dateExpr: "l.period",
    dims: [
      { key: "period", label: "Day", expr: "l.period" },
      { key: "intent", label: "Intent", expr: "l.intent" },
    ],
    measures: [
      { key: "lat_n", label: "Questions", expr: "SUM(l.n)", kind: "sum", format: "count", allowedDims: ["period", "intent"], additive: true },
      { key: "lat_retrieval_p50", label: "Retrieval p50 (ms, avg of daily p50)", expr: "AVG(l.retrieval_p50)", kind: "avg", format: "count", allowedDims: ["period", "intent"] },
      { key: "lat_retrieval_p95", label: "Retrieval p95 (ms, avg of daily p95)", expr: "AVG(l.retrieval_p95)", kind: "avg", format: "count", allowedDims: ["period", "intent"] },
      { key: "lat_first_token_p50", label: "First token p50 (ms)", expr: "AVG(l.first_token_p50)", kind: "avg", format: "count", allowedDims: ["period", "intent"] },
      { key: "lat_complete_p50", label: "Complete p50 (ms)", expr: "AVG(l.complete_p50)", kind: "avg", format: "count", allowedDims: ["period", "intent"] },
      { key: "lat_complete_p95", label: "Complete p95 (ms)", expr: "AVG(l.complete_p95)", kind: "avg", format: "count", allowedDims: ["period", "intent"] },
      { key: "lat_retrieval_budget_p50", label: "Retrieval budget p50 (ms)", expr: "MAX(l.retrieval_budget_p50)", kind: "avg", format: "count", allowedDims: ["period", "intent"] },
      { key: "lat_complete_budget_p50", label: "Complete budget p50 (ms)", expr: "MAX(l.complete_budget_p50)", kind: "avg", format: "count", allowedDims: ["period", "intent"] },
    ],
    tier: "T2",
  },
  {
    key: "meter_learning",
    label: "AI chat: learning loop history (nightly)",
    feeds: [{ name: "meter_learning_history", url: "/data/reports/meter_learning_history.parquet", registration: "explicit" }],
    from: "meter_learning_history h",
    dateExpr: "h.run_date",
    dims: [
      { key: "run_date", label: "Night", expr: "h.run_date" },
      { key: "outcome", label: "Outcome", expr: "h.outcome" },
      { key: "checker_status", label: "Checker", expr: "h.checker_status" },
    ],
    measures: [
      { key: "learn_runs", label: "Nightly runs", expr: "COUNT(*)", kind: "count", format: "count", allowedDims: ["run_date", "outcome", "checker_status"] },
      { key: "learn_improve_n", label: "Slices improved", expr: "SUM(h.improve_n)", kind: "sum", format: "count", allowedDims: ["run_date", "outcome", "checker_status"], additive: true },
      { key: "learn_hold_n", label: "Slices held", expr: "SUM(h.hold_n)", kind: "sum", format: "count", allowedDims: ["run_date", "outcome", "checker_status"], additive: true },
      { key: "learn_regress_n", label: "Slices regressed", expr: "SUM(h.regress_n)", kind: "sum", format: "count", allowedDims: ["run_date", "outcome", "checker_status"], additive: true },
      { key: "learn_rollback_n", label: "Rollbacks", expr: "SUM(h.rollback_n)", kind: "sum", format: "count", allowedDims: ["run_date", "outcome", "checker_status"], additive: true },
      { key: "learn_labels_checker", label: "Checker labels used", expr: "SUM(h.labels_checker)", kind: "sum", format: "count", allowedDims: ["run_date", "outcome", "checker_status"], additive: true },
      { key: "learn_gaps_new", label: "New gaps", expr: "SUM(h.gaps_new)", kind: "sum", format: "count", allowedDims: ["run_date", "outcome", "checker_status"], additive: true },
      { key: "learn_gaps_closed", label: "Gaps closed", expr: "SUM(h.gaps_closed)", kind: "sum", format: "count", allowedDims: ["run_date", "outcome", "checker_status"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "meter_gaps",
    label: "AI chat: corpus gaps by month",
    feeds: [{ name: "meter_gaps_period", url: "/data/reports/meter_gaps_period.parquet", registration: "explicit" }],
    from: "meter_gaps_period g",
    dateExpr: "(g.period || '-01')",
    dims: [
      { key: "period", label: "Month", expr: "g.period" },
    ],
    measures: [
      { key: "gap_open_at_end", label: "Open at month end", expr: "SUM(g.open_at_end)", kind: "derived", format: "count", allowedDims: ["period"] },
      { key: "gap_opened", label: "Opened", expr: "SUM(g.opened)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "gap_closed", label: "Closed", expr: "SUM(g.closed)", kind: "sum", format: "count", allowedDims: ["period"], additive: true },
      { key: "gap_median_days_to_close", label: "Median days to close (avg of monthly medians)", expr: "AVG(g.median_days_to_close)", kind: "avg", format: "count", allowedDims: ["period"] },
    ],
    tier: "T2",
  },
  {
    key: "work_runs_daily",
    label: "Work ledger: runs by type, routine and day",
    feeds: [{ name: "work_runs_daily", url: "/data/reports/work_runs_daily.parquet", registration: "explicit" }],
    from: "work_runs_daily w",
    dateExpr: "w.run_day",
    dims: [
      { key: "run_day", label: "Day", expr: "w.run_day" },
      { key: "box_id", label: "Machine", expr: "w.box_id" },
      { key: "unit_class", label: "Run type", expr: "w.unit_class" },
      { key: "routine_id", label: "Routine", expr: "w.routine_id" },
    ],
    measures: [
      { key: "work_runs", label: "Runs", expr: "SUM(w.runs)", kind: "sum", format: "count", allowedDims: ["run_day", "box_id", "unit_class", "routine_id"], additive: true },
      { key: "work_success_n", label: "Success", expr: "SUM(w.success_n)", kind: "sum", format: "count", allowedDims: ["run_day", "box_id", "unit_class", "routine_id"], additive: true },
      { key: "work_failed_n", label: "Failed", expr: "SUM(w.failed_n)", kind: "sum", format: "count", allowedDims: ["run_day", "box_id", "unit_class", "routine_id"], additive: true },
      { key: "work_unknown_end_n", label: "Unknown end (never reported an end)", expr: "SUM(w.unknown_end_n)", kind: "sum", format: "count", allowedDims: ["run_day", "box_id", "unit_class", "routine_id"], additive: true },
      { key: "work_duration_ms_sum", label: "Duration (ms, leaf runs)", expr: "SUM(w.duration_ms_sum)", kind: "sum", format: "count", allowedDims: ["run_day", "box_id", "unit_class", "routine_id"], additive: true },
      { key: "work_tokens_prompt_sum", label: "Prompt tokens", expr: "SUM(w.tokens_prompt_sum)", kind: "sum", format: "count", allowedDims: ["run_day", "box_id", "unit_class", "routine_id"], additive: true },
      { key: "work_tokens_output_sum", label: "Output tokens", expr: "SUM(w.tokens_output_sum)", kind: "sum", format: "count", allowedDims: ["run_day", "box_id", "unit_class", "routine_id"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "work_class_period",
    label: "Work ledger: runs by type, weekly and monthly",
    feeds: [{ name: "work_class_period", url: "/data/reports/work_class_period.parquet", registration: "explicit" }],
    // sr-us4.md H6: the feed carries day + week + month rows for the same
    // period (additive: true measures with no grain pin sum all three,
    // 3x the true figure). Pinned the same way meter's own multi-grain
    // sources are (lines above, meter_accuracy_period et al.).
    from: "(SELECT * FROM work_class_period WHERE grain = 'day') w",
    dateExpr: "w.period",
    dims: [
      { key: "wc_period", label: "Period", expr: "w.period" },
      { key: "wc_grain", label: "Period type", expr: "w.grain" },
      { key: "wc_box_id", label: "Machine", expr: "w.box_id" },
      { key: "wc_unit_class", label: "Run type", expr: "w.unit_class" },
    ],
    measures: [
      { key: "wc_runs", label: "Runs", expr: "SUM(w.runs)", kind: "sum", format: "count", allowedDims: ["wc_period", "wc_grain", "wc_box_id", "wc_unit_class"], additive: true },
      { key: "wc_success_n", label: "Success", expr: "SUM(w.success_n)", kind: "sum", format: "count", allowedDims: ["wc_period", "wc_grain", "wc_box_id", "wc_unit_class"], additive: true },
      { key: "wc_failed_n", label: "Failed", expr: "SUM(w.failed_n)", kind: "sum", format: "count", allowedDims: ["wc_period", "wc_grain", "wc_box_id", "wc_unit_class"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "work_savings",
    label: "Work ledger: hours saved, valued, against what it cost",
    feeds: [{ name: "work_savings_period", url: "/data/reports/work_savings_period.parquet", registration: "explicit" }],
    // sr-us4.md H6: same day/week/month stacking as work_class_period, for
    // DOLLARS. The shipped view already filters period_type = 'month', an
    // ad-hoc pivot off this source does not; pinned at the source.
    from: "(SELECT * FROM work_savings_period WHERE period_type = 'month') w",
    dateExpr: "w.period_start",
    dims: [
      { key: "ws_period_start", label: "Period", expr: "w.period_start" },
      { key: "ws_period_type", label: "Period type", expr: "w.period_type" },
      { key: "ws_box_id", label: "Machine", expr: "w.box_id" },
    ],
    measures: [
      { key: "ws_counterfactual_usd", label: "Cost if done by hand ($)", expr: "SUM(w.counterfactual_usd_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["ws_period_start", "ws_period_type", "ws_box_id"], additive: true },
      { key: "ws_actual_usd", label: "Actual $", expr: "SUM(w.actual_usd_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["ws_period_start", "ws_period_type", "ws_box_id"], additive: true },
      { key: "ws_net_usd", label: "Net $", expr: "SUM(w.net_usd_micro) / 1000000.0", kind: "sum", format: "dollars", allowedDims: ["ws_period_start", "ws_period_type", "ws_box_id"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "work_census",
    label: "Work ledger: checks against the run list",
    feeds: [{ name: "work_census_period", url: "/data/reports/work_census_period.parquet", registration: "explicit" }],
    from: "work_census_period w",
    dateExpr: "w.window_start",
    dims: [
      { key: "wcn_window_start", label: "Window start", expr: "w.window_start" },
      // sr-us4.md H8: without window_end, two fact_census rows sharing
      // (unit_class, window_start) but different window_end are
      // indistinguishable to a grouped pivot, so SUM merges two windows
      // into a number describing no window that exists (or, worse, sums a
      // live 0/0/0 row with a NULL row into a fabricated passing tie).
      { key: "wcn_window_end", label: "Window end", expr: "w.window_end" },
      { key: "wcn_box_id", label: "Machine", expr: "w.box_id" },
      { key: "wcn_unit_class", label: "Run type", expr: "w.unit_class" },
    ],
    measures: [
      { key: "wcn_census_count", label: "Census count (second record)", expr: "SUM(w.census_count)", kind: "sum", format: "count", allowedDims: ["wcn_window_start", "wcn_window_end", "wcn_box_id", "wcn_unit_class"], additive: true },
      { key: "wcn_leaf_run_count", label: "Ledger leaf-run count", expr: "SUM(w.leaf_run_count)", kind: "sum", format: "count", allowedDims: ["wcn_window_start", "wcn_window_end", "wcn_box_id", "wcn_unit_class"], additive: true },
      { key: "wcn_difference", label: "Difference (run list minus ledger)", expr: "SUM(w.difference)", kind: "sum", format: "count", allowedDims: ["wcn_window_start", "wcn_window_end", "wcn_box_id", "wcn_unit_class"], additive: true },
    ],
    tier: "T2",
  },
  {
    key: "work_matrix",
    label: "Work ledger: checks by period",
    feeds: [{ name: "work_matrix_period", url: "/data/reports/work_matrix_period.parquet", registration: "explicit" }],
    from: "work_matrix_period w",
    dateExpr: "w.period_start",
    dims: [
      { key: "wm_period_start", label: "Period", expr: "w.period_start" },
      { key: "wm_box_id", label: "Machine", expr: "w.box_id" },
      { key: "wm_stage", label: "Stage", expr: "w.stage" },
      { key: "wm_result", label: "Result", expr: "w.result" },
    ],
    measures: [
      { key: "wm_rows", label: "Matrix rows", expr: "COUNT(*)", kind: "count", format: "count", allowedDims: ["wm_period_start", "wm_box_id", "wm_stage", "wm_result"] },
      { key: "wm_fail_n", label: "FAIL/UNVERIFIED/NOT_BUILT/HALTED rows", expr: "SUM(CASE WHEN w.result <> 'PASS' THEN 1 ELSE 0 END)", kind: "sum", additive: true, format: "count", allowedDims: ["wm_period_start", "wm_box_id", "wm_stage", "wm_result"] },
    ],
    tier: "T2",
  },
];

// Appended rather than interleaved: the hand-written sources above are edited by people,
// the lens sources are regenerated from the dictionary, and keeping the two apart is what
// stops a regeneration from stepping on a hand edit.
SOURCES.push(...LENS_SOURCES);
// the Digital Marketing board's four sources (spend by owner and market, source
// chain, comparison windows, pacing) live in sources.dm.ts, a data file like the lens one,
// and join the one registry here so validateRegistry's single-definition law covers them.
SOURCES.push(...DM_SOURCES);


export function findSource(key: string): DeclaredSource | undefined {
  return SOURCES.find((s) => s.key === key);
}
