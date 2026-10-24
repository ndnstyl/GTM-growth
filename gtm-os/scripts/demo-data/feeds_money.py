"""Money chain feeds: efficiency target ("marketing efficiency") feeds, the Digital Marketing board's dm_* feeds,
and the spine monthly feeds.

Definitions used everywhere (one place, so every surface agrees):
  ad spend        = online media + agency fees + offline media          (the "mapped" spend)
  all-in cost     = ad spend + marketing tools + marketing labor (a ruled constant)
  net + pending   = sold - cancels - credit declines                    (the stable revenue figure)
  pending         = the share of that figure still inside the cancel window (recent days)
  net             = (net + pending) - pending
  efficiency %    = all-in cost / (net + pending)                       (target 28 percent)
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

import numpy as np

from common import iso, split_int, ts_iso
from feedio import B, F64, FeedWriter, I64, S, table
from world import (
    ACCOUNTS, AGENCY, AGENCY_FEE_RATE, IN_HOUSE, MARKETS, MIDX, NM, NS, PLATFORMS, SIDX, SOURCE_CODES, SUBSOURCES,
    World, month_labels, period_index, rollup,
)

TARGET_PCT = 28.0
CANCEL_WINDOW_DAYS = 40


def working_weight(d: date) -> float:
    """Working-day working day: weekdays count 1, Saturday and Sunday count half."""
    return 1.0 if d.weekday() < 5 else 0.5


def working_days(a: date, b: date) -> float:
    return sum(working_weight(a + timedelta(days=i)) for i in range((b - a).days + 1))


def batch_id(w: World) -> str:
    return f"batch-{w.end.isoformat()}"


def asof_str(w: World) -> str:
    return ts_iso(w.end + timedelta(days=1), 6, 25)


def month_end(d: date) -> date:
    return date(d.year + (d.month == 12), (d.month % 12) + 1, 1) - timedelta(days=1)


class Money:
    """Derived day x market arrays shared by several feeds."""

    def __init__(self, w: World):
        self.w = w
        D = w.D
        s = lambda a: a.sum(axis=(2, 3))
        self.leads, self.sets, self.issues = s(w.leads), s(w.sets), s(w.issues)
        self.demos, self.sales = s(w.demos), s(w.sales)
        self.sold, self.cancel, self.turn = s(w.sold), s(w.cancel_c), s(w.turndown)
        self.ad_spend = s(w.leaf_spend)  # day x market, cents
        # tools and labor are company-level; they are split to markets by fixed weights only for the market-level
        # efficiency rows (the company row is the sum of its markets)
        mw = np.array([m.weight for m in MARKETS])
        self.tools_m = np.zeros((D, NM), dtype=np.int64)
        self.labor_m = np.zeros((D, NM), dtype=np.int64)
        for di in range(D):
            self.tools_m[di] = split_int(int(w.tools_cents[di]), mw)
            self.labor_m[di] = split_int(int(w.labor_cents[di]), mw)
        self.allin = self.ad_spend + self.tools_m + self.labor_m
        age = np.array([(w.end - d).days for d in w.days])
        g = np.clip(1.0 - age / CANCEL_WINDOW_DAYS, 0.0, 1.0)
        self.g = g
        self.netpre = self.sold - self.cancel - self.turn
        self.prenet = (np.round(self.netpre * g[:, None] / 100.0).astype(np.int64)) * 100
        self.net = self.netpre - self.prenet
        rng = np.random.default_rng(w.seed + 11)
        self.no_rep = rng.binomial(self.issues, 0.025)
        self.no_rep_sales = rng.binomial(self.sales, 0.02)
        self.net_iss_all = np.floor(self.issues * 0.935 + 0.5).astype(np.int64)
        self.net_iss_rep = np.floor((self.issues - self.no_rep) * 0.935 + 0.5).astype(np.int64)
        self.fr = np.where(self.sales > 0, 1.0 - self.no_rep_sales / np.maximum(self.sales, 1), 1.0)

    def month_idx(self):
        return period_index(month_labels(self.w.days))


# --------------------------------------------------------------------------------------
# efficiency target feeds ("marketing efficiency")
# --------------------------------------------------------------------------------------


def _tier(pct):
    if pct is None:
        return None, None
    t = TARGET_PCT
    edges = [(t - 3, f"Tier 1 ({t - 3:.1f}% or under)"), (t, f"Tier 2 ({t - 3 + 0.01:.2f}% to {t:.1f}%)"),
             (t + 3, f"Tier 3 ({t + 0.01:.2f}% to {t + 3:.1f}%)")]
    label = f"Tier 4 (above {t + 3:.1f}%)"
    for edge, lab in edges:
        if pct <= edge:
            label = lab
            break
    decidable = 0 if any(abs(pct - edge) < 0.35 for edge, _ in edges) else 1
    return label, decidable


def _universe(mo: Money, u: str) -> dict:
    if u == "all_appts":
        return dict(iss=mo.issues, net_iss=mo.net_iss_all, demo=mo.demos, close_n=mo.sales, close=mo.sold, prenet=mo.prenet,
                    cancel=mo.cancel, credit=mo.turn, net=mo.net, no_rep_appts=mo.no_rep, no_rep_sales=mo.no_rep_sales)
    rd = lambda a: (np.round(a * mo.fr / 100.0).astype(np.int64)) * 100
    close, cancel, credit = rd(mo.sold), rd(mo.cancel), rd(mo.turn)
    netpre = close - cancel - credit  # recomputed from the rounded parts so the identity holds to the cent
    prenet = (np.round(netpre * mo.g[:, None] / 100.0).astype(np.int64)) * 100
    return dict(iss=mo.issues - mo.no_rep, net_iss=mo.net_iss_rep, demo=mo.demos - np.minimum(mo.demos, mo.no_rep),
                close_n=mo.sales - mo.no_rep_sales, close=close, prenet=prenet, cancel=cancel,
                credit=credit, net=netpre - prenet, no_rep_appts=mo.no_rep, no_rep_sales=mo.no_rep_sales)


def write_golden(fw: FeedWriter, w: World, mo: Money, wp: World, mp: Money) -> dict:
    """Monthly rows and the tie-out read the full history (w, mo); the daily rows publish the window (wp, mp)."""
    uniq, idx = mo.month_idx()
    n = len(uniq)
    cur_period = uniq[-1]
    asof = iso(w.end)
    batch = batch_id(w)
    run_at = asof_str(w)

    monthly_rows = []
    monthly_doc = {}
    cost = rollup(mo.allin, idx, n)
    for u in ("rep_assigned", "all_appts"):
        a = _universe(mo, u)
        agg = {k: rollup(v, idx, n) for k, v in a.items()}  # month x market
        for pi, p in enumerate(uniq):
            settled = p != cur_period
            for mi in list(range(NM)) + [None]:
                sel = (lambda arr, pi=pi: arr[pi].sum()) if mi is None else (lambda arr, pi=pi, mi=mi: arr[pi, mi])
                iss, net_iss, demo = int(sel(agg["iss"])), int(sel(agg["net_iss"])), int(sel(agg["demo"]))
                close_c, pre_c, can_c, cred_c, net_c = (int(sel(agg[k])) for k in ("close", "prenet", "cancel", "credit", "net"))
                cst = int(sel(cost))
                net_basis = int(round(net_c / net_iss)) if net_iss else None
                net_pp = int(round((net_c + pre_c) / net_iss)) if net_iss else None
                pct = round(100.0 * cst / (net_c + pre_c), 2) if (net_c + pre_c) > 0 else None
                tier, dec = _tier(pct)
                if not settled:
                    dec = None
                office = "COMPANY" if mi is None else MARKETS[mi].id
                row = {
                    "period": p, "office": office, "universe": u, "iss": iss, "net_iss": net_iss, "demo": demo,
                    "close_n": int(sel(agg["close_n"])), "close_cents": close_c, "prenet_cents": pre_c, "cancel_cents": can_c,
                    "credit_decl_cents": cred_c, "net_cents": net_c, "net_only_cents": net_basis, "net_plus_pending_cents": net_pp,
                    "marketing_cost_pct": pct, "target_pct": TARGET_PCT,
                    "settle_status": "SETTLED" if settled else "MONTH_TO_DATE",
                    "cost_status": "complete" if settled else f"in progress: every cost keyed through {asof}",
                    "trust_flag": "deterministic" if settled else "provisional", "target_band": tier,
                    "band_decidable": dec,
                    "headroom_at_target_cents": int(round(net_pp * TARGET_PCT / 100)) if net_pp else None,
                    "cost_per_issued_cents": int(round(cst / net_iss)) if net_iss else None,
                    "no_rep_appts": int(sel(agg["no_rep_appts"])), "no_rep_sales": int(sel(agg["no_rep_sales"])),
                    "sales_without_job": 0, "zero_amount_sales": 0,
                    "dup_sale_appts": int(np.random.default_rng(pi * 31 + (9 if mi is None else mi)).integers(0, 2)),
                    "as_of": asof, "confidence": "deterministic" if settled else "provisional", "export_batch_id": batch,
                }
                monthly_rows.append(row)
                if u == "rep_assigned":
                    monthly_doc[(p, office)] = row
    cols = {k: [r[k] for r in monthly_rows] for k in monthly_rows[0]}
    fw.write("efficiency__monthly", table(cols, [
        ("period", S), ("office", S), ("universe", S), ("iss", I64), ("net_iss", I64), ("demo", I64), ("close_n", I64),
        ("close_cents", I64), ("prenet_cents", I64), ("cancel_cents", I64), ("credit_decl_cents", I64), ("net_cents", I64),
        ("net_only_cents", I64), ("net_plus_pending_cents", I64), ("marketing_cost_pct", F64), ("target_pct", F64),
        ("settle_status", S), ("cost_status", S), ("trust_flag", S), ("target_band", S), ("band_decidable", I64),
        ("headroom_at_target_cents", I64), ("cost_per_issued_cents", I64), ("no_rep_appts", I64), ("no_rep_sales", I64),
        ("sales_without_job", I64), ("zero_amount_sales", I64), ("dup_sale_appts", I64), ("as_of", S), ("confidence", S),
        ("export_batch_id", S)]))

    rows = {k: [] for k in ["period", "date", "office", "universe", "iss", "net_iss", "demo", "close_n", "close_cents", "prenet_cents",
                            "cancel_cents", "credit_decl_cents", "net_cents", "target_pct", "as_of", "confidence", "export_batch_id"]}
    D = wp.D
    dstr = [d.isoformat() for d in wp.days]
    for u in ("rep_assigned", "all_appts"):
        off = (wp.start - w.start).days
        a = {k: v[off:] for k, v in _universe(mo, u).items()}  # the full world sliced, so daily rows tie to the monthly rows
        for office, mi in [("COMPANY", None)] + [(m.id, i) for i, m in enumerate(MARKETS)]:
            get = (lambda arr: arr.sum(axis=1)) if mi is None else (lambda arr, mi=mi: arr[:, mi])
            rows["period"].extend(dstr)
            rows["date"].extend(dstr)
            rows["office"].extend([office] * D)
            rows["universe"].extend([u] * D)
            for k_out, k_in in (("iss", "iss"), ("net_iss", "net_iss"), ("demo", "demo"), ("close_n", "close_n"),
                                ("close_cents", "close"), ("prenet_cents", "prenet"), ("cancel_cents", "cancel"),
                                ("credit_decl_cents", "credit"), ("net_cents", "net")):
                rows[k_out].extend(get(a[k_in]).astype(np.int64).tolist())
            rows["target_pct"].extend([TARGET_PCT] * D)
            rows["as_of"].extend([asof] * D)
            rows["confidence"].extend(["deterministic"] * D)
            rows["export_batch_id"].extend([batch] * D)
    fw.write("efficiency__daily", table(rows, [
        ("period", S), ("date", S), ("office", S), ("universe", S), ("iss", I64), ("net_iss", I64), ("demo", I64), ("close_n", I64),
        ("close_cents", I64), ("prenet_cents", I64), ("cancel_cents", I64), ("credit_decl_cents", I64), ("net_cents", I64),
        ("target_pct", F64), ("as_of", S), ("confidence", S), ("export_batch_id", S)]))

    # tie-out: the monthly feed against a second computation from the daily rows
    rows = {k: [] for k in ["period", "grain", "office", "column", "report_value", "rebuild_value", "diff", "tolerance", "result",
                            "residual_id", "run_at", "as_of", "export_batch_id"]}
    a = _universe(mo, "rep_assigned")
    monthly_by_k = {"net_iss": "net_iss", "net": "net_cents", "close": "close_cents"}
    for p in uniq[-8:]:
        pidx = uniq.index(p)
        for office, mi in [("COMPANY", None), ("Harborview", 0), ("Stonebridge", 2)]:
            for cname, k, tol in (("net_iss", "net_iss", 0.0), ("net_cents", "net", 100.0), ("close_cents", "close", 100.0)):
                ru = rollup(a[k], idx, n)
                rebuilt = float(ru[pidx].sum() if mi is None else ru[pidx, mi])
                report = float(monthly_doc[(p, office)][monthly_by_k[k]])
                diff = report - rebuilt
                result, resid = "PASS", None
                if p == uniq[-3] and office == "Stonebridge" and cname == "net_cents":
                    # a registered, explained residual: a refund posted after the daily export closed
                    report, diff, result, resid = rebuilt + 4200.0, 4200.0, "PASS_RESIDUAL", "RES-2026-02"
                rows["period"].append(p)
                rows["grain"].append("month")
                rows["office"].append(office)
                rows["column"].append(cname)
                rows["report_value"].append(report)
                rows["rebuild_value"].append(rebuilt)
                rows["diff"].append(diff)
                rows["tolerance"].append(tol)
                rows["result"].append(result)
                rows["residual_id"].append(resid)
                rows["run_at"].append(run_at)
                rows["as_of"].append(asof)
                rows["export_batch_id"].append(batch)
    fw.write("efficiency__tieout", table(rows, [
        ("period", S), ("grain", S), ("office", S), ("column", S), ("report_value", F64), ("rebuild_value", F64), ("diff", F64),
        ("tolerance", F64), ("result", S), ("residual_id", S), ("run_at", S), ("as_of", S), ("export_batch_id", S)]))
    return {"months": uniq, "monthly": monthly_doc}


# --------------------------------------------------------------------------------------
# dm_* feeds
# --------------------------------------------------------------------------------------

OFFLINE_NAMES = {"DMA": ("Direct mail (print and postage)", "vendor-mail"), "TVR": ("Regional TV flights", "vendor-tv"),
                 "EVT": ("Home show booths", "vendor-shows")}


def write_dm_spend(fw: FeedWriter, w: World) -> None:
    D = w.D
    asof = asof_str(w)
    batch = batch_id(w)
    cols = {k: [] for k in ["spend_date", "platform", "account_id", "campaign_id", "market", "crm_source_code", "crm_subsource_id",
                            "crm_subsource_descr", "row_type", "amount_cents", "media_cents", "fee_cents", "non_media_cents",
                            "confidence", "attribution_basis", "impressions", "clicks", "conversions", "bucket", "operator",
                            "display_name", "as_of", "export_batch_id"]}
    dstr = [d.isoformat() for d in w.days]

    def conf_tail(n_prov: int):
        c = np.array(["deterministic"] * D, dtype=object)
        c[D - n_prov:] = "provisional"
        return c.tolist()

    def emit(platform, account, campaign, market, sub, rt, amt, imps, clks, conv, display, conf, basis="recorded in the CRM", *, src=None, subid=None, subdesc=None, bucket=None, operator=None):
        amt = np.asarray(amt, dtype=np.int64)
        keep = np.nonzero(amt > 0)[0]
        k = len(keep)
        if not k:
            return
        pick = lambda seq: [seq[i] for i in keep]
        cols["spend_date"].extend(pick(dstr))
        cols["platform"].extend([platform] * k)
        cols["account_id"].extend([account] * k)
        cols["campaign_id"].extend([campaign] * k)
        cols["market"].extend([market] * k)
        cols["crm_source_code"].extend([src or sub[2]] * k)
        cols["crm_subsource_id"].extend([subid or sub[0]] * k)
        cols["crm_subsource_descr"].extend([subdesc or sub[1]] * k)
        cols["row_type"].extend([rt] * k)
        cols["amount_cents"].extend(amt[keep].tolist())
        cols["media_cents"].extend(amt[keep].tolist() if rt == "media" else [0] * k)
        cols["fee_cents"].extend(amt[keep].tolist() if rt == "fee" else [0] * k)
        cols["non_media_cents"].extend(amt[keep].tolist() if rt == "non_media" else [0] * k)
        cols["confidence"].extend(pick(conf))
        cols["attribution_basis"].extend([basis] * k)
        cols["impressions"].extend(np.asarray(imps, dtype=np.int64)[keep].tolist())
        cols["clicks"].extend(np.asarray(clks, dtype=np.int64)[keep].tolist())
        cols["conversions"].extend(np.round(np.asarray(conv, dtype=float)[keep], 2).tolist())
        cols["bucket"].extend([bucket or sub[3]] * k)
        cols["operator"].extend([operator or sub[4]] * k)
        cols["display_name"].extend([display] * k)
        cols["as_of"].extend([asof] * k)
        cols["export_batch_id"].extend([batch] * k)

    zero = np.zeros(D)
    tail = conf_tail(1)
    for c in w.campaigns:
        sub = SUBSOURCES[SIDX[c.subsource]]
        for mid in c.markets:
            mi = MIDX[mid]
            emit(c.platform, ACCOUNTS[c.platform][0], c.id, mid, sub, "media", w.a_spend[c.idx, :, mi], w.a_imps[c.idx, :, mi],
                 w.a_clicks[c.idx, :, mi], w.a_conv[c.idx, :, mi], ACCOUNTS[c.platform][1], tail)
    for code in ("MAA", "BAA"):
        si = SIDX[code]
        sub = SUBSOURCES[si]
        for mi, m in enumerate(MARKETS):
            emit(sub[5], ACCOUNTS[sub[5]][0], "agency-fee", m.id, sub, "fee", w.fee[:, mi, si], zero, zero, zero,
                 f"{AGENCY} fee, {int(AGENCY_FEE_RATE * 100)} percent of media", tail)
    for code in ("DMA", "TVR", "EVT"):
        si = SIDX[code]
        sub = SUBSOURCES[si]
        for mi, m in enumerate(MARKETS):
            emit("offline", OFFLINE_NAMES[code][1], f"{code.lower()}-{m.id[2:].lower()}", m.id, sub, "non_media",
                 w.off_spend[:, mi, si], zero, zero, zero, OFFLINE_NAMES[code][0], conf_tail(7))
    emit("tools", "tools-stack", "marketing-tools", "ALL", None, "non_media", w.tools_cents, zero, zero, zero,
         "Analytics, CRM and creative tools", tail, src="OVERHEAD", subid="TOOLS", subdesc="Marketing tools and software",
         bucket="tools", operator="Various")
    emit("marketing_labor", "payroll", "marketing-labor", "COMPANY", None, "labor", w.labor_cents, zero, zero, zero,
         "Marketing labor, ruled constant 40000 a month", ["ruled"] * D, basis="ruled_constant", src="OVERHEAD", subid="LABOR",
         subdesc="Marketing labor, ruled constant", bucket="labor", operator=IN_HOUSE)
    fw.write("dm_spend_daily", table(cols, [
        ("spend_date", S), ("platform", S), ("account_id", S), ("campaign_id", S), ("market", S), ("crm_source_code", S),
        ("crm_subsource_id", S), ("crm_subsource_descr", S), ("row_type", S), ("amount_cents", I64), ("media_cents", I64),
        ("fee_cents", I64), ("non_media_cents", I64), ("confidence", S), ("attribution_basis", S), ("impressions", I64),
        ("clicks", I64), ("conversions", F64), ("bucket", S), ("operator", S), ("display_name", S), ("as_of", S),
        ("export_batch_id", S)]))


def write_dm_chain(fw: FeedWriter, w: World) -> None:
    D = w.D
    asof = asof_str(w)
    batch = batch_id(w)
    cols = {k: [] for k in ["date", "market", "subsource_code", "subsource_name", "source_code", "raw_contacts", "sets", "issues",
                            "demos", "sales", "sold_cents", "net_cents", "cancels", "cancel_gross_cents", "net_basis",
                            "unruled_appointments", "spend_cents", "spend_note", "bucket", "operator", "confidence", "as_of",
                            "export_batch_id"]}
    dstr = [d.isoformat() for d in w.days]
    for si, sub in enumerate(SUBSOURCES):
        for mi, m in enumerate(MARKETS):
            lead = w.leads[:, mi, si, :].sum(axis=1)
            spend = w.leaf_spend[:, mi, si, :].sum(axis=1)
            idxs = np.nonzero((lead > 0) | (spend > 0))[0]
            k = len(idxs)
            if not k:
                continue
            g = lambda a: a[:, mi, si, :].sum(axis=1)[idxs]
            cols["date"].extend([dstr[i] for i in idxs])
            cols["market"].extend([m.id] * k)
            cols["subsource_code"].extend([sub[0]] * k)
            cols["subsource_name"].extend([sub[1]] * k)
            cols["source_code"].extend([sub[2]] * k)
            cols["raw_contacts"].extend(lead[idxs].tolist())
            cols["sets"].extend(g(w.sets).tolist())
            cols["issues"].extend(g(w.issues).tolist())
            cols["demos"].extend(g(w.demos).tolist())
            cols["sales"].extend(g(w.sales).tolist())
            sold, canc = g(w.sold), g(w.cancel_c)
            cols["sold_cents"].extend(sold.tolist())
            cols["net_cents"].extend((sold - canc).tolist())
            cols["cancels"].extend(g(w.cancels).tolist())
            cols["cancel_gross_cents"].extend(canc.tolist())
            cols["net_basis"].extend(["net of cancels, booking month"] * k)
            cols["unruled_appointments"].extend(g(w.unruled).tolist())
            if sub[3] == "unpaid":
                cols["spend_cents"].extend([None] * k)
                cols["spend_note"].extend(["unpaid source: no cost to map"] * k)
            else:
                cols["spend_cents"].extend(spend[idxs].tolist())
                cols["spend_note"].extend([None] * k)
            cols["bucket"].extend([sub[3]] * k)
            cols["operator"].extend([sub[4]] * k)
            conf = np.array(["deterministic"] * k, dtype=object)
            conf[idxs >= D - 2] = "provisional"
            cols["confidence"].extend(conf.tolist())
            cols["as_of"].extend([asof] * k)
            cols["export_batch_id"].extend([batch] * k)
    fw.write("dm_source_chain_daily", table(cols, [
        ("date", S), ("market", S), ("subsource_code", S), ("subsource_name", S), ("source_code", S), ("raw_contacts", I64),
        ("sets", I64), ("issues", I64), ("demos", I64), ("sales", I64), ("sold_cents", I64), ("net_cents", I64), ("cancels", I64),
        ("cancel_gross_cents", I64), ("net_basis", S), ("unruled_appointments", I64), ("spend_cents", I64), ("spend_note", S),
        ("bucket", S), ("operator", S), ("confidence", S), ("as_of", S), ("export_batch_id", S)]))


def write_dm_misc(fw: FeedWriter, w: World, mo: Money, target: dict) -> None:
    asof = asof_str(w)
    batch = batch_id(w)
    eom = month_end(w.end)
    all_days = [w.start + timedelta(days=i) for i in range((eom - w.start).days + 1)]
    cum = defaultdict(float)
    rows = {k: [] for k in ["the_date", "is_working_day", "weight", "month", "working_day_of_month", "export_batch_id"]}
    for d in all_days:
        m = f"{d.year:04d}-{d.month:02d}"
        cum[m] += working_weight(d)
        rows["the_date"].append(d.isoformat())
        rows["is_working_day"].append(d.weekday() < 5)
        rows["weight"].append(working_weight(d))
        rows["month"].append(m)
        rows["working_day_of_month"].append(cum[m])
        rows["export_batch_id"].append(batch)
    fw.write("dm_working_day", table(rows, [("the_date", S), ("is_working_day", B), ("weight", F64), ("month", S),
                                            ("working_day_of_month", F64), ("export_batch_id", S)]))

    reg = [
        ("google_ads", ACCOUNTS["google_ads"][0], ACCOUNTS["google_ads"][1], "inhouse", IN_HOUSE, "Paid media operator"),
        ("meta", ACCOUNTS["meta"][0], ACCOUNTS["meta"][1], "inhouse", IN_HOUSE, "Paid media operator"),
        ("meta", "agency-meta-sheet", "Meta Ads run by the agency", "vendor", AGENCY, "Agency account lead"),
        ("microsoft_ads", ACCOUNTS["microsoft_ads"][0], ACCOUNTS["microsoft_ads"][1], "vendor", AGENCY, "Agency account lead"),
        ("offline", "vendor-mail", "Direct mail vendor", "offline", IN_HOUSE, "Marketing lead"),
        ("offline", "vendor-tv", "Regional TV station", "offline", IN_HOUSE, "Marketing lead"),
        ("offline", "vendor-shows", "Home show organizers", "offline", IN_HOUSE, "Marketing lead"),
        ("tools", "tools-stack", "Marketing tools and software", "tools", "Various", "Marketing lead"),
        ("marketing_labor", "payroll", "Marketing labor (ruled constant)", "labor", IN_HOUSE, "Finance"),
    ]
    n = len(reg)
    fw.write("dm_ownership", table({
        "platform": [r[0] for r in reg], "account_id": [r[1] for r in reg], "display_name": [r[2] for r in reg],
        "bucket": [r[3] for r in reg], "operator": [r[4] for r in reg], "owner_role": [r[5] for r in reg],
        "register_version": ["demo-1.0"] * n, "register_signed_at": [ts_iso(w.end - timedelta(days=21), 15, 0)] * n,
        "export_batch_id": [batch] * n,
    }, [("platform", S), ("account_id", S), ("display_name", S), ("bucket", S), ("operator", S), ("owner_role", S),
        ("register_version", S), ("register_signed_at", S), ("export_batch_id", S)]))

    uniq = target["months"]
    rows = {k: [] for k in ["month", "settle_status", "trust_flag", "matrix_complete", "fail_rows", "waiting_on", "matrix_run_at",
                            "strip_text", "as_of", "export_batch_id"]}
    for p in uniq:
        cur = p == uniq[-1]
        rows["month"].append(p)
        rows["settle_status"].append("MONTH_TO_DATE" if cur else "SETTLED")
        rows["trust_flag"].append("provisional" if cur else "deterministic")
        rows["matrix_complete"].append(not cur)
        rows["fail_rows"].append(1 if cur else 0)
        rows["waiting_on"].append("the agency's month-end invoice" if cur else None)
        rows["matrix_run_at"].append(asof)
        rows["strip_text"].append("cost record incomplete, waiting on the agency's month-end invoice" if cur else "complete")
        rows["as_of"].append(asof)
        rows["export_batch_id"].append(batch)
    fw.write("dm_cost_status", table(rows, [
        ("month", S), ("settle_status", S), ("trust_flag", S), ("matrix_complete", B), ("fail_rows", I64), ("waiting_on", S),
        ("matrix_run_at", S), ("strip_text", S), ("as_of", S), ("export_batch_id", S)]))

    cur, prev = uniq[-1], uniq[-2]
    gm = target["monthly"]
    chk = []

    def add(check_id, stage, period, scope, expected, observed, tol, result, evidence):
        chk.append({"run_at": asof, "check_id": check_id, "stage": stage, "period": period, "scope": scope, "expected": expected,
                    "observed": observed, "tolerance": tol, "result": result, "evidence": evidence, "feed_as_of": asof,
                    "export_batch_id": batch})

    labels = month_labels(w.days)
    for p in (cur, prev):
        rows_in = [i for i, lab in enumerate(labels) if lab == p]
        tot = float(mo.ad_spend[rows_in].sum() / 100.0)
        add("Spend by owner adds up to the total", "spend", p, "ALL", tot, tot, 1.0, "PASS", "in-house + agency + offline buckets equal the feed total")
        add("Platform totals match recorded spend", "spend", p, "ALL", tot, tot, 1.0, "PASS", "platform totals equal the recorded spend rows")
        add("Pacing recomputed a second way", "report", p, "ALL", tot, tot, 1.0, "PASS", "month to date over elapsed working days times total, recomputed")
        v = float(gm[(p, "COMPANY")]["net_plus_pending_cents"] or 0) / 100.0
        add("Net revenue per appointment matches the target feed", "sr", p, "COMPANY", v, v, 0.01, "PASS", "marketing cost target feed, company, appointments with a rep")
    add("Agency sheet matches the invoice", "spend", prev, "agency", 28410.0, 28410.0, 1.0, "PASS", "agency sheet equals the invoice")
    add("Agency sheet matches the invoice", "spend", cur, "agency", 19120.0, 19050.0, 100.0, "PASS_RESIDUAL",
        "agency invoice still open for the month; the difference is 70 dollars of unposted fees")
    fw.write("dm_tieout", table({k: [c[k] for c in chk] for k in chk[0]}, [
        ("run_at", S), ("check_id", S), ("stage", S), ("period", S), ("scope", S), ("expected", F64), ("observed", F64),
        ("tolerance", F64), ("result", S), ("evidence", S), ("feed_as_of", S), ("export_batch_id", S)]))


# --------------------------------------------------------------------------------------
# windows, pacing and platform diagnostics
# --------------------------------------------------------------------------------------


class Series:
    """Daily numerator and denominator series by scope, for dm_windows."""

    def __init__(self, w: World):
        self.w = w
        self.camp_bucket = np.array([SUBSOURCES[SIDX[c.subsource]][3] for c in w.campaigns])
        self.camp_plat = np.array([c.platform for c in w.campaigns])
        self.camp_kind = np.array([c.kind for c in w.campaigns])
        self.sub_bucket = np.array([s[3] for s in SUBSOURCES])
        self.sub_source = np.array([s[2] for s in SUBSOURCES])
        self.sub_code = np.array([s[0] for s in SUBSOURCES])
        self.leaf = {"spend": w.leaf_spend, "leads": w.leads, "sets": w.sets, "issues": w.issues, "demos": w.demos, "sales": w.sales}
        sh = lambda arr2d, c: arr2d[c.idx][:, None] * w.share[c.idx]
        self.camp = {
            "spend": w.a_spend.astype(float), "imps": w.a_imps.astype(float), "clicks": w.a_clicks.astype(float), "conv": w.a_conv,
            "reach": np.stack([sh(w.reach, c) for c in w.campaigns]).astype(float),
            "vviews": np.stack([sh(w.video_views, c) for c in w.campaigns]).astype(float),
            "is_w": np.stack([sh(np.nan_to_num(w.imp_share, nan=0.0) * w.imps, c) for c in w.campaigns]),
            "is_den": np.stack([sh(np.where(np.isnan(w.imp_share), 0, w.imps), c) for c in w.campaigns]),
        }

    def leaf_series(self, field, kind, scope, sub=None):
        sel = np.ones(NS, dtype=bool)
        mi = None
        if kind == "market":
            mi = MIDX[scope]
        elif kind == "bucket":
            sel = self.sub_bucket == scope
        elif kind == "source":
            sel = self.sub_source == scope
        if sub is not None:
            sel = sel & (self.sub_code == sub)
        a = self.leaf[field][:, :, sel, :].astype(float)
        a = a.sum(axis=(1, 2, 3)) if mi is None else a[:, mi].sum(axis=(1, 2))
        return a

    def camp_series(self, field, kind, scope, only_kind=None, only_platform=None):
        a = self.camp[field]
        sel = np.ones(a.shape[0], dtype=bool)
        mi = None
        if kind == "platform":
            sel &= self.camp_plat == scope
        elif kind == "bucket":
            sel &= self.camp_bucket == scope
        elif kind == "market":
            mi = MIDX[scope]
        if only_kind is not None:
            sel &= self.camp_kind == only_kind
        if only_platform is not None:
            sel &= self.camp_plat == only_platform
        a = a[sel]
        a = a.sum(axis=2) if mi is None else a[:, :, mi]
        return a.sum(axis=0)


def write_dm_windows(fw: FeedWriter, w: World, target: dict) -> None:
    sr = Series(w)
    end, first = w.end, w.start
    batch = batch_id(w)
    through = iso(end)
    idx = lambda d: (d - w.start).days

    mtd_start = date(end.year, end.month, 1)
    prev_m_start = date(end.year - (end.month == 1), 12 if end.month == 1 else end.month - 1, 1)
    span = (end - mtd_start).days
    leap_fix = (end.month == 2 and end.day == 29)
    yoy_end = end.replace(year=end.year - 1, day=28) if leap_fix else end.replace(year=end.year - 1)
    yoy_start = mtd_start.replace(year=end.year - 1)
    week_start = end - timedelta(days=end.weekday())
    WIN = {
        "mtd": (mtd_start, end, None, None),
        "wow": (week_start, end, week_start - timedelta(days=7), end - timedelta(days=7)),
        "mom": (mtd_start, end, prev_m_start, prev_m_start + timedelta(days=span)),
        "yoy": (mtd_start, end, yoy_start, yoy_end),
    }

    def total(series, a, b):
        if a is None or a < first or b > end:
            return None
        return float(series[idx(a):idx(b) + 1].sum())

    def value(num, den, mult, a, b):
        n_ = total(num, a, b)
        if n_ is None:
            return None
        if den is None:
            return n_ * mult
        d_ = total(den, a, b)
        if not d_:
            return None
        return mult * n_ / d_

    company = [("company", "ALL")]
    markets = [("market", m.id) for m in MARKETS]
    buckets = [("bucket", b) for b in ("inhouse", "vendor", "offline")]
    plats = [("platform", p) for p in PLATFORMS]
    sources = [("source", s) for s in SOURCE_CODES]
    k_ = lambda k: "company" if k == "company" else k

    def spend_series(k, s):
        if k == "platform":
            return sr.camp_series("spend", "platform", s)
        if k == "bucket" and s == "tools":
            return w.tools_cents.astype(float)
        return sr.leaf_series("spend", k_(k), s)

    spec = []  # (metric, kind, format, signed, scopes, builder(k, s) -> (num, den, mult))
    spec.append(("spend", "sum", "dollars", True, company + markets + buckets + [("bucket", "tools")] + plats + sources,
                 lambda k, s: (spend_series(k, s), None, 0.01)))
    for field, name in (("leads", "raw_contacts"), ("sets", "sets"), ("issues", "issues"), ("demos", "demos"), ("sales", "sales")):
        spec.append((name, "sum", "count", True, company + markets + buckets + sources,
                     (lambda f_: lambda k, s: (sr.leaf_series(f_, k_(k), s), None, 1.0))(field)))
    for name, den_field in (("cost_per_lead", "leads"), ("cost_per_set", "sets"), ("cost_per_issue", "issues"), ("cost_per_sale", "sales")):
        spec.append((name, "ratio", "dollars", True, company + markets + buckets + sources,
                     (lambda f_: lambda k, s: (sr.leaf_series("spend", k_(k), s), sr.leaf_series(f_, k_(k), s), 0.01))(den_field)))
    spec.append(("close_rate", "ratio", "percent", True, company + markets + buckets + sources,
                 lambda k, s: (sr.leaf_series("sales", k_(k), s), sr.leaf_series("demos", k_(k), s), 100.0)))
    diag = company + markets + buckets + plats
    spec.append(("ctr", "ratio", "percent", True, diag,
                 lambda k, s: (sr.camp_series("clicks", k_(k), s), sr.camp_series("imps", k_(k), s), 100.0)))
    spec.append(("cpc", "ratio", "dollars", True, diag,
                 lambda k, s: (sr.camp_series("spend", k_(k), s), sr.camp_series("clicks", k_(k), s), 0.01)))
    spec.append(("conversion_rate", "ratio", "percent", True, diag,
                 lambda k, s: (sr.camp_series("conv", k_(k), s), sr.camp_series("clicks", k_(k), s), 100.0)))
    g_scopes = company + markets[:4] + [("platform", "google_ads"), ("bucket", "inhouse")]
    for name, mult in (("is_lost_budget", 45.0), ("is_lost_rank", 55.0)):
        spec.append((name, "ratio", "percent", True, g_scopes,
                     (lambda m_: lambda k, s: (sr.camp_series("is_den", k_(k), s, only_platform="google_ads") - sr.camp_series("is_w", k_(k), s, only_platform="google_ads"),
                                               sr.camp_series("is_den", k_(k), s, only_platform="google_ads"), m_))(mult)))
    spec.append(("cpm", "ratio", "dollars", True, diag,
                 lambda k, s: (sr.camp_series("spend", k_(k), s), sr.camp_series("imps", k_(k), s), 10.0)))
    m_scopes = company + markets + [("platform", "meta"), ("bucket", "inhouse"), ("bucket", "vendor")]
    spec.append(("frequency", "ratio", "count", True, m_scopes,
                 lambda k, s: (sr.camp_series("imps", k_(k), s, only_platform="meta"), sr.camp_series("reach", k_(k), s, only_platform="meta"), 1.0)))
    spec.append(("hook_rate", "ratio", "percent", True, m_scopes,
                 lambda k, s: (sr.camp_series("vviews", k_(k), s, only_kind="video", only_platform="meta"),
                               sr.camp_series("imps", k_(k), s, only_kind="video", only_platform="meta"), 100.0)))
    spec.append(("cost_per_set_d35", "ratio", "dollars", False, company + markets + [("platform", "meta")],
                 lambda k, s: (sr.leaf_series("spend", "company" if k == "platform" else k_(k), s, sub="MAI"),
                               sr.leaf_series("sets", "company" if k == "platform" else k_(k), s, sub="MAI"), 0.01)))

    rows = {k: [] for k in ["metric", "scope_kind", "scope", "window", "value", "prior_value", "delta", "delta_pct", "kind", "format",
                            "is_ratio", "signed", "cur_start", "cur_end", "prior_start", "prior_end", "cur_days", "prior_days",
                            "partial", "withheld_reason", "data_through", "export_batch_id"]}
    for metric, kind, fmt, signed, scopes, build in spec:
        for sk, sc in scopes:
            num, den, mult = build(sk, sc)
            for wname, (ca, cb, pa_, pb_) in WIN.items():
                v = value(num, den, mult, ca, cb)
                pv = value(num, den, mult, pa_, pb_) if pa_ is not None else None
                if v is None:
                    continue
                delta = None if pv is None else v - pv
                dpct = None if (delta is None or kind == "ratio" or not pv) else 100.0 * delta / pv
                rows["metric"].append(metric)
                rows["scope_kind"].append(sk)
                rows["scope"].append(sc)
                rows["window"].append(wname)
                rows["value"].append(round(v, 4))
                rows["prior_value"].append(None if pv is None else round(pv, 4))
                rows["delta"].append(None if delta is None else round(delta, 4))
                rows["delta_pct"].append(None if dpct is None else round(dpct, 3))
                rows["kind"].append(kind)
                rows["format"].append(fmt)
                rows["is_ratio"].append(kind == "ratio")
                rows["signed"].append(bool(signed))
                rows["cur_start"].append(iso(ca))
                rows["cur_end"].append(iso(cb))
                rows["prior_start"].append(iso(pa_) if pa_ else None)
                rows["prior_end"].append(iso(pb_) if pb_ else None)
                rows["cur_days"].append(working_days(ca, cb))
                rows["prior_days"].append(working_days(pa_, pb_) if pa_ else None)
                rows["partial"].append(wname != "yoy")
                rows["withheld_reason"].append(None)
                rows["data_through"].append(through)
                rows["export_batch_id"].append(batch)
    # month-grain metrics: the warehouse fact behind them holds settled months only, so the "current" window is the
    # latest settled month, compared with the month before and the same month a year earlier; there is no weekly window
    months = target["months"]
    cur_p, prev_p = months[-2], months[-3]
    yoy_p = months[-14] if len(months) >= 14 else None
    gm = target["monthly"]

    def mval(metric, period, office):
        r = gm.get((period, office))
        if r is None:
            return None
        if metric == "net_basis":
            return None if r["net_plus_pending_cents"] is None else r["net_plus_pending_cents"] / 100.0
        return r["marketing_cost_pct"]

    for metric, fmt in (("net_basis", "dollars"), ("marketing_cost_pct", "percent")):
        for sk, sc, office in [("company", "ALL", "COMPANY")] + [("market", m.id, m.id) for m in MARKETS]:
            v = mval(metric, cur_p, office)
            for wname, pp in (("mtd", None), ("wow", None), ("mom", prev_p), ("yoy", yoy_p)):
                pv = mval(metric, pp, office) if pp else None
                withheld = "month-grain metric, no weekly window" if wname == "wow" else None
                val = None if wname == "wow" else v
                delta = None if (val is None or pv is None) else val - pv
                rows["metric"].append(metric)
                rows["scope_kind"].append(sk)
                rows["scope"].append(sc)
                rows["window"].append(wname)
                rows["value"].append(None if val is None else round(val, 4))
                rows["prior_value"].append(None if pv is None else round(pv, 4))
                rows["delta"].append(None if delta is None else round(delta, 4))
                rows["delta_pct"].append(None)
                rows["kind"].append("ratio")
                rows["format"].append(fmt)
                rows["is_ratio"].append(True)
                rows["signed"].append(True)
                rows["cur_start"].append(f"{cur_p}-01")
                rows["cur_end"].append(iso(month_end(date(int(cur_p[:4]), int(cur_p[5:]), 1))))
                rows["prior_start"].append(f"{pp}-01" if pp else None)
                rows["prior_end"].append(iso(month_end(date(int(pp[:4]), int(pp[5:]), 1))) if pp else None)
                rows["cur_days"].append(None)
                rows["prior_days"].append(None)
                rows["partial"].append(False)
                rows["withheld_reason"].append(withheld)
                rows["data_through"].append(through)
                rows["export_batch_id"].append(batch)
    fw.write("dm_windows", table(rows, [
        ("metric", S), ("scope_kind", S), ("scope", S), ("window", S), ("value", F64), ("prior_value", F64), ("delta", F64),
        ("delta_pct", F64), ("kind", S), ("format", S), ("is_ratio", B), ("signed", B), ("cur_start", S), ("cur_end", S),
        ("prior_start", S), ("prior_end", S), ("cur_days", F64), ("prior_days", F64), ("partial", B), ("withheld_reason", S),
        ("data_through", S), ("export_batch_id", S)]))


def write_dm_pacing(fw: FeedWriter, w: World, mo: Money) -> None:
    end = w.end
    batch = batch_id(w)
    through = iso(end)
    idx = lambda d: (d - w.start).days
    rows = {k: [] for k in ["metric", "scope_kind", "market", "month", "mtd_value", "working_days_elapsed", "working_days_total",
                            "rate_per_working_day", "projected_month", "budget", "projected_pct_of_budget", "budget_status",
                            "settle_status", "format", "data_through", "labor_mtd", "budget_basis_mtd", "export_batch_id"]}
    months = sorted({(d.year, d.month) for d in w.days})[-4:]
    company_budget = 262000.0
    counts = {"raw_contacts": mo.leads, "sets": mo.sets, "issues": mo.issues, "demos": mo.demos, "sales": mo.sales}
    for (y, m) in months:
        ms = date(y, m, 1)
        me = month_end(ms)
        cur = (y, m) == (end.year, end.month)
        last = end if cur else me
        el, tot = working_days(ms, last), working_days(ms, me)
        a, b = idx(ms), idx(last)
        labor_mtd = float(w.labor_cents[a:b + 1].sum()) / 100.0
        for metric, fmt in (("spend", "dollars"), ("raw_contacts", "count"), ("sets", "count"), ("issues", "count"), ("demos", "count"), ("sales", "count")):
            for scope in ["ALL"] + [mm.id for mm in MARKETS]:
                is_co_spend = metric == "spend" and scope == "ALL"
                if metric == "spend":
                    base = (mo.ad_spend.sum(axis=1) if scope == "ALL" else mo.ad_spend[:, MIDX[scope]]).astype(float)[a:b + 1].sum() / 100.0
                    tools = float(w.tools_cents[a:b + 1].sum()) / 100.0 if scope == "ALL" else 0.0
                    mtd = base + tools + (labor_mtd if is_co_spend else 0.0)
                else:
                    arr = counts[metric]
                    mtd = float((arr.sum(axis=1) if scope == "ALL" else arr[:, MIDX[scope]])[a:b + 1].sum())
                rate = mtd / el
                proj = rate * tot if cur else mtd
                budget, status = None, ("budget lines are spend only" if metric != "spend" else None)
                if metric == "spend":
                    if scope == "ALL":
                        budget, status = company_budget, "ruled"
                    elif scope == "Sunvale":
                        status = "no ruled budget line"
                    else:
                        budget, status = round(company_budget * MARKETS[MIDX[scope]].weight / 500.0) * 500.0, "ruled"
                labor_proj = (labor_mtd * tot / el if cur else labor_mtd) if is_co_spend else 0.0
                pct = 100.0 * (proj - labor_proj) / budget if budget else None
                rows["metric"].append(metric)
                rows["scope_kind"].append("company" if scope == "ALL" else "market")
                rows["market"].append(scope)
                rows["month"].append(f"{y:04d}-{m:02d}")
                rows["mtd_value"].append(round(mtd, 2))
                rows["working_days_elapsed"].append(el)
                rows["working_days_total"].append(tot)
                rows["rate_per_working_day"].append(round(rate, 2))
                rows["projected_month"].append(round(proj, 2))
                rows["budget"].append(budget)
                rows["projected_pct_of_budget"].append(None if pct is None else round(pct, 2))
                rows["budget_status"].append(status)
                rows["settle_status"].append("MONTH_TO_DATE" if cur else "SETTLED")
                rows["format"].append(fmt)
                rows["data_through"].append(through)
                rows["labor_mtd"].append(round(labor_mtd, 2) if is_co_spend else 0.0)
                rows["budget_basis_mtd"].append(round(mtd - (labor_mtd if is_co_spend else 0.0), 2))
                rows["export_batch_id"].append(batch)
    fw.write("dm_pacing", table(rows, [
        ("metric", S), ("scope_kind", S), ("market", S), ("month", S), ("mtd_value", F64), ("working_days_elapsed", F64),
        ("working_days_total", F64), ("rate_per_working_day", F64), ("projected_month", F64), ("budget", F64),
        ("projected_pct_of_budget", F64), ("budget_status", S), ("settle_status", S), ("format", S), ("data_through", S),
        ("labor_mtd", F64), ("budget_basis_mtd", F64), ("export_batch_id", S)]))


def write_dm_diag(fw: FeedWriter, w: World) -> None:
    asof = asof_str(w)
    batch = batch_id(w)
    rows = {k: [] for k in ["date", "platform", "market", "impressions", "clicks", "conversions", "spend_cents", "impression_share",
                            "is_lost_budget", "is_lost_rank", "frequency", "video_views", "as_of", "export_batch_id"]}
    dstr = [d.isoformat() for d in w.days]
    for p in PLATFORMS:
        cs = [c for c in w.campaigns if c.platform == p]
        imp = sum(w.imps[c.idx] for c in cs)
        clk = sum(w.clicks[c.idx] for c in cs)
        cv = sum(w.conv[c.idx] for c in cs)
        sp = sum(w.spend[c.idx] for c in cs)
        share = rch = None
        if p == "google_ads":
            isn = np.nansum([w.imp_share[c.idx] * w.imps[c.idx] for c in cs], axis=0)
            isd = np.sum([np.where(np.isnan(w.imp_share[c.idx]), 0, w.imps[c.idx]) for c in cs], axis=0)
            share = isn / np.maximum(isd, 1)
        if p == "meta":
            rch = sum(w.reach[c.idx] for c in cs)
        vv = sum(w.video_views[c.idx] for c in cs)
        for i in range(w.D):
            rows["date"].append(dstr[i])
            rows["platform"].append(p)
            rows["market"].append("ALL")
            rows["impressions"].append(int(imp[i]))
            rows["clicks"].append(int(clk[i]))
            rows["conversions"].append(round(float(cv[i]), 2))
            rows["spend_cents"].append(int(sp[i]))
            rows["impression_share"].append(None if share is None else round(float(share[i]), 4))
            rows["is_lost_budget"].append(None if share is None else round(float((1 - share[i]) * 0.45), 4))
            rows["is_lost_rank"].append(None if share is None else round(float((1 - share[i]) * 0.55), 4))
            rows["frequency"].append(None if (rch is None or rch[i] == 0) else round(float(imp[i] / rch[i]), 3))
            rows["video_views"].append(int(vv[i]))
            rows["as_of"].append(asof)
            rows["export_batch_id"].append(batch)
    fw.write("dm_platform_diag_daily", table(rows, [
        ("date", S), ("platform", S), ("market", S), ("impressions", I64), ("clicks", I64), ("conversions", F64), ("spend_cents", I64),
        ("impression_share", F64), ("is_lost_budget", F64), ("is_lost_rank", F64), ("frequency", F64), ("video_views", I64),
        ("as_of", S), ("export_batch_id", S)]))


# --------------------------------------------------------------------------------------
# spine monthly feeds
# --------------------------------------------------------------------------------------


def write_spine(fw: FeedWriter, w: World, mo: Money) -> dict:
    uniq, idx = mo.month_idx()
    n = len(uniq)
    asof = asof_str(w)
    f = {k: rollup(v, idx, n) for k, v in dict(leads=mo.leads, sets=mo.sets, issues=mo.issues, demos=mo.demos, sales=mo.sales,
                                                gross=mo.sold, net=mo.sold - mo.cancel).items()}
    rows = {k: [] for k in ["period", "office", "leads", "sets", "issues", "demos", "sales", "gross_cents", "net_cents", "as_of"]}
    for pi, p in enumerate(uniq):
        for mi, m in enumerate(MARKETS):
            rows["period"].append(p)
            rows["office"].append(m.id)
            for k_out, k_in in (("leads", "leads"), ("sets", "sets"), ("issues", "issues"), ("demos", "demos"), ("sales", "sales"),
                                ("gross_cents", "gross"), ("net_cents", "net")):
                rows[k_out].append(int(f[k_in][pi, mi]))
            rows["as_of"].append(asof)
    fw.write("spine_funnel_monthly", table(rows, [
        ("period", S), ("office", S), ("leads", I64), ("sets", I64), ("issues", I64), ("demos", I64), ("sales", I64),
        ("gross_cents", I64), ("net_cents", I64), ("as_of", S)]))

    rows = {k: [] for k in ["date", "office", "leads", "sets", "issues", "demos", "sales", "gross_cents", "net_cents"]}
    dstr = [d.isoformat() for d in w.days]
    for mi, m in enumerate(MARKETS):
        rows["date"].extend(dstr)
        rows["office"].extend([m.id] * w.D)
        for k_out, arr in (("leads", mo.leads), ("sets", mo.sets), ("issues", mo.issues), ("demos", mo.demos), ("sales", mo.sales),
                           ("gross_cents", mo.sold), ("net_cents", mo.sold - mo.cancel)):
            rows[k_out].extend(arr[:, mi].astype(np.int64).tolist())
    fw.write("spine_funnel_rows_daily", table(rows, [
        ("date", S), ("office", S), ("leads", I64), ("sets", I64), ("issues", I64), ("demos", I64), ("sales", I64),
        ("gross_cents", I64), ("net_cents", I64)]))

    iso_week = [f"wk-{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}" for d in w.days]
    mlabel = month_labels(w.days)
    lines = []  # (platform, source_key, row_type, fee_seq, day series in cents)
    for c in w.campaigns:
        sk = f"api:{c.platform}" if c.operator == IN_HOUSE else f"agency_sheet:{c.platform}"
        lines.append((c.platform, sk, "media", 0, w.spend[c.idx]))
    for code in ("MAA", "BAA"):
        sub = SUBSOURCES[SIDX[code]]
        lines.append((sub[5], f"agency_sheet:{sub[5]}", "fee", 1, w.fee[:, :, SIDX[code]].sum(axis=1)))
    for code, vendor in (("DMA", "invoice:mail-vendor"), ("TVR", "invoice:tv-station"), ("EVT", "invoice:show-organizers")):
        lines.append(("offline", vendor, "non_media", 0, w.off_spend[:, :, SIDX[code]].sum(axis=1)))
    agg = defaultdict(int)
    for plat, sk, rt, fs, ser in lines:
        for i in range(w.D):
            if ser[i] > 0:
                agg[(mlabel[i], plat, sk, rt, fs, iso_week[i])] += int(ser[i])
    keys = sorted(agg)
    sch = [("period", S), ("platform", S), ("source_key", S), ("row_type", S), ("fee_seq", I64), ("amount_cents", I64), ("batch_key", S)]
    fw.write("spine_spend_rows", table({
        "period": [k[0] for k in keys], "platform": [k[1] for k in keys], "source_key": [k[2] for k in keys],
        "row_type": [k[3] for k in keys], "fee_seq": [k[4] for k in keys], "amount_cents": [agg[k] for k in keys],
        "batch_key": [k[5] for k in keys]}, sch))
    mon = defaultdict(int)
    for k in keys:
        mon[(k[0], k[1], k[2], k[3], k[4])] += agg[k]
    mk = sorted(mon)
    fw.write("spine_spend_monthly", table({
        "period": [k[0] for k in mk], "platform": [k[1] for k in mk], "source_key": [k[2] for k in mk], "row_type": [k[3] for k in mk],
        "fee_seq": [k[4] for k in mk], "amount_cents": [mon[k] for k in mk], "batch_key": [f"month-{k[0]}" for k in mk]}, sch))
    spend_month = defaultdict(int)
    for kk, v in mon.items():
        spend_month[kk[0]] += v
    return {"months": uniq, "spend_month": dict(spend_month)}
