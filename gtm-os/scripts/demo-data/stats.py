"""Headline statistics for the demo's prose (chat answers, stage cards), computed by SQL over the generated parquet.

The chat and the stage cards quote numbers; every one of them comes from a query here, over the same files the
reports read, so the prose cannot drift from the charts.
"""
from __future__ import annotations

from datetime import date, timedelta

import duckdb

from common import OUT_REPORTS
from feeds_web import SITE


class Stats:
    def __init__(self, end: date):
        self.end = end
        self.con = duckdb.connect()
        p = lambda n: str(OUT_REPORTS / f"{n}.parquet")
        c = self.con
        c.execute(f"""CREATE VIEW spend AS
            SELECT * FROM read_parquet('{p('google_ads__fact_spend_daily')}') UNION ALL BY NAME
            SELECT * FROM read_parquet('{p('meta__fact_spend_daily')}') UNION ALL BY NAME
            SELECT * FROM read_parquet('{p('microsoft_ads__fact_spend_daily')}')""")
        c.execute(f"CREATE VIEW camp AS SELECT * FROM read_parquet('{p('google_ads__dim_campaign')}') UNION ALL BY NAME "
                  f"SELECT * FROM read_parquet('{p('meta__dim_campaign')}') UNION ALL BY NAME SELECT * FROM read_parquet('{p('microsoft_ads__dim_campaign')}')")
        for n in ("crm_spine__fact_funnel_daily", "dm_spend_daily", "dm_source_chain_daily", "efficiency__monthly", "dm_windows",
                  "lens_projection", "lens_month", "fact_gsc_daily", "fact_gsc_site_daily", "fact_ga4_channel_daily", "meter_question_daily",
                  "meter_accuracy_period", "meter_cost_daily", "work_runs_daily", "dim_market", "spine_funnel_monthly", "spine_spend_monthly",
                  "meter_seat_daily", "meter_latency_period", "meter_gaps_period", "work_savings_period"):
            c.execute(f"CREATE VIEW {n} AS SELECT * FROM read_parquet('{p(n)}')")
        c.execute(f"CREATE VIEW cf AS SELECT * FROM read_parquet('{p('callfloor/callfloor_connect_rate_crm_daily')}') WHERE source = 'ledger'")
        c.execute(f"CREATE VIEW cfa AS SELECT * FROM read_parquet('{p('callfloor/callfloor_connect_rate_crm_agent_daily')}') WHERE source = 'ledger'")
        self.d7 = end - timedelta(days=6)
        self.p7 = end - timedelta(days=13)
        self.p7e = end - timedelta(days=7)

    def one(self, sql: str):
        return self.con.execute(sql).fetchone()

    def rows(self, sql: str):
        return self.con.execute(sql).fetchall()

    def _w(self, col: str, a: date, b: date) -> str:
        return f"TRY_CAST({col} AS DATE) BETWEEN DATE '{a}' AND DATE '{b}'"

    # ------------------------------------------------------------------ paid
    def spend_by_platform(self, a: date, b: date) -> dict:
        r = self.rows(f"SELECT platform, SUM(amount_cents)/100.0 FROM spend WHERE grain='campaign' AND {self._w('spend_date', a, b)} GROUP BY 1 ORDER BY 2 DESC")
        return {k: float(v) for k, v in r}

    def paid_week(self) -> dict:
        cur = self.spend_by_platform(self.d7, self.end)
        prev = self.spend_by_platform(self.p7, self.p7e)
        return {"cur": cur, "prev": prev, "total": sum(cur.values()), "total_prev": sum(prev.values())}

    def weakest_campaign(self):
        r = self.one(f"""SELECT c.name, c.platform, SUM(s.amount_cents)/100.0 AS spend, SUM(s.conversions) AS conv,
                    SUM(s.amount_cents)/100.0/NULLIF(SUM(s.conversions),0) AS cpa
                    FROM spend s JOIN camp c ON c.campaign_id = s.campaign_id
                    WHERE s.grain='campaign' AND {self._w('s.spend_date', self.end - timedelta(days=13), self.end)}
                    AND c.channel_id <> 'ch_video' GROUP BY 1,2 HAVING SUM(s.amount_cents) > 300000 ORDER BY cpa DESC LIMIT 1""")
        return r

    def best_campaign(self):
        return self.one(f"""SELECT c.name, c.platform, SUM(s.amount_cents)/100.0 AS spend, SUM(s.conversions) AS conv,
                    SUM(s.amount_cents)/100.0/NULLIF(SUM(s.conversions),0) AS cpa
                    FROM spend s JOIN camp c ON c.campaign_id = s.campaign_id
                    WHERE s.grain='campaign' AND {self._w('s.spend_date', self.end - timedelta(days=13), self.end)}
                    AND c.channel_id <> 'ch_video' GROUP BY 1,2 HAVING SUM(s.amount_cents) > 300000 ORDER BY cpa ASC LIMIT 1""")

    # ------------------------------------------------------------------ funnel
    def funnel(self, a: date, b: date) -> dict:
        r = self.one(f"""SELECT SUM(leads), SUM(sets), SUM(issues), SUM(demos), SUM(sales), SUM(gross_cents)/100.0, SUM(net_cents)/100.0
                         FROM crm_spine__fact_funnel_daily WHERE {self._w('date', a, b)}""")
        return dict(zip(["leads", "sets", "issues", "demos", "sales", "gross", "net"], [float(x) for x in r]))

    def funnel_by_market(self, a: date, b: date) -> list[dict]:
        r = self.rows(f"""SELECT m.name, f.office_id, SUM(leads), SUM(sets), SUM(issues), SUM(demos), SUM(sales), SUM(gross_cents)/100.0
                          FROM crm_spine__fact_funnel_daily f JOIN dim_market m ON m.market_id = f.office_id
                          WHERE {self._w('f.date', a, b)} GROUP BY 1,2 ORDER BY 1""")
        return [dict(name=x[0], id=x[1], leads=x[2], sets=x[3], issues=x[4], demos=x[5], sales=x[6], gross=x[7]) for x in r]

    def adspend_by_market(self, a: date, b: date) -> dict:
        r = self.rows(f"""SELECT market, SUM(amount_cents)/100.0 FROM dm_spend_daily
                          WHERE bucket IN ('inhouse','vendor','offline') AND {self._w('spend_date', a, b)} GROUP BY 1""")
        return {k: float(v) for k, v in r}

    def adspend(self, a: date, b: date) -> float:
        return float(self.one(f"SELECT SUM(amount_cents)/100.0 FROM dm_spend_daily WHERE bucket IN ('inhouse','vendor','offline') AND {self._w('spend_date', a, b)}")[0])

    def source_costs(self, a: date, b: date) -> list[dict]:
        r = self.rows(f"""SELECT subsource_name, SUM(raw_contacts), SUM(sets), SUM(sales), SUM(spend_cents)/100.0,
                          SUM(spend_cents)/100.0/NULLIF(SUM(sets),0) FROM dm_source_chain_daily WHERE {self._w('date', a, b)}
                          GROUP BY 1 ORDER BY 1""")
        return [dict(name=x[0], leads=x[1], sets=x[2], sales=x[3], spend=x[4], cps=x[5]) for x in r]

    def source_close(self, a: date, b: date) -> list[dict]:
        r = self.rows(f"""SELECT subsource_name, SUM(sales)*100.0/NULLIF(SUM(demos),0), SUM(demos), SUM(sales) FROM dm_source_chain_daily
                          WHERE {self._w('date', a, b)} GROUP BY 1 HAVING SUM(demos) > 40 ORDER BY 2 DESC""")
        return [dict(name=x[0], close=x[1], demos=x[2], sales=x[3]) for x in r]

    # ------------------------------------------------------------------ floor
    def floor(self, a: date, b: date) -> dict:
        r = self.one(f"SELECT SUM(crm_dials), SUM(crm_connects), AVG(agents) FILTER (WHERE agents > 0), SUM(crm_machine) FROM cf WHERE {self._w('call_date', a, b)}")
        dials, conn, agents, mach = r
        return {"dials": float(dials), "connects": float(conn), "rate": 100.0 * conn / dials, "agents": float(agents)}

    def agent_rates(self, a: date, b: date) -> list[tuple]:
        return self.rows(f"""SELECT agent_name_lp, SUM(crm_dials), SUM(crm_connects), 100.0*SUM(crm_connects)/NULLIF(SUM(crm_dials),0) AS rate
                             FROM cfa WHERE {self._w('call_date', a, b)} GROUP BY 1 HAVING SUM(crm_dials) > 200 ORDER BY rate""")

    # ------------------------------------------------------------------ organic
    def gsc(self, a: date, b: date) -> dict:
        r = self.one(f"SELECT SUM(clicks), SUM(impressions) FROM fact_gsc_site_daily WHERE site = '{SITE}' AND {self._w('date', a, b)}")
        return {"clicks": float(r[0]), "impressions": float(r[1])}

    def top_query(self, a: date, b: date):
        return self.one(f"SELECT query, SUM(clicks) FROM fact_gsc_daily WHERE {self._w('date', a, b)} GROUP BY 1 ORDER BY 2 DESC LIMIT 1")

    def ga4_channels(self, a: date, b: date) -> list[tuple]:
        return self.rows(f"SELECT ga4_channel_group_raw, SUM(sessions), SUM(key_events) FROM fact_ga4_channel_daily WHERE {self._w('date', a, b)} GROUP BY 1 ORDER BY 2 DESC")

    # ------------------------------------------------------------------ efficiency
    def efficiency(self) -> dict:
        r = self.rows("SELECT period, marketing_cost_pct, target_band, net_plus_pending_cents/100.0, target_pct FROM efficiency__monthly WHERE office='COMPANY' AND universe='rep_assigned' ORDER BY period DESC LIMIT 3")
        return {"cur": r[0], "prev": r[1], "prev2": r[2]}

    def landing(self):
        return self.one("SELECT target_period, point, band_low, band_high FROM lens_projection WHERE market='ALL' AND projection_key='month_landing_sold' ORDER BY target_period DESC LIMIT 1")

    # ------------------------------------------------------------------ AI
    def ai(self) -> dict:
        a, b = self.d7, self.end
        q = self.one(f"SELECT SUM(asked), SUM(answered), SUM(deflected) FROM meter_question_daily WHERE {self._w('q_date', a, b)}")
        acc = self.one(f"SELECT SUM(graded_n), SUM(right_n) FROM meter_accuracy_period WHERE grain='day' AND {self._w('period', a, b)}")
        cost = self.one(f"SELECT SUM(frontier_micro_all)/1e6, SUM(actual_micro)/1e6, SUM(net_micro)/1e6, SUM(calls) FROM meter_cost_daily WHERE {self._w('call_date', a, b)}")
        cost_y = self.one(f"SELECT SUM(actual_micro)/1e6, SUM(net_micro)/1e6 FROM meter_cost_daily WHERE call_date = '{self.end}'")
        mo = self.one(f"SELECT SUM(frontier_micro_all)/1e6, SUM(actual_micro)/1e6, SUM(net_micro)/1e6 FROM meter_cost_daily WHERE {self._w('call_date', date(self.end.year, self.end.month, 1), self.end)}")
        lat = self.one(f"SELECT AVG(complete_p50)/1000.0 FROM meter_latency_period WHERE grain='day' AND {self._w('period', a, b)}")
        gaps = self.one("SELECT open_at_end FROM meter_gaps_period ORDER BY period DESC LIMIT 1")
        return {"asked": float(q[0]), "answered": float(q[1]), "deflected": float(q[2]), "graded": float(acc[0]), "right": float(acc[1]),
                "frontier": float(cost[0]), "actual": float(cost[1]), "net": float(cost[2]), "calls": float(cost[3]),
                "actual_y": float(cost_y[0]), "net_y": float(cost_y[1]), "mtd_frontier": float(mo[0]), "mtd_actual": float(mo[1]), "mtd_net": float(mo[2]),
                "latency_s": float(lat[0]), "open_gaps": int(gaps[0])}

    def work(self) -> dict:
        r = self.one(f"SELECT SUM(runs), SUM(success_n), SUM(failed_n) FROM work_runs_daily WHERE {self._w('run_day', self.d7, self.end)}")
        sv = self.one("SELECT SUM(counterfactual_usd_micro)/1e6, SUM(actual_usd_micro)/1e6, SUM(net_usd_micro)/1e6 FROM work_savings_period WHERE period_start = (SELECT MAX(period_start) FROM work_savings_period WHERE period_start < '" + f"{self.end.year:04d}-{self.end.month:02d}-01" + "')")
        return {"runs": float(r[0]), "ok": float(r[1]), "failed": float(r[2]), "cf": float(sv[0]), "act": float(sv[1]), "net": float(sv[2])}
