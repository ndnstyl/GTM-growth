"""Growth lens feeds: the same company totals cut five ways (market, source, brand, product, campaign type),
by month and by ISO week, plus lead cohorts and the month-landing projection.

Every lens except campaign type sums to the company total for its period; campaign type covers paid media only
and says so in its coverage state. Lens rows are roll-ups of the simulation, never a second computation.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from common import split_int, stream
from feeds_money import asof_str
from feedio import B, F64, FeedWriter, I64, S, table
from world import (
    BRAND_LABEL, BRANDS, CHANNELS, MARKETS, MIDX, LH, NM, NS, PRODUCTS, SIDX, SOURCE_CODES, SOURCE_LABEL, SUBSOURCES, SUB_SOURCE, World,
)

MEASURES = ["leads", "sets", "issues", "demos", "sales", "sold_cents", "cancel_cents", "cancels", "spend_cents", "impressions",
            "clicks", "calls", "connects"]


def _leaf_stack(w: World) -> dict:
    return {"leads": w.leads, "sets": w.sets, "issues": w.issues, "demos": w.demos, "sales": w.sales, "sold_cents": w.sold,
            "cancel_cents": w.cancel_c, "cancels": w.cancels, "spend_cents": w.leaf_spend, "impressions": w.leaf_imps,
            "clicks": w.leaf_clicks, "calls": w.calls, "connects": w.connects}


def _period_labels(w: World, kind: str):
    if kind == "month":
        return [f"{d.year:04d}-{d.month:02d}" for d in w.days]
    return [f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}" for d in w.days]


def _periods(w: World, kind: str):
    labels = _period_labels(w, kind)
    order = []
    for lab in labels:
        if lab not in order:
            order.append(lab)
    pos = {p: i for i, p in enumerate(order)}
    idx = np.array([pos[x] for x in labels])
    # a week the data only partly covers at the start is dropped, not shown as a small number
    keep = list(range(len(order)))
    if kind == "week" and w.start.weekday() != 0:
        keep = keep[1:]
    return order, idx, keep


def _agg(arr: np.ndarray, idx: np.ndarray, n: int) -> np.ndarray:
    out = np.zeros((n,) + arr.shape[1:], dtype=arr.dtype)
    np.add.at(out, idx, arr)
    return out


def _campaign_type_rows(w: World, idx, n, X) -> dict:
    """Attribute each paid leaf's outcomes to the campaigns that fed it, by their share of conversions in that
    market, then roll the campaigns up by channel."""
    C = len(w.campaigns)
    conv = np.zeros((n, C, NM))
    spend = np.zeros((n, C), dtype=np.int64)
    imps = np.zeros((n, C), dtype=np.int64)
    clicks = np.zeros((n, C), dtype=np.int64)
    for c in w.campaigns:
        lf = 0.85 if c.platform == "meta" else 0.95
        conv[:, c.idx, :] = _agg(w.a_conv[c.idx] * lf, idx, n)
        spend[:, c.idx] = _agg(w.spend[c.idx], idx, n)
        imps[:, c.idx] = _agg(w.imps[c.idx], idx, n)
        clicks[:, c.idx] = _agg(w.clicks[c.idx], idx, n)
    out = {ch[0]: {m: np.zeros(n) for m in MEASURES} for ch in CHANNELS}
    for p in range(n):
        den = {}
        for c in w.campaigns:
            key = (SIDX[c.subsource], BRANDS.index(c.brand))
            den.setdefault(key, np.zeros(NM))
            den[key] += conv[p, c.idx]
        for c in w.campaigns:
            si, bi = SIDX[c.subsource], BRANDS.index(c.brand)
            share = np.divide(conv[p, c.idx], den[(si, bi)], out=np.zeros(NM), where=den[(si, bi)] > 0)
            for m in ("leads", "sets", "issues", "demos", "sales", "sold_cents", "cancel_cents", "cancels", "calls", "connects"):
                out[c.channel][m][p] += float((X[m][p, :, si, bi] * share).sum())
            out[c.channel]["spend_cents"][p] += spend[p, c.idx]
            out[c.channel]["impressions"][p] += imps[p, c.idx]
            out[c.channel]["clicks"][p] += clicks[p, c.idx]
    return out


def write_lens(fw: FeedWriter, wf: World, wp: World) -> dict:
    """Monthly lenses read the full history (wf); weekly lenses and cohorts publish the window (wp)."""
    asof = asof_str(wp)
    docs = {}
    for kind, name in (("month", "lens_month"), ("week", "lens_week")):
        w = wf if kind == "month" else wp
        leaf = _leaf_stack(w)
        order, idx, keep = _periods(w, kind)
        n = len(order)
        X = {m: _agg(a, idx, n) for m, a in leaf.items()}  # period x market x source x brand
        rng = stream(w.seed, f"lens-{kind}")
        rows = {k: [] for k in ["period", "brand", "market", "lens_value", "lens", "sold_cents", "net_cents", "cancel_cents", "cancels", "sales",
                                "demos", "issues", "leads", "sets", "spend_cents", "impressions", "clicks", "calls", "connects",
                                "partial", "still_accruing", "crossfoot_ok", "coverage_state", "as_of"]}

        def emit(p, brand, market, lens_value, lens, vals, coverage="full"):
            rows["period"].append(order[p])
            rows["brand"].append(brand)
            rows["market"].append(market)
            rows["lens_value"].append(lens_value)
            rows["lens"].append(lens)
            for m in MEASURES:
                rows[m].append(int(round(vals[m])))
            rows["net_cents"].append(int(round(vals["sold_cents"] - vals["cancel_cents"])))
            cur = p == n - 1
            rows["partial"].append(cur)
            rows["still_accruing"].append(cur)
            rows["crossfoot_ok"].append(True)
            rows["coverage_state"].append(coverage)
            rows["as_of"].append(asof)

        ct = _campaign_type_rows(w, idx, n, X)
        pw = np.array([p[1] for p in PRODUCTS])
        pf = np.array([p[2] for p in PRODUCTS])
        for p in keep:
            tot = {m: X[m][p].sum() for m in MEASURES}
            # company by market
            for mi, m in enumerate(MARKETS):
                emit(p, "ALL", m.name, "company", "company", {k: X[k][p, mi].sum() for k in MEASURES})
            # source
            for sc in SOURCE_CODES:
                sel = SUB_SOURCE == SOURCE_CODES.index(sc)
                emit(p, "ALL", "ALL", SOURCE_LABEL[sc], "source", {k: X[k][p][:, sel, :].sum() for k in MEASURES})
            # brand
            for bi, b in enumerate(BRANDS):
                emit(p, BRAND_LABEL[b], "ALL", BRAND_LABEL[b], "brand", {k: X[k][p][:, :, bi].sum() for k in MEASURES})
            # product: shares of the company total, mix drifts a little by period
            mix = pw * (1.0 + 0.06 * np.sin(p * 0.9 + np.arange(len(pw))))
            parts = {}
            for k in MEASURES:
                weights = mix * pf if k in ("sold_cents", "cancel_cents") else mix
                parts[k] = split_int(int(tot[k]), weights)
            for pi, prod in enumerate(PRODUCTS):
                emit(p, "ALL", "ALL", prod[0], "product", {k: parts[k][pi] for k in MEASURES})
            # campaign type (paid media only)
            for ch_id, ch_name in CHANNELS:
                emit(p, "ALL", "ALL", ch_name, "campaign_type", {k: ct[ch_id][k][p] for k in MEASURES}, coverage="paid_only")
        fw.write(name, table(rows, [
            ("period", S), ("brand", S), ("market", S), ("lens_value", S), ("lens", S), ("sold_cents", I64), ("net_cents", I64),
            ("cancel_cents", I64), ("cancels", I64), ("sales", I64), ("demos", I64), ("issues", I64), ("leads", I64), ("sets", I64),
            ("spend_cents", I64), ("impressions", I64), ("clicks", I64), ("calls", I64), ("connects", I64), ("partial", B),
            ("still_accruing", B), ("crossfoot_ok", B), ("coverage_state", S), ("as_of", S)]))
        docs[kind] = {"order": order, "keep": keep, "X": X}

    _write_cohorts(fw, wp, docs["week"], asof)
    _write_projection(fw, wf, docs["month"], asof)
    return docs


def _write_cohorts(fw: FeedWriter, w: World, wk: dict, asof: str) -> None:
    rng = stream(w.seed, "cohorts")
    order, keep, X = wk["order"], wk["keep"], wk["X"]
    n = len(order)
    # overall lead-to-stage ratios by source, from the whole year
    tot = {m: X[m].sum(axis=(0, 1, 3)) for m in ("leads", "sets", "demos", "sales")}  # by subsource
    src_ratio = {}
    for sc in SOURCE_CODES:
        sel = SUB_SOURCE == SOURCE_CODES.index(sc)
        L = tot["leads"][sel].sum()
        src_ratio[sc] = tuple(float(tot[k][sel].sum() / max(L, 1)) for k in ("sets", "demos", "sales"))
    curve = {"30": (0.94, 0.80, 0.55), "60": (0.99, 0.96, 0.88), "90": (1.0, 1.0, 0.99)}
    # the Monday of each week
    first_monday = {}
    for d in w.days:
        key = f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}"
        first_monday.setdefault(key, d - timedelta(days=d.weekday()))
    rows = {k: [] for k in ["entry_iso_week", "brand", "market", "lens_value", "lens", "mark_days", "leads_n", "reached_set", "reached_demo",
                             "reached_sale", "mature", "small", "as_of"]}
    for p in keep:
        wk_end = first_monday[order[p]] + timedelta(days=6)
        for mark, (cs, cd, cl) in curve.items():
            if (w.end - wk_end).days < int(mark):
                continue
            groups = []
            for sc in SOURCE_CODES:
                sel = SUB_SOURCE == SOURCE_CODES.index(sc)
                groups.append(("source", SOURCE_LABEL[sc], "ALL", int(X["leads"][p][:, sel, :].sum()), src_ratio[sc]))
            for mi, m in enumerate(MARKETS):
                L = int(X["leads"][p, mi].sum())
                s_ = float(X["sets"][p, mi].sum() / max(L, 1))
                d_ = float(X["demos"][p, mi].sum() / max(L, 1))
                c_ = float(X["sales"][p, mi].sum() / max(L, 1))
                groups.append(("company", "company", m.name, L, (s_, d_, c_)))
            for lens, lv, mk, L, (rs, rd, rc) in groups:
                ps, pd_, pc = min(rs * cs, 0.95), min(rd * cd, 0.95), min(rc * cl, 0.95)
                if L <= 0:
                    continue
                rset = int(rng.binomial(L, ps))
                rdem = int(rng.binomial(rset, min(pd_ / max(ps, 1e-9), 1.0)))
                rsal = int(rng.binomial(rdem, min(pc / max(pd_, 1e-9), 1.0)))
                rows["entry_iso_week"].append(order[p])
                rows["brand"].append("ALL")
                rows["market"].append(mk)
                rows["lens_value"].append(lv)
                rows["lens"].append(lens)
                rows["mark_days"].append(mark)
                rows["leads_n"].append(L)
                rows["reached_set"].append(rset)
                rows["reached_demo"].append(rdem)
                rows["reached_sale"].append(rsal)
                rows["mature"].append(True)
                rows["small"].append(L < 30)
                rows["as_of"].append(asof)
    fw.write("lens_cohort", table(rows, [
        ("entry_iso_week", S), ("brand", S), ("market", S), ("lens_value", S), ("lens", S), ("mark_days", S), ("leads_n", I64),
        ("reached_set", I64), ("reached_demo", I64), ("reached_sale", I64), ("mature", B), ("small", B), ("as_of", S)]))


def _write_projection(fw: FeedWriter, w: World, mo: dict, asof: str) -> None:
    rng = stream(w.seed, "projection")
    order, keep, X = mo["order"], mo["keep"], mo["X"]
    n = len(order)
    months = order[-7:]
    rows = {k: [] for k in ["target_period", "projection_key", "brand", "market", "lens_value", "lens", "coverage_ok", "method", "point",
                             "band_low", "band_high", "backtest_mape", "as_of"]}
    sold = X["sold_cents"]  # period x market x source x brand, cents
    # the current month is projected from the share of a month normally booked by this day
    end = w.end
    dim = (date(end.year + (end.month == 12), (end.month % 12) + 1, 1) - date(end.year, end.month, 1)).days
    elapsed = end.day
    pace_share = 0.355 + 0.645 * (elapsed / dim) ** 1.05  # share of a month's final dollars normally booked by now
    for scope in ["ALL"] + [m.name for m in MARKETS]:
        mi = None if scope == "ALL" else [m.name for m in MARKETS].index(scope)
        mape = 7.7 if mi is None else float(np.round(rng.uniform(8.5, 13.0), 2))
        for p in range(n - 7, n):
            actual = float((sold[p] if mi is None else sold[p, mi]).sum()) / 100.0
            if p == n - 1:
                point = actual / min(pace_share, 1.0)
            else:
                point = actual * float(rng.uniform(0.93, 1.07))
            band = point * (mape / 100.0)
            rows["target_period"].append(order[p])
            rows["projection_key"].append("month_landing_sold")
            rows["brand"].append("ALL")
            rows["market"].append("ALL" if mi is None else scope)
            rows["lens_value"].append("company")
            rows["lens"].append("company")
            rows["coverage_ok"].append("yes")
            rows["method"].append("pace_from_prior_complete_months")
            rows["point"].append(round(point, 2))
            rows["band_low"].append(round(point - band, 2))
            rows["band_high"].append(round(point + band, 2))
            rows["backtest_mape"].append(mape)
            rows["as_of"].append(asof)
    fw.write("lens_projection", table(rows, [
        ("target_period", S), ("projection_key", S), ("brand", S), ("market", S), ("lens_value", S), ("lens", S), ("coverage_ok", S),
        ("method", S), ("point", F64), ("band_low", F64), ("band_high", F64), ("backtest_mape", F64), ("as_of", S)]))
