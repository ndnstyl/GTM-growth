// drill: batch-pinned resolution from an aggregate cell to
// the declared row feed. The reconciliation SUM is computed by DuckDB with
// the SAME measure expr family (declared rowExpr); the client compares two
// numbers it did not compute. A refused/withheld cell REFUSES its drill
// [r3 R-H1]; a row feed outside the aggregate's batch renders "drill
// unavailable" with both stamps, never a false ERROR [conv F2, r2 F-H2].

import type { DeclaredSource } from "./sources";
import type { Marker } from "./markers";
import { buildBatchCheck, buildDrillStatements } from "./pivotSql";

export type DrillRequest = {
  source: DeclaredSource;
  cellDims: Record<string, string | null>; // null = subtotal member (no filter)
  measureKey: string;
  cellValue: number;
  // last_13 preset is only reconcilable if the drill carries the same floor
  viewBounds?: {
    periodFloor?: string; // 'YYYY-MM': from the view's datePreset
    filters?: { dimKey: string; values: string[] }[];
  };
};

export type DrillStatements = { rowsSql: string; reconcileSql: string };

export type DrillOutcome =
  | { kind: "statements"; statements: DrillStatements; batchCheck: { id: string; sql: string } }
  | { kind: "refused"; markers: Marker[]; reason: string }
  | { kind: "unavailable"; reason: string };

export function buildDrill(req: DrillRequest, cellMarkers: Marker[]): DrillOutcome {
  const { source, cellDims, measureKey } = req;
  const spec = source.drill;
  if (!spec) {
    return {
      kind: "unavailable",
      reason: source.drillNote ?? `${source.label} declares no drill path`,
    };
  }

  const withheld = cellMarkers.filter((m) => m.kind === "withheld");
  if (withheld.length) {
    return {
      kind: "refused",
      markers: cellMarkers,
      reason:
        "this cell is withheld: it has no assertable value, so its drill would " +
        `republish a refused number. Member reason: ${withheld[0].reason}`,
    };
  }
  if (spec.reconcile.measureKey !== measureKey) {
    return {
      kind: "unavailable",
      reason: `drill reconciles on '${spec.reconcile.measureKey}': drill that measure to see rows`,
    };
  }

  const where: { rowExpr: string; value: string }[] = [];
  for (const jk of spec.joinKeys) {
    const v = cellDims[jk.dimKey];
    if (v !== null && v !== undefined) where.push({ rowExpr: jk.rowExpr, value: v });
  }
  // [p2-review W4] a pinned dim the row feed cannot express is a DIFFERENT
  // number: refuse instead of silently dropping the pin
  for (const [dimKey, v] of Object.entries(cellDims)) {
    if (v === null || v === undefined) continue;
    if (!spec.joinKeys.some((j) => j.dimKey === dimKey)) {
      return {
        kind: "unavailable",
        reason: `the cell pins '${dimKey}' but the row feed declares no join key for it: rows would sum a different cell`,
      };
    }
  }

  // map the view's bounds onto row-feed exprs; an unmappable bound REFUSES , 
  // a drill that silently drops a bound reconciles against a different number
  const extra: { rowExpr: string; op: ">=" | "in"; values: string[] }[] = [];
  const jkOf = (dimKey: string) => spec.joinKeys.find((j) => j.dimKey === dimKey);
  if (req.viewBounds?.periodFloor && cellDims["period"] === undefined) {
    const jk = jkOf("period");
    if (!jk) {
      return {
        kind: "unavailable",
        reason: "the view has a date window but the row feed declares no period join key: the drill cannot carry the bound",
      };
    }
    extra.push({ rowExpr: jk.rowExpr, op: ">=", values: [req.viewBounds.periodFloor] });
  }
  for (const f of req.viewBounds?.filters ?? []) {
    if (cellDims[f.dimKey] !== undefined) continue; // already pinned by the cell
    const jk = jkOf(f.dimKey);
    if (!jk) {
      return {
        kind: "unavailable",
        reason: `the view filters on '${f.dimKey}' but the row feed declares no join key for it: the drill cannot carry the bound`,
      };
    }
    extra.push({ rowExpr: jk.rowExpr, op: "in", values: f.values });
  }
  return {
    kind: "statements",
    // on a stamp mismatch: a mixed-batch dir (crash between replaces) is
    // caught by the data itself, not a manifest that always lists all feeds
    batchCheck: buildBatchCheck(source.feeds[0].name, spec.rowFeed),
    statements: buildDrillStatements(
      spec.rowFeed,
      spec.recordFields.map((f) => f.key),
      spec.reconcile.rowExpr,
      where,
      extra
    ),
  };
}
