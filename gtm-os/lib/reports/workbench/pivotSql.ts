// A view becomes a FIXED set of DuckDB statements: an optional column-domain
// probe, then one grouped statement whose GROUPING SETS carry cell rows, row
// subtotals, column subtotals, and the grand total (DuckDB-WASM's PIVOT
// clause silently drops grouping-set subtotals [conv F1], so the client lays
// the cross-tab out from these tuples and NEVER adds numbers).
// compare.modes adds prior-year and TTM-pair legs computed IN SQL (deltas,
// guarded percentages, new-revenue split): layout is presentation, math is
// here.

import type { DeclaredSource, Measure } from "./sources";

export type ViewFilter = { dimKey: string; op: "=" | "in"; values: string[] };

export type ViewSlice = {
  sourceKey: string;
  rows: string[]; // dim keys
  cols: string[]; // 0..1 dim keys in v1
  measures: string[]; // measure keys
  filters: ViewFilter[];
  dateWhere?: string; // SQL fragment from the date-preset helper (or absent)
  compare?: {
    modes: ("prior_year" | "ttm_pair")[];
    pairPctWithDollars: true;
    newRevenueSplit?: boolean;
    varianceFlag?: boolean;
  };
};

export type Statement = { id: string; sql: string };

export type PivotPlan = {
  statements: Statement[];
  // layout metadata (which output columns are dims/measures/compare legs)
  rowDims: string[];
  colDim: string | null;
  measureKeys: string[];
  compareColumns: string[];
  refusedMeasures: { key: string; reason: string }[]; // grain-law refusals [conv C9]
};

export class PivotBuildError extends Error {}

function q(s: string): string {
  return s.replace(/'/g, "''");
}

function dimExpr(source: DeclaredSource, key: string): string {
  const d = source.dims.find((x) => x.key === key);
  if (!d) throw new PivotBuildError(`unknown dim '${key}' on ${source.key}`);
  return d.expr;
}

function measure(source: DeclaredSource, key: string): Measure {
  const m = source.measures.find((x) => x.key === key);
  if (!m) throw new PivotBuildError(`unknown measure '${key}' on ${source.key}`);
  return m;
}

function whereClause(source: DeclaredSource, slice: ViewSlice): string {
  const parts: string[] = [];
  for (const f of slice.filters) {
    const expr = dimExpr(source, f.dimKey);
    if (f.op === "=") parts.push(`${expr} = '${q(f.values[0])}'`);
    else parts.push(`${expr} IN (${f.values.map((v) => `'${q(v)}'`).join(", ")})`);
  }
  if (slice.dateWhere) parts.push(`(${slice.dateWhere})`);
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

/** Grain law [conv C9]: a measure sliced by a dim outside its allowedDims is
 * REFUSED (returned in refusedMeasures for the renderer), never fabricated. */
function splitByGrain(
  source: DeclaredSource,
  slice: ViewSlice
): { allowed: Measure[]; refused: { key: string; reason: string }[] } {
  const sliceDims = [...slice.rows, ...slice.cols];
  const allowed: Measure[] = [];
  const refused: { key: string; reason: string }[] = [];
  for (const key of slice.measures) {
    const m = measure(source, key);
    if (m.withheldReason) {
      refused.push({ key, reason: m.withheldReason });
      continue;
    }
    const bad = sliceDims.filter((d) => !m.allowedDims.includes(d));
    if (bad.length) {
      refused.push({
        key,
        reason: `'${m.label}' is not recorded at ${bad.join("/")} grain: ` +
          `slicing it there would fabricate an allocation`,
      });
    } else {
      allowed.push(m);
    }
  }
  return { allowed, refused };
}

function groupingSets(rowExprs: string[], colExpr: string | null): string {
  const all = colExpr ? [...rowExprs, colExpr] : rowExprs;
  const sets: string[] = [];
  if (all.length) sets.push(`(${all.join(", ")})`); // cells
  if (colExpr && rowExprs.length) sets.push(`(${rowExprs.join(", ")})`); // row subtotals
  if (colExpr) sets.push(`(${colExpr})`); // column subtotals
  sets.push(`()`); // grand total
  return `GROUPING SETS (${sets.join(", ")})`;
}

// Relabel a period one year forward, so the prior year's row lands on the current
// period's label and the two can be joined. Pure string math, because the bundled WASM
//
// because it looks month-specific. A month key is 'YYYY-MM' and an ISO week key is
// 'IYYY-Www'. Both carry a four-digit year in the first four characters followed by a
// suffix that identifies the period within the year, so incrementing the leading year and
// keeping the suffix gives '2025-09' -> '2026-09' and '2025-W39' -> '2026-W39'. For weeks
// that is the ISO rule the spec asks for: match by ISO week number, not by date offset,
// because 52 weeks before a Monday is a different Monday in a 53-week year.
const PERIOD_PLUS_ONE_YEAR = (periodExpr: string) =>
  `(CAST(CAST(substr(${periodExpr}, 1, 4) AS INTEGER) + 1 AS VARCHAR) || substr(${periodExpr}, 5))`;

// which of its rows are still open, every delta column for those rows is NULL and the
// surface shows the partial marker instead. A number is not published and then explained;
// it is not published.
const guardPartial = (source: DeclaredSource, expr: string) =>
  source.partialExpr
    ? `CASE WHEN COALESCE(cur.__partial, FALSE) THEN NULL ELSE ${expr} END`
    : expr;

/** Drill statements live HERE because they contain aggregation SQL: the
 * single-definition lint rightly refused them anywhere else. */
export function buildDrillStatements(
  rowFeed: string,
  recordFieldKeys: string[],
  reconcileRowExpr: string,
  where: { rowExpr: string; value: string }[],
  // range/IN predicates carried down from the VIEW's date preset and filters
  extra: { rowExpr: string; op: ">=" | "in"; values: string[] }[] = []
): { rowsSql: string; reconcileSql: string } {
  const parts = [
    ...where.map((w) => `${w.rowExpr} = '${q(w.value)}'`),
    ...extra.map((e) =>
      e.op === ">="
        ? `${e.rowExpr} >= '${q(e.values[0])}'`
        : `${e.rowExpr} IN (${e.values.map((v) => `'${q(v)}'`).join(", ")})`
    ),
  ];
  const whereSql = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  const fields = recordFieldKeys.map((k) => `r.${k}`).join(", ");
  return {
    rowsSql: `SELECT ${fields} FROM ${rowFeed} r ${whereSql} ORDER BY 1`,
    reconcileSql: `SELECT ${reconcileRowExpr} AS actual, COUNT(*) AS n FROM ${rowFeed} r ${whereSql}`,
  };
}

/** Batch pinning by VALUE [sr-T024 B3]: every feed carries an
 * export_batch_id column; the drill compares the two feeds' stamps, not
 * their names against a manifest that always lists everything. */
export function buildBatchCheck(aggFeed: string, rowFeed: string): { id: string; sql: string } {
  return {
    id: "batch-check",
    sql:
      `SELECT (SELECT export_batch_id FROM ${aggFeed} LIMIT 1) AS agg_batch, ` +
      `(SELECT export_batch_id FROM ${rowFeed} LIMIT 1) AS row_batch`,
  };
}

/** Date-preset SQL (the one home for SQL construction). */
// rejects date_trunc(VARCHAR, DATE) AND date_trunc(VARCHAR, TIMESTAMP) , 
// overloads the python engine accepts: so date windows are emitted as
// LITERAL month boundaries computed at build time. Same semantics, zero
// engine-specific function surface.
export function monthStartLiteral(monthsBack: number): string {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
}
export function monthKeyLiteral(monthsBack: number): string {
  return monthStartLiteral(monthsBack).slice(0, 7);
}

export function periodFloorFor(preset: "all" | "last_13" | "last_25" | undefined): string | undefined {
  if (!preset || preset === "all") return undefined;
  return monthKeyLiteral(preset === "last_13" ? 13 : 25);
}

export function dateWhereFor(
  preset: "all" | "last_13" | "last_25" | undefined,
  dateExpr: string
): string | undefined {
  if (!preset || preset === "all") return undefined;
  const months = preset === "last_13" ? 13 : 25;
  return `TRY_CAST(${dateExpr} AS DATE) >= DATE '${monthStartLiteral(months)}'`;
}

export function buildPivot(source: DeclaredSource, slice: ViewSlice): PivotPlan {
  if (slice.cols.length > 1) throw new PivotBuildError("v1 supports at most one column dim");
  const { allowed, refused } = splitByGrain(source, slice);

  const rowExprs = slice.rows.map((k) => dimExpr(source, k));
  const colExpr = slice.cols.length ? dimExpr(source, slice.cols[0]) : null;
  const where = whereClause(source, slice);

  const selectDims = [
    ...slice.rows.map((k, i) => `${rowExprs[i]} AS ${k}`),
    ...(colExpr ? [`${colExpr} AS ${slice.cols[0]}`] : []),
  ];
  const groupingTags = [
    ...slice.rows.map((k, i) => `GROUPING(${rowExprs[i]}) AS __g_${k}`),
    ...(colExpr ? [`GROUPING(${colExpr}) AS __g_${slice.cols[0]}`] : []),
  ];
  const selectMeasures = allowed.map((m) => `${m.expr} AS ${m.key}`);

  const statements: Statement[] = [];

  if (colExpr) {
    statements.push({
      id: "column-domain",
      sql: `SELECT DISTINCT ${colExpr} AS v FROM ${source.from} ${where} ORDER BY 1`,
    });
  }

  if (allowed.length) {
    statements.push({
      id: "pivot",
      sql:
        `SELECT ${[...selectDims, ...groupingTags, ...selectMeasures].join(", ")}\n` +
        `FROM ${source.from}\n` +
        (where ? `${where}\n` : "") +
        `GROUP BY ${groupingSets(rowExprs, colExpr)}\n` +
        `ORDER BY ${[...slice.rows.map((k) => `__g_${k}`), ...slice.rows].join(", ") || "1"}`,
    });
  }

  const compareColumns: string[] = [];
  const compare = slice.compare;
  if (compare && allowed.length && slice.rows.includes("period")) {
    const periodE = dimExpr(source, "period");
    const otherRowKeys = slice.rows.filter((k) => k !== "period");
    const otherRowExprs = otherRowKeys.map((k) => dimExpr(source, k));
    const dimList = ["period", ...otherRowKeys];
    // [p1-review F1] the legs see FULL history: a date preset inside the
    // CTEs amputates the prior-year leg and labels real revenue NEW. Dim
    // filters stay inside; the PRESET filters the OUTPUT, and the output is
    // capped at the current month so relabeled prior rows cannot mint
    // phantom future periods.
    const innerWhere = whereClause(source, { ...slice, dateWhere: undefined });
    const outerParts: string[] = [
      `TRY_CAST(COALESCE(cur.period, prior.period) || '-01' AS DATE) <= DATE '${monthStartLiteral(0)}'`,
    ];
    if (slice.dateWhere) {
      outerParts.push(
        // token boundary [p1-r3 W2]: never rewrite `f.period` inside `f.period_start`
        `(${slice.dateWhere.replace(new RegExp(periodE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9_])", "g"), "COALESCE(cur.period, prior.period)")})`
      );
    }
    const outerWhere = `WHERE ${outerParts.join(" AND ")}`;

    if (compare.modes.includes("prior_year")) {
      // prior leg re-labeled onto the current period, FULL JOINed in SQL , 
      // deltas/guarded pcts computed HERE, never client-side [conv C3]
      const curSel = [
        `${periodE} AS period`,
        ...otherRowKeys.map((k, i) => `${otherRowExprs[i]} AS ${k}`),
        ...allowed.map((m) => `${m.expr} AS ${m.key}`),
        // columns below can refuse rather than compare a part-period to a whole one.
        ...(source.partialExpr ? [`BOOL_OR(${source.partialExpr}) AS __partial`] : []),
      ].join(", ");
      const priorSel = [
        `${PERIOD_PLUS_ONE_YEAR(periodE)} AS period`,
        ...otherRowKeys.map((k, i) => `${otherRowExprs[i]} AS ${k}`),
        ...allowed.map((m) => `${m.expr} AS ${m.key}`),
      ].join(", ");
      const joinOn = dimList.map((k) => `cur.${k} IS NOT DISTINCT FROM prior.${k}`).join(" AND ");
      const cols = allowed
        .map((m) => {
          const parts = [
            `cur.${m.key} AS ${m.key}`,
            `prior.${m.key} AS ${m.key}_prior`,
            `${guardPartial(source, `cur.${m.key} - prior.${m.key}`)} AS ${m.key}_delta_abs`,
            // % refused (NULL) when there is no prior baseline
            // % refused when no baseline OR the baseline is immaterial (a
            // near-zero prior mints a 16,000% headline) [p1-r2 G5]: cap at
            // 1000%: beyond it, dollars-only, same treatment as NEW
            `${guardPartial(
              source,
              `CASE WHEN prior.${m.key} IS NULL OR prior.${m.key} = 0 THEN NULL ` +
                `WHEN abs(cur.${m.key} - prior.${m.key}) > 10 * abs(prior.${m.key}) THEN NULL ` +
                `ELSE round(100.0 * (cur.${m.key} - prior.${m.key}) / prior.${m.key}, 2) END`
            )} AS ${m.key}_delta_pct`,
            ...(compare.newRevenueSplit
              ? [`(prior.${m.key} IS NULL) AS ${m.key}_is_new`]
              : []),
            ...(compare.varianceFlag
              ? [
                  // a lost row is NOT 'flat' [p1-r2 G7]
                  `CASE WHEN cur.period IS NULL THEN 'no current-year rows' ` +
                    `WHEN cur.${m.key} IS NULL THEN 'not computable' ` +
                    `WHEN prior.${m.key} IS NULL THEN 'new' ` +
                    `WHEN cur.${m.key} > prior.${m.key} THEN 'positive' ` +
                    `WHEN cur.${m.key} < prior.${m.key} THEN 'negative' ELSE 'flat' END AS ${m.key}_variance`,
                ]
              : []),
          ];
          compareColumns.push(
            `${m.key}_prior`,
            `${m.key}_delta_abs`,
            `${m.key}_delta_pct`,
            ...(compare.newRevenueSplit ? [`${m.key}_is_new`] : []),
            ...(compare.varianceFlag ? [`${m.key}_variance`] : [])
          );
          return parts.join(", ");
        })
        .join(", ");
      statements.push({
        id: "compare-prior-year",
        sql:
          `WITH cur AS (SELECT ${curSel} FROM ${source.from} ${innerWhere} GROUP BY ${dimList.map((_, i) => i + 1).join(", ")}),\n` +
          `prior AS (SELECT ${priorSel} FROM ${source.from} ${innerWhere} GROUP BY ${dimList.map((_, i) => i + 1).join(", ")})\n` +
          `SELECT ${dimList.map((k) => `COALESCE(cur.${k}, prior.${k}) AS ${k}`).join(", ")}, ${cols}\n` +
          `FROM cur FULL JOIN prior ON ${joinOn}\n` +
          `${outerWhere}\n` +
          `ORDER BY 1${otherRowKeys.length ? ", " + dimList.slice(1).map((_, i) => i + 2).join(", ") : ""}`,
      });
    }

    // TTM is a SUM over 12 months: only additive measures qualify [p1-r2 G2];
    // a ratio's monthly values summed is not a TTM (validateView refuses these
    // at author time; this filter is the in-engine backstop)
    const ttmable = allowed.filter((m) => m.kind === "sum" || m.additive === true);
    if (compare.modes.includes("ttm_pair") && ttmable.length) {
      // TTM now vs TTM prior anchored on the max complete period in the slice;
      // pct NULL unless both 12-month legs are COMPLETE [spine semantics]
      const ttmCols = ttmable
        .map((m) => {
          compareColumns.push(`${m.key}_ttm_now`, `${m.key}_ttm_prior`, `${m.key}_ttm_delta_pct`, `${m.key}_ttm_now_n`, `${m.key}_ttm_prior_n`);
          return (
            // dollars WITHHELD per leg unless 12 months present [p1-review F2]
            `CASE WHEN count(DISTINCT CASE WHEN leg='now' THEN period END) = 12 THEN sum(CASE WHEN leg = 'now' THEN ${m.key} END) END AS ${m.key}_ttm_now, ` +
            `CASE WHEN count(DISTINCT CASE WHEN leg='prior' THEN period END) = 12 THEN sum(CASE WHEN leg = 'prior' THEN ${m.key} END) END AS ${m.key}_ttm_prior, ` +
            `count(DISTINCT CASE WHEN leg='now' THEN period END) AS ${m.key}_ttm_now_n, ` +
            `count(DISTINCT CASE WHEN leg='prior' THEN period END) AS ${m.key}_ttm_prior_n, ` +
            `CASE WHEN count(DISTINCT CASE WHEN leg='now' THEN period END) = 12 ` +
            `AND count(DISTINCT CASE WHEN leg='prior' THEN period END) = 12 ` +
            `AND sum(CASE WHEN leg = 'prior' THEN ${m.key} END) > 0 ` +
            `THEN round(100.0 * (sum(CASE WHEN leg='now' THEN ${m.key} END) - sum(CASE WHEN leg='prior' THEN ${m.key} END)) / sum(CASE WHEN leg='prior' THEN ${m.key} END), 2) END AS ${m.key}_ttm_delta_pct`
          );
        })
        .join(", ");
      statements.push({
        id: "compare-ttm-pair",
        sql:
          `WITH legs AS (SELECT ${periodE} AS period, ` +
          `CASE WHEN ${periodE} > '${monthKeyLiteral(13)}' AND ${periodE} <= '${monthKeyLiteral(1)}' THEN 'now' ` +
          `WHEN ${periodE} > '${monthKeyLiteral(25)}' AND ${periodE} <= '${monthKeyLiteral(13)}' THEN 'prior' END AS leg, ` +
          `${ttmable.map((m) => `${m.expr} AS ${m.key}`).join(", ")} ` +
          `FROM ${source.from} ${innerWhere} GROUP BY 1, 2)\n` +
          `SELECT ${ttmCols} FROM legs WHERE leg IS NOT NULL`,
      });
    }
  }

  return {
    statements,
    rowDims: slice.rows,
    colDim: slice.cols[0] ?? null,
    measureKeys: allowed.map((m) => m.key),
    compareColumns,
    refusedMeasures: refused,
  };
}
