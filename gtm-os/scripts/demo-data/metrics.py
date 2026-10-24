"""The one place every headline figure is defined and computed.

Writes public/data/metrics.json. Every surface that quotes a KPI (cockpit, chat, overview, sales floor, digital
board, executive readout) reads that file through lib/demo/metrics.ts; none computes its own. The values come from
the same published feeds the report tabs read, so the charts and the headline tiles share their inputs.

Definitions (also written into the file so the Definitions page prints them):
  ad spend              = online media + agency fees + offline media
  marketing cost        = ad spend + marketing tools + marketing payroll          (all-in)
  gross revenue         = sold revenue, before cancels
  net revenue           = gross minus cancels and credit declines                 (the stable figure)
  MER                   = gross revenue / ad spend
  marketing cost %      = marketing cost / net revenue                            (target 28 percent)
  cost per lead / set / sale = ad spend / leads / appointments set / sales
  set rate              = appointments set / leads
  close rate            = sales / appointments issued
  connect rate          = connected calls / dials

Windows follow the report presets exactly. "Today" is the morning after the last full data day, so
yesterday = the data's last full day. The current month is partial and says so.
"""
from __future__ import annotations

from datetime import date, timedelta

import duckdb

from common import OUT_DATA, OUT_REPORTS, iso, write_json

KPIS = {
    "leads": ("Leads", "count", "Every new inquiry recorded in the CRM in the window, from any source."),
    "sets": ("Appointments set", "count", "Leads that booked an in-home appointment."),
    "issued": ("Appointments issued", "count", "Booked appointments handed to a rep to run."),
    "meetings": ("Meetings held", "count", "Appointments where the rep and the customer met."),
    "sales": ("Sales", "count", "Appointments that ended in a sale."),
    "gross_revenue": ("Gross revenue", "usd", "Revenue sold in the window, before cancels."),
    "net_revenue": ("Net revenue", "usd", "Gross revenue minus cancels and credit declines."),
    "ad_spend": ("Ad spend", "usd", "Online media plus agency fees plus offline media."),
    "marketing_cost": ("Marketing cost", "usd", "Ad spend plus marketing tools plus marketing payroll."),
    "marketing_tools": ("Marketing tools", "usd", "Software and tools used by marketing."),
    "marketing_payroll": ("Marketing payroll", "usd", "Marketing team payroll for the window."),
    "revenue_per_marketing_dollar": ("Revenue per marketing dollar", "ratio", "Net revenue divided by all-in marketing cost."),
    "mer": ("MER", "ratio", "Gross revenue divided by ad spend, shown as a multiple such as 4.8x."),
    "marketing_cost_pct": ("Marketing cost as a share of net revenue", "pct", "All-in marketing cost divided by net revenue, against a 28 percent target."),
    "cost_per_lead": ("Cost per lead", "usd2", "Ad spend divided by leads."),
    "cost_per_set": ("Cost per set", "usd", "Ad spend divided by appointments set."),
    "cost_per_sale": ("Cost per sale", "usd", "Ad spend divided by sales."),
    "set_rate": ("Set rate", "pct", "Appointments set divided by leads."),
    "close_rate": ("Close rate", "pct", "Sales divided by appointments issued."),
    "gross_per_issued": ("Gross revenue per issued appointment", "usd", "Gross revenue divided by appointments issued."),
    "net_per_issued": ("Net revenue per issued appointment", "usd", "Net revenue divided by appointments issued."),
    "dials": ("Dials", "count", "Outbound calls in the CRM's call log."),
    "connects": ("Connects", "count", "Dials that reached a person."),
    "connect_rate": ("Connect rate", "pct", "Connects divided by dials."),
    "dials_per_set": ("Dials per set", "ratio1", "Dials divided by appointments set."),
}
LOWER_IS_BETTER = {"ad_spend", "marketing_cost", "marketing_cost_pct", "cost_per_lead", "cost_per_set", "cost_per_sale", "dials_per_set"}


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _prev_month_start(d: date) -> date:
    return _month_start(_month_start(d) - timedelta(days=1))


class Metrics:
    def __init__(self, end: date, goal: float | None = None, pace_frac: float | None = None):
        self.end = end
        self.today = end + timedelta(days=1)
        p = lambda n: str(OUT_REPORTS / f"{n}.parquet")
        c = self.con = duckdb.connect()
        c.execute(f"CREATE VIEW f AS SELECT TRY_CAST(date AS DATE) AS d, * EXCLUDE (date) FROM read_parquet('{p('crm_spine__fact_funnel_daily')}')")
        c.execute(f"CREATE VIEW s AS SELECT TRY_CAST(spend_date AS DATE) AS d, bucket, amount_cents FROM read_parquet('{p('dm_spend_daily')}')")
        c.execute(f"CREATE VIEW g AS SELECT TRY_CAST(date AS DATE) AS d, net_cents + prenet_cents AS netrev FROM read_parquet('{p('efficiency__daily')}') "
                  f"WHERE office = 'COMPANY' AND universe = 'rep_assigned'")
        c.execute(f"CREATE VIEW cf AS SELECT TRY_CAST(call_date AS DATE) AS d, * EXCLUDE (call_date) FROM "
                  f"read_parquet('{p('callfloor/callfloor_connect_rate_crm_daily')}') WHERE source = 'ledger'")
        self.goal, self.pace_frac = goal, pace_frac

    def values(self, a: date, b: date) -> dict | None:
        b = min(b, self.end)
        if b < a:
            return None
        q = lambda sql: self.con.execute(sql).fetchone()
        rng = f"d BETWEEN DATE '{a}' AND DATE '{b}'"
        leads, sets, issued, meetings, sales, gross = q(
            f"SELECT SUM(leads), SUM(sets), SUM(issues), SUM(demos), SUM(sales), SUM(gross_cents) FROM f WHERE {rng}")
        ad, tools, labor = q(
            f"SELECT SUM(amount_cents) FILTER (WHERE bucket IN ('inhouse','vendor','offline')), SUM(amount_cents) FILTER (WHERE bucket = 'tools'), "
            f"SUM(amount_cents) FILTER (WHERE bucket = 'labor') FROM s WHERE {rng}")
        (netrev,) = q(f"SELECT SUM(netrev) FROM g WHERE {rng}")
        dials, connects = q(f"SELECT SUM(crm_dials), SUM(crm_connects) FROM cf WHERE {rng}")
        n = lambda x: float(x or 0)
        leads, sets, issued, meetings, sales = map(n, (leads, sets, issued, meetings, sales))
        gross, ad, tools, labor, netrev = (n(gross) / 100.0, n(ad) / 100.0, n(tools) / 100.0, n(labor) / 100.0, n(netrev) / 100.0)
        dials, connects = n(dials), n(connects)
        cost = ad + tools + labor
        div = lambda x, y: (x / y) if y else None
        v = {
            "leads": leads, "sets": sets, "issued": issued, "meetings": meetings, "sales": sales,
            "gross_revenue": gross, "net_revenue": netrev, "ad_spend": ad, "marketing_cost": cost,
            "marketing_tools": tools, "marketing_payroll": labor, "revenue_per_marketing_dollar": div(netrev, cost),
            "mer": div(gross, ad), "marketing_cost_pct": (100.0 * cost / netrev) if netrev else None,
            "cost_per_lead": div(ad, leads), "cost_per_set": div(ad, sets), "cost_per_sale": div(ad, sales),
            "set_rate": (100.0 * sets / leads) if leads else None, "close_rate": (100.0 * sales / issued) if issued else None,
            "gross_per_issued": div(gross, issued), "net_per_issued": div(netrev, issued),
            "dials": dials, "connects": connects, "connect_rate": (100.0 * connects / dials) if dials else None,
            "dials_per_set": div(dials, sets),
        }
        return {k: (round(x, 4) if isinstance(x, float) else x) for k, x in v.items()}

    def windows(self) -> dict:
        T = self.today
        mon = T - timedelta(days=T.weekday())
        ms, pms = _month_start(T), _prev_month_start(T)
        elapsed = (min(T - timedelta(days=1), self.end) - ms).days + 1
        pm_end = ms - timedelta(days=1)
        defs = {
            "yesterday": ("Yesterday", T - timedelta(days=1), T - timedelta(days=1), T - timedelta(days=8), T - timedelta(days=8), False),
            "wtd": ("Week to date", mon, T - timedelta(days=1), mon - timedelta(days=7), T - timedelta(days=8), True),
            "mtd": ("Month to date", ms, T - timedelta(days=1), pms, min(pms + timedelta(days=elapsed - 1), pm_end), True),
            "last7": ("Last 7 days", T - timedelta(days=7), T - timedelta(days=1), T - timedelta(days=14), T - timedelta(days=8), False),
            "last28": ("Last 28 days", T - timedelta(days=28), T - timedelta(days=1), T - timedelta(days=56), T - timedelta(days=29), False),
            "mom": (pms.strftime("%B"), pms, pm_end, _prev_month_start(pms), pms - timedelta(days=1), False),
            "ytd": ("Year to date", date(T.year, 1, 1), T - timedelta(days=1), None, None, True),
        }
        out = {}
        for key, (label, a, b, pa, pb, partial) in defs.items():
            out[key] = {
                "label": label, "start": iso(a), "end": iso(min(b, self.end)), "days": (min(b, self.end) - a).days + 1, "partial": partial,
                "values": self.values(a, b), "prior": self.values(pa, pb) if pa else None,
                "prior_start": iso(pa) if pa else None, "prior_end": iso(pb) if pb else None,
            }
        return out

    def months(self, n: int = 13) -> dict:
        out = {}
        ms = _month_start(self.today)
        for k in range(n):
            a = ms
            for _ in range(k):
                a = _prev_month_start(a)
            nxt = date(a.year + (a.month == 12), (a.month % 12) + 1, 1)
            b = nxt - timedelta(days=1)
            partial = b > self.end
            vals = self.values(a, b)
            if vals is None:
                continue
            out[a.strftime("%Y-%m")] = {"label": a.strftime("%B %Y"), "start": iso(a), "end": iso(min(b, self.end)), "partial": partial,
                                        "days_elapsed": (min(b, self.end) - a).days + 1, "days_in_month": (b - a).days + 1, "values": vals}
        return out

    def markets(self) -> dict:
        T = self.today
        a, b = T - timedelta(days=7), T - timedelta(days=1)
        rows = self.con.execute(f"""SELECT m.name, SUM(f.leads), SUM(f.sets), SUM(f.issues), SUM(f.sales), SUM(f.gross_cents)/100.0
                                    FROM f JOIN read_parquet('{OUT_REPORTS / 'dim_market.parquet'}') m ON m.market_id = f.office_id
                                    WHERE f.d BETWEEN DATE '{a}' AND DATE '{b}' GROUP BY 1 ORDER BY 1""").fetchall()
        return {r[0]: {"leads": r[1], "sets": r[2], "issued": r[3], "sales": r[4], "gross_revenue": r[5]} for r in rows}


def write_metrics(end: date, goal: float, pace_frac: float, asof: str) -> dict:
    m = Metrics(end, goal, pace_frac)
    wins = m.windows()
    mtd = wins["mtd"]["values"]
    pace = {"goal": int(goal), "actual": round(mtd["gross_revenue"]), "expected_by_today": round(goal * pace_frac),
            "pct_to_pace": round(100.0 * mtd["gross_revenue"] / (goal * pace_frac), 1)}
    doc = {
        "as_of": asof, "through": iso(end), "today": iso(m.today),
        "kpis": {k: {"label": v[0], "unit": v[1], "definition": v[2], "lower_is_better": k in LOWER_IS_BETTER} for k, v in KPIS.items()},
        "windows": wins, "months": m.months(), "pace": pace, "markets_last7": m.markets(),
    }
    write_json(OUT_DATA / "metrics.json", doc)
    return doc
