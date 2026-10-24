// The marketing cost target strip. Pure:
// rows in, cell texts out, so the exact texts are testable without a browser.
//
// The strip is the marketing cost target for MARKETING COST only:
//   marketing cost % = all-in cost / (net + pending net)      all-in = media + vendor fees + tools +
//                                                          every dollar recorded through the data-through day
//   traditional MER  = (net + pending net) / all-in cost
//   Net revenue per issued appointment             = (net + pending net) / net issued, rep-assigned, from the published marketing cost target feed
// The percent renders as a number from what is recorded through this morning; a cost-record check that
// is still open is a caveat printed beside it, never a reason to withhold (the owner: "Everything should be
// cost recorded up to this AM ... not a SINGLE day or line item or cost should be missed unless it
// literally doesn't exist"). The qualifiers (data-through, confidence, settle) live beside the value.

import type { ViewSlice } from "@/lib/reports/workbench/pivotSql";

export type GoldenMonthlyRow = {
  period: string;
  office?: string;
  universe?: string;
  nsli_cents: number | null; // net only, as the feed names it
  nsli_plus_prenet_cents?: number | null; // the ruled Net revenue per issued appointment: net revenue per net issued
  net_cents?: number | null;
  prenet_cents?: number | null;
  marketing_cost_pct: number | null; // the feed's own figure; refused upstream until its cost sources land
  target_pct?: number | null;
  settle_status: string | null;
  cost_status: string | null;
  trust_flag?: string | null;
  as_of: string | null;
  confidence: string | null;
};

export type GoldenTieoutRow = { period: string; result: string; column?: string | null; office?: string | null; grain?: string | null };

export type CostStatusRow = {
  month: string;
  settle_status?: string | null;
  trust_flag?: string | null;
  matrix_complete: boolean | number | null;
  fail_rows?: number | null;
  waiting_on?: string | null;
  matrix_run_at?: string | null;
  strip_text: string;
};

/** All-in cost for the month through the data-through day, summed on the board from the spend feed. */
export type AllInSpend = {
  cents: number | null; // null when the spend feed carries no recorded row for the month
  labor_cents: number | null; // the ruled labor constant's share, for the detail line
  through: string | null; // the last recorded day summed
};

export type StripCellKey = "marketing_cost_pct" | "mer" | "nsli" | "tieout";

export type StripCell = {
  key: StripCellKey;
  label: string;
  value: string; // the one text the owner reads first
  detail?: string;
  caveat?: string; // an open cost-record check, printed beside the number, never in its place
  tone: "ok" | "warn" | "bad" | "muted";
  qualifiers: { dataThrough: string; confidence: string; settle: string };
  notTied: boolean;
  href?: string;
};

export type Strip = { period: string | null; cells: StripCell[]; costCaveat: string | null; tieoutFails: number };

export const TARGET_PCT_DEFAULT = 15;
export const DATA_THROUGH_NOT_PUBLISHED = "data-through day not published";

/** The settle status alone: the confidence and the data-through day print beside it, once each. */
export function settleText(settle: string | null | undefined): string {
  const s = (settle ?? "").toUpperCase();
  if (s === "MONTH_TO_DATE" || s === "MTD" || s === "OPEN") return "month to date";
  if (s === "SETTLED" || s === "CLOSED") return "settled";
  if (!s) return "settle status not published";
  return s.toLowerCase().replace(/_/g, " ");
}

/** The pivot slice the board runs for the month's all-in cost: the registry's own measures
 * through the data-through day by construction) over the spend source, one month. One
 * aggregation path (the pivot builder), one definition (sources.dm.ts); the daily tie-out
 * recomputes it from the database. */
export function allInSpendSlice(period: string): ViewSlice {
  return {
    sourceKey: "dm_spend",
    rows: ["period"],
    cols: [],
    measures: ["allin_spend", "labor_spend"],
    filters: [{ dimKey: "period", op: "=", values: [period] }],
    dateWhere: undefined,
  };
}

/** The month's row of that pivot (the one whose period is not the grand-total tag) as cents. */
export function allInFromPivotRows(rows: Record<string, unknown>[]): AllInSpend {
  const r = rows.find((x) => Number(x.__g_period) === 0);
  if (!r) return { cents: null, labor_cents: null, through: null };
  const cents = r.allin_spend === null || r.allin_spend === undefined ? null : Math.round(Number(r.allin_spend) * 100);
  const labor = r.labor_spend === null || r.labor_spend === undefined ? null : Math.round(Number(r.labor_spend) * 100);
  return { cents: cents === 0 && labor === 0 ? null : cents, labor_cents: labor, through: null };
}

/** The open cost-record checks as a caveat line, or null when the record is complete or silent. */
export function costCaveat(cost: CostStatusRow | null): string | null {
  if (!cost || !cost.strip_text) return null;
  const t = cost.strip_text.trim();
  if (t.toLowerCase() === "complete") return null;
  return t.replace(/^cost record incomplete, waiting on /i, "cost record checks still open, waiting on ");
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function marketingCostPct(allInCents: number, netCents: number, prenetCents: number): number | null {
  const den = netCents + prenetCents;
  if (den <= 0) return null;
  return (100 * allInCents) / den;
}

export function buildStrip(input: {
  monthly: GoldenMonthlyRow | null;
  tieout: GoldenTieoutRow[];
  costStatus: CostStatusRow | null;
  spend: AllInSpend | null;
  /** the last day the marketing cost target's daily feed carries for this month (YYYY-MM-DD); null when unpublished */
  dataThrough: string | null;
}): Strip {
  const { monthly, tieout, costStatus, spend } = input;
  const period = monthly?.period ?? costStatus?.month ?? null;
  const fails = tieout.filter((t) => (t.result ?? "").toUpperCase() === "FAIL").length;
  const notTied = fails > 0;
  const q = {
    dataThrough: input.dataThrough ? input.dataThrough.slice(0, 10) : DATA_THROUGH_NOT_PUBLISHED,
    confidence: monthly?.confidence ?? "confidence not published",
    settle: settleText(monthly?.settle_status),
  };
  const caveat = costCaveat(costStatus);
  const cells: StripCell[] = [];

  if (!monthly) {
    const reason = "no marketing cost target month published for the company; the strip waits on the marketing cost target feed";
    for (const [key, label] of [
      ["marketing_cost_pct", "Marketing cost %"],
      ["mer", "Traditional MER"],
      ["nsli", "Net revenue per issued appointment month to date"],
    ] as [StripCellKey, string][]) {
      cells.push({ key, label, value: reason, tone: "bad", qualifiers: q, notTied });
    }
  } else {
    const target = monthly.target_pct ?? TARGET_PCT_DEFAULT;
    const net = monthly.net_cents ?? null;
    const prenet = monthly.prenet_cents ?? null;
    const allIn = spend?.cents ?? null;
    if (allIn === null) {
      const r = spend
        ? "no recorded cost row for this month on the spend feed; every cost source for the month is missing, name it"
        : "spend feed not read; the strip cannot total the month's cost";
      cells.push({ key: "marketing_cost_pct", label: "Marketing cost as a share of net revenue", value: r, tone: "bad", qualifiers: q, notTied, caveat: caveat ?? undefined });
      cells.push({ key: "mer", label: "Revenue per marketing dollar", value: r, tone: "bad", qualifiers: q, notTied });
    } else if (net === null || prenet === null) {
      const r = "net revenue not published on the marketing cost target feed for this month; the percent has no denominator";
      cells.push({ key: "marketing_cost_pct", label: "Marketing cost as a share of net revenue", value: r, tone: "bad", qualifiers: q, notTied, caveat: caveat ?? undefined });
      cells.push({ key: "mer", label: "Revenue per marketing dollar", value: r, tone: "bad", qualifiers: q, notTied });
    } else {
      const pct = marketingCostPct(allIn, net, prenet);
      if (pct === null) {
        const r = "net revenue is zero for this month; the percent is undefined";
        cells.push({ key: "marketing_cost_pct", label: "Marketing cost as a share of net revenue", value: r, tone: "bad", qualifiers: q, notTied, caveat: caveat ?? undefined });
        cells.push({ key: "mer", label: "Revenue per marketing dollar", value: r, tone: "bad", qualifiers: q, notTied });
      } else {
        const over = pct > target;
        const labor = spend?.labor_cents ?? 0;
        cells.push({
          key: "marketing_cost_pct",
          label: "Marketing cost as a share of net revenue",
          value: `${pct.toFixed(2)}%`,
          detail: `target ${target.toFixed(0)}%: all-in cost ${money(allIn)} (media, fees, tools, offline, payroll ${money(labor)}) over net revenue ${money(net + prenet)}`,
          caveat: caveat ?? undefined,
          tone: over ? "bad" : "ok",
          qualifiers: q,
          notTied,
        });
        cells.push({
          key: "mer",
          label: "Revenue per marketing dollar",
          value: allIn > 0 ? `${((net + prenet) / allIn).toFixed(2)}x` : "no cost in the month",
          detail: "net revenue for each dollar of all-in marketing cost",
          tone: over ? "bad" : "ok",
          qualifiers: q,
          notTied,
        });
      }
    }
    cells.push({
      key: "nsli",
      label: "Net revenue per issued appointment month to date",
      value: monthly.nsli_plus_prenet_cents === null || monthly.nsli_plus_prenet_cents === undefined ? "Net revenue per issued appointment not published for this month" : money(monthly.nsli_plus_prenet_cents),
      detail: "net revenue per issued appointment that had a rep",
      tone: monthly.nsli_plus_prenet_cents === null || monthly.nsli_plus_prenet_cents === undefined ? "bad" : "ok",
      qualifiers: q,
      notTied,
    });
  }

  cells.push({
    key: "tieout",
    label: "Matches the CRM",
    value: tieout.length === 0 ? "no checks for this month" : fails > 0 ? `No: ${fails} ${fails === 1 ? "row differs" : "rows differ"}` : `Yes, ${tieout.length} checks`,
    detail: fails > 0 ? "strip numbers carry a not-tied marker until the rows pass" : undefined,
    tone: tieout.length === 0 ? "bad" : fails > 0 ? "bad" : "ok",
    qualifiers: q,
    notTied,
    href: "#tieout",
  });

  return { period, cells, costCaveat: caveat, tieoutFails: fails };
}
