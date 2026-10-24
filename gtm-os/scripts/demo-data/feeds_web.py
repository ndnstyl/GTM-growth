"""Website and search feeds (GA4, Search Console) and the sales floor's dial and connect feeds."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

import numpy as np

from common import APP, split_int_matrix, stream
from feedio import D32, F64, FeedWriter, I64, S, TS, table
from feeds_money import asof_str
from world import MARKETS, PLATFORMS, World

def _site_from_code() -> str:
    """The Organic tab filters every Search Console query to one constant site. The data must carry that site, so the
    generator reads the constant from the code instead of keeping a second copy."""
    code = (APP / "lib" / "reports" / "sql" / "organic.sql.ts").read_text()
    m = re.search(r'GSC_PRIMARY_SITE\s*=\s*"sc-domain:([^"]+)"', code)
    if not m:
        raise ValueError("GSC_PRIMARY_SITE is not an sc-domain: literal in lib/reports/sql/organic.sql.ts; the generator cannot name the demo site")
    return m.group(1)


DOMAIN = _site_from_code()
SITE = f"sc-domain:{DOMAIN}"
SITE_PRO = "sc-domain:example.org"  # a second, smaller site so the explorers prove they filter to one
SITE_URL = f"https://www.{DOMAIN}"
PROPERTY = "GA4-LH-0001"

AS_OF = [("as_of", TS), ("confidence", S), ("provenance_ref", S)]


def _meta(n, asof, prov):
    return {"as_of": [asof] * n, "confidence": ["deterministic"] * n, "provenance_ref": [prov] * n}


LANDING = ["/", "/roofing", "/windows", "/siding", "/gutters", "/free-estimate", "/financing", "/locations/harborview",
           "/locations/pinecrest", "/locations/stonebridge", "/blog/roof-replacement-cost", "/blog/window-buying-guide"]
CHANNELS = [
    # name, base sessions per day (None = derived from ad clicks), engaged rate, key-event rate, landing weights
    ("Paid Search", None, 0.66, 0.062, [2, 16, 14, 6, 3, 40, 6, 4, 3, 3, 0.5, 0.5]),
    ("Paid Social", None, 0.52, 0.048, [4, 10, 12, 6, 4, 46, 5, 3, 2, 2, 1, 1]),
    ("Organic Search", 1650.0, 0.71, 0.034, [8, 9, 8, 4, 3, 6, 4, 6, 5, 5, 20, 22]),
    ("Direct", 780.0, 0.64, 0.041, [34, 8, 7, 3, 2, 12, 8, 6, 5, 5, 0.5, 0.5]),
    ("Referral", 210.0, 0.68, 0.029, [10, 6, 5, 3, 2, 4, 3, 8, 8, 8, 25, 18]),
    ("Email", 120.0, 0.74, 0.055, [12, 8, 8, 4, 3, 24, 22, 4, 4, 4, 3, 4]),
    ("Organic Social", 140.0, 0.58, 0.021, [22, 8, 8, 4, 3, 10, 4, 6, 5, 5, 12, 13]),
    ("Unassigned", 35.0, 0.40, 0.010, [30, 6, 6, 3, 3, 8, 3, 8, 8, 8, 5, 12]),
]
CITIES = [(c, m.id) for m in MARKETS for c in m.suburbs]


def write_ga4(fw: FeedWriter, w: World) -> None:
    rng = stream(w.seed, "ga4")
    asof = datetime.fromisoformat(asof_str(w))
    D = w.D
    season = w.extra["season"]
    t = np.arange(D) / max(1, D - 1)
    dow_f = np.array([1.05, 1.07, 1.05, 1.03, 0.97, 0.88, 0.90])[w.dow]
    google_ms = sum(w.clicks[c.idx] for c in w.campaigns if c.platform in ("google_ads", "microsoft_ads"))
    meta = sum(w.clicks[c.idx] for c in w.campaigns if c.platform == "meta")
    cols = {k: [] for k in ["date", "ga4_channel_group_raw", "landing_page", "sessions", "engaged_sessions", "key_events", "users"]}
    total_sessions = np.zeros(D, dtype=np.int64)
    for name, base, eng, ke, lw in CHANNELS:
        if name == "Paid Search":
            mean = google_ms * 0.83
        elif name == "Paid Social":
            mean = meta * 0.78
        else:
            mean = base * (0.86 + 0.20 * t) * season * dow_f
        sessions = rng.poisson(np.maximum(mean, 1)).astype(np.int64)
        total_sessions += sessions
        p = np.array(lw, dtype=float)
        p /= p.sum()
        for di in range(D):
            n = int(sessions[di])
            if n == 0:
                continue
            parts = rng.multinomial(n, p)
            for li, k in enumerate(parts):
                if k == 0:
                    continue
                cols["date"].append(w.days[di])
                cols["ga4_channel_group_raw"].append(name)
                cols["landing_page"].append(LANDING[li])
                cols["sessions"].append(int(k))
                cols["engaged_sessions"].append(int(rng.binomial(k, eng)))
                cols["key_events"].append(int(rng.binomial(k, ke)))
                cols["users"].append(int(round(k * rng.uniform(0.78, 0.9))))
    n = len(cols["date"])
    fw.write("fact_ga4_channel_daily", table({
        "property_id": [PROPERTY] * n, **cols, **_meta(n, asof, "ga4:channel"),
    }, [("property_id", S), ("date", D32), ("ga4_channel_group_raw", S), ("landing_page", S), ("sessions", I64),
        ("engaged_sessions", I64), ("key_events", I64), ("users", I64)] + AS_OF), manifest=True)

    # geo: the same sessions, spread over cities
    geo = {k: [] for k in ["date", "city", "region", "sessions", "engaged_sessions", "key_events", "users"]}
    city_w = np.array([m.weight / 4.0 * (1.0, 0.55, 0.3, 0.2)[i] for m in MARKETS for i in range(4)])
    names = [c for c, _ in CITIES] + ["Other Midwest", "(not set)"]
    weights = np.concatenate([city_w / city_w.sum() * 0.93, [0.05, 0.02]])
    for di in range(D):
        parts = rng.multinomial(int(total_sessions[di]), weights)
        for ci, k in enumerate(parts):
            if k == 0:
                continue
            geo["date"].append(w.days[di])
            geo["city"].append(names[ci])
            geo["region"].append("Midwest" if names[ci] != "(not set)" else "(not set)")
            geo["sessions"].append(int(k))
            geo["engaged_sessions"].append(int(rng.binomial(k, 0.64)))
            geo["key_events"].append(int(rng.binomial(k, 0.04)))
            geo["users"].append(int(round(k * rng.uniform(0.78, 0.9))))
    n = len(geo["date"])
    fw.write("fact_ga4_geo_daily", table({
        "property_id": [PROPERTY] * n, **geo, **_meta(n, asof, "ga4:geo"),
    }, [("property_id", S), ("date", D32), ("city", S), ("region", S), ("sessions", I64), ("engaged_sessions", I64),
        ("key_events", I64), ("users", I64)] + AS_OF), manifest=True)


SERVICES = [("roof replacement", "/roofing", 1.0), ("window replacement", "/windows", 0.85), ("new siding", "/siding", 0.5),
            ("gutter guards", "/gutters", 0.45), ("storm damage roof repair", "/roofing", 0.42), ("home exterior financing", "/financing", 0.3)]
MODS = [("cost", 1.0, 4.2), ("near me", 0.7, 6.5), ("company", 0.35, 9.0), ("reviews", 0.28, 8.2), ("installers", 0.22, 11.0),
        ("warranty", 0.14, 12.5), ("financing", 0.18, 10.0), ("estimate", 0.3, 5.8)]


def gsc_curve(pos: float) -> float:
    return 0.31 * float(np.exp(-0.34 * (pos - 1.0))) + 0.008


def write_gsc(fw: FeedWriter, w: World) -> None:
    rng = stream(w.seed, "gsc")
    asof = datetime.fromisoformat(asof_str(w))
    D = w.D
    t = np.arange(D) / max(1, D - 1)
    season = w.extra["season"]
    queries = []
    for sname, path, sbase in SERVICES:
        for mname, mbase, mpos in MODS:
            queries.append((f"{sname} {mname}", path, 520.0 * sbase * mbase, mpos + (1.0 - sbase) * 3.0))
    devices = [("MOBILE", 0.62), ("DESKTOP", 0.34), ("TABLET", 0.04)]
    cols = {k: [] for k in ["date", "query", "page", "device", "clicks", "impressions", "ctr", "position"]}
    site_imp = np.zeros(D)
    site_clk = np.zeros(D)
    site_pos_w = np.zeros(D)
    for qi, (q, path, base, pos0) in enumerate(queries):
        drift = 1.0 - 0.05 * t  # rankings improve a little over the year
        for dev, share in devices:
            mean = base * share * (0.82 + 0.36 * t) * season
            imp = rng.poisson(np.maximum(mean, 0.2))
            pos = np.clip(pos0 * drift + rng.normal(0, 0.35, D), 1.0, 40.0)
            ctr = np.array([gsc_curve(p_) for p_ in pos]) * (1.1 if dev == "DESKTOP" else 1.0)
            clk = rng.binomial(imp, np.clip(ctr, 0, 0.6))
            keep = np.nonzero(imp > 0)[0]
            for di in keep:
                cols["date"].append(w.days[di])
                cols["query"].append(q)
                cols["page"].append(SITE_URL + path)
                cols["device"].append(dev)
                cols["clicks"].append(int(clk[di]))
                cols["impressions"].append(int(imp[di]))
                cols["ctr"].append(round(float(clk[di] / imp[di]), 5))
                cols["position"].append(round(float(pos[di]), 2))
            site_imp += imp
            site_clk += clk
            site_pos_w += imp * pos
    n = len(cols["date"])
    fw.write("fact_gsc_daily", table({
        "site": [SITE] * n, **cols, "country": ["usa"] * n, "search_type": ["web"] * n, "source_tz": ["America/Los_Angeles"] * n,
        **_meta(n, asof, "gsc:query"),
    }, [("site", S), ("date", D32), ("query", S), ("page", S), ("device", S), ("country", S), ("clicks", I64),
        ("impressions", I64), ("ctr", F64), ("position", F64), ("search_type", S), ("source_tz", S)] + AS_OF), manifest=True)

    # site totals include the anonymized long tail the query table omits
    rows = {k: [] for k in ["site", "date", "clicks", "impressions", "ctr", "position"]}
    for site, scale in ((SITE, 1.0), (SITE_PRO, 0.16)):
        for di in range(D):
            imp = int(round(site_imp[di] * 1.38 * scale))
            clk = int(round(site_clk[di] * 1.22 * scale))
            if imp == 0:
                continue
            rows["site"].append(site)
            rows["date"].append(w.days[di])
            rows["clicks"].append(clk)
            rows["impressions"].append(imp)
            rows["ctr"].append(round(clk / imp, 5))
            rows["position"].append(round(float(site_pos_w[di] / max(site_imp[di], 1)) * 1.12, 2))
    n = len(rows["site"])
    fw.write("fact_gsc_site_daily", table({**rows, **_meta(n, asof, "gsc:site")}, [
        ("site", S), ("date", D32), ("clicks", I64), ("impressions", I64), ("ctr", F64), ("position", F64)] + AS_OF), manifest=True)


FIRST = ["Avery", "Jordan", "Riley", "Morgan", "Casey", "Taylor", "Quinn", "Parker", "Reese", "Rowan", "Skyler", "Dakota",
         "Emerson", "Finley", "Harper", "Jamie", "Kendall", "Logan", "Mackenzie", "Nico", "Oakley", "Peyton", "Remy", "Sage",
         "Tatum", "Blake", "Cameron", "Devon", "Elliot", "Frankie", "Gray", "Hayden"]
LAST_INITIAL = list("ABCDEFGHJKLMNPRSTW")


def roster():
    return [(f"agent-{i + 1:02d}", f"{FIRST[i]} {LAST_INITIAL[(i * 5) % len(LAST_INITIAL)]}.") for i in range(len(FIRST))]


def write_callfloor(fw: FeedWriter, w: World) -> dict:
    rng = stream(w.seed, "callfloor-agents")
    asof = asof_str(w)
    D = w.D
    R = roster()
    # tenure windows: most agents are there the whole year; a few start late or leave
    start_i = np.zeros(len(R), dtype=int)
    end_i = np.full(len(R), D, dtype=int)
    for k in range(len(R)):
        if k >= 24:
            start_i[k] = int(rng.integers(60, D - 40))
        elif k % 7 == 3:
            end_i[k] = int(rng.integers(120, D - 80))
    skill = np.clip(rng.normal(1.0, 0.22, len(R)), 0.55, 1.6)
    open_day = w.dials > 0
    active = np.zeros((D, len(R)), dtype=bool)
    for k in range(len(R)):
        active[start_i[k]:end_i[k], k] = True
    # a day is staffed by most of the roster; Saturdays by a smaller crew
    for di in range(D):
        if not open_day[di]:
            active[di] = False
        elif w.dow[di] == 5:
            on = np.nonzero(active[di])[0]
            drop = rng.choice(on, size=max(0, int(len(on) * 0.35)), replace=False) if len(on) else []
            active[di, drop] = False
        else:
            on = np.nonzero(active[di])[0]
            if len(on):
                drop = rng.choice(on, size=int(len(on) * 0.06), replace=False)
                active[di, drop] = False
    agents_n = active.sum(axis=1)
    dials_w = np.where(active, skill[None, :] * np.exp(rng.normal(0, 0.12, (D, len(R)))), 0.0)
    conn_w = np.where(active, dials_w * np.exp(rng.normal(0, 0.2, (D, len(R)))) * skill[None, :], 0.0)
    a_dials = split_int_matrix(w.dials, dials_w)
    ct = w.extra["connects_total"]
    a_conn = split_int_matrix(ct, conn_w)
    if (a_conn > a_dials).any():
        raise ValueError("an agent has more connects than dials; the connect weights need re-tuning, not clipping")
    if (a_conn.sum(axis=1) != ct).any() or (a_dials.sum(axis=1) != w.dials).any():
        raise ValueError("agent rows do not sum to the company dial and connect totals")

    rows = {k: [] for k in ["source", "call_date", "crm_dials", "crm_dials_d", "crm_connects", "crm_connects_d", "crm_machine", "agents", "as_of"]}
    tot_conn = a_conn.sum(axis=1)
    # (source, fraction of the ledger it sees, first day index it covers)
    pulls = [("ledger", 1.0, 0), ("cache45", 0.58, max(0, D - 45)), ("wide75", 0.74, max(0, D - 75)), ("wide150", 0.88, max(0, D - 150))]
    for src, frac, first in pulls:
        for di in range(first, D):
            if not open_day[di]:
                continue
            d_ = int(round(w.dials[di] * frac))
            c_ = int(round(tot_conn[di] * frac))
            rows["source"].append(src)
            rows["call_date"].append(w.days[di].isoformat())
            rows["crm_dials"].append(d_)
            rows["crm_dials_d"].append(int(round(w.dials_d[di] * frac)))
            rows["crm_connects"].append(c_)
            rows["crm_connects_d"].append(int(round(w.connects_d[di] * frac)))
            rows["crm_machine"].append(int(round(w.machine[di] * frac)))
            rows["agents"].append(int(agents_n[di]))
            rows["as_of"].append(asof)
    fw.write("callfloor/callfloor_connect_rate_crm_daily", table(rows, [
        ("source", S), ("call_date", S), ("crm_dials", I64), ("crm_dials_d", I64), ("crm_connects", I64), ("crm_connects_d", I64),
        ("crm_machine", I64), ("agents", I64), ("as_of", S)]))

    rows = {k: [] for k in ["agent_key", "agent_name_lp", "source", "call_date", "crm_dials", "crm_connects"]}
    for k, (key, name) in enumerate(R):
        days_on = np.nonzero(active[:, k])[0]
        for di in days_on:
            rows["agent_key"].append(key)
            rows["agent_name_lp"].append(name)
            rows["source"].append("ledger")
            rows["call_date"].append(w.days[di].isoformat())
            rows["crm_dials"].append(int(a_dials[di, k]))
            rows["crm_connects"].append(int(a_conn[di, k]))
    fw.write("callfloor/callfloor_connect_rate_crm_agent_daily", table(rows, [
        ("agent_key", S), ("agent_name_lp", S), ("source", S), ("call_date", S), ("crm_dials", I64), ("crm_connects", I64)]))
    return {"agents_n": agents_n, "connects_total": tot_conn, "roster": R, "a_dials": a_dials, "a_conn": a_conn, "active": active}
