"""Contract tables (spend, geo, leads by zip, funnel) and the dimension tables.

Column lists follow CONTRACT_TABLES in lib/reports/sql/_contract_views.ts. Every contract file also
carries as_of / confidence / provenance_ref, which the contract view builder expects.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np

from common import iso, split_int, split_int_matrix, stream, ts
from feedio import B, D32, F64, FeedWriter, I64, S, TS, table
from world import (
    ACCOUNTS, AGENCY, BRAND_LABEL, BRANDS, CHANNELS, COMPANIES, IN_HOUSE, MARKETS, MIDX, NB, NM, NS, PLATFORMS,
    SOURCE_CODES, SOURCE_LABEL, SUBSOURCES, SUB_SOURCE, World,
)

AS_OF_COLS = [("as_of", TS), ("confidence", S), ("provenance_ref", S)]


def _meta(n: int, asof, conf="deterministic", prov="demo-build"):
    return {"as_of": [asof] * n, "confidence": conf if not isinstance(conf, str) else [conf] * n, "provenance_ref": [prov] * n}


# --------------------------------------------------------------------------------------
# dimensions
# --------------------------------------------------------------------------------------


def write_dims(fw: FeedWriter, w: World, asof) -> None:
    n = len(COMPANIES)
    fw.write("dim_company", table({
        "company_id": [c[0] for c in COMPANIES], "legal_name": [c[1] for c in COMPANIES],
        "short_code": [c[2] for c in COMPANIES], **_meta(n, asof, prov="register:companies"),
    }, [("company_id", S), ("legal_name", S), ("short_code", S)] + AS_OF_COLS), manifest=True)

    n = len(CHANNELS)
    fw.write("dim_channel", table({
        "channel_id": [c[0] for c in CHANNELS], "name": [c[1] for c in CHANNELS], **_meta(n, asof, prov="register:channels"),
    }, [("channel_id", S), ("name", S)] + AS_OF_COLS), manifest=True)

    plats = list(ACCOUNTS.items())
    n = len(plats)
    fw.write("dim_platform_account", table({
        "platform": [p for p, _ in plats], "account_id": [a[0] for _, a in plats], "display_name": [a[1] for _, a in plats],
        "company_id": ["NBH"] * n, "reporting_tz": ["America/Chicago"] * n,
        "managed_by": ["in-house", "in-house and agency", AGENCY], **_meta(n, asof, prov="register:accounts"),
    }, [("platform", S), ("account_id", S), ("display_name", S), ("company_id", S), ("reporting_tz", S), ("managed_by", S)] + AS_OF_COLS), manifest=True)

    n = len(SOURCE_CODES)
    fw.write("dim_source", table({
        "source_id": SOURCE_CODES, "source_system": ["crm"] * n, "display_name": [SOURCE_LABEL[s] for s in SOURCE_CODES],
        **_meta(n, asof, prov="register:sources"),
    }, [("source_id", S), ("source_system", S), ("display_name", S)] + AS_OF_COLS), manifest=True)

    n = len(SUBSOURCES)
    fw.write("dim_subsource", table({
        "subsource_id": [s[0] for s in SUBSOURCES], "source_id": [s[2] for s in SUBSOURCES],
        "display_name": [s[1] for s in SUBSOURCES], **_meta(n, asof, prov="register:subsources"),
    }, [("subsource_id", S), ("source_id", S), ("display_name", S)] + AS_OF_COLS), manifest=True)

    n = len(MARKETS)
    fw.write("dim_market", table({
        "market_id": [m.id for m in MARKETS], "code": [m.id for m in MARKETS], "name": [m.name for m in MARKETS],
        "company_id": ["NBH"] * n, "office_lat": [m.lat for m in MARKETS], "office_lng": [m.lng for m in MARKETS],
        "office_match_type": ["census_exact" if i % 3 != 2 else "zcta_centroid" for i in range(n)],
        "office_address": [m.address for m in MARKETS], "has_service_area_list": [True] * n, "is_fallout_bucket": [False] * n,
        **_meta(n, asof, prov="register:markets"),
    }, [("market_id", S), ("code", S), ("name", S), ("company_id", S), ("office_lat", F64), ("office_lng", F64),
        ("office_match_type", S), ("office_address", S), ("has_service_area_list", B), ("is_fallout_bucket", B)] + AS_OF_COLS), manifest=True)

    # campaign dims, one file per platform feed
    rng = stream(w.seed, "dims")
    for p in PLATFORMS:
        cs = [c for c in w.campaigns if c.platform == p]
        fw.write(f"{p}__dim_campaign", table({
            "campaign_id": [c.id for c in cs], "platform": [p] * len(cs),
            "platform_campaign_id": [c.platform_campaign_id for c in cs], "name": [c.name for c in cs],
            "company_id": [c.brand for c in cs], "market_id": [c.primary_market for c in cs],
            "channel_id": [c.channel for c in cs],
            "grammar_status": ["multi_market" if c.multi else "parsed" for c in cs], **_meta(len(cs), asof, prov=f"api:{p}"),
        }, [("campaign_id", S), ("platform", S), ("platform_campaign_id", S), ("name", S), ("company_id", S),
            ("market_id", S), ("channel_id", S), ("grammar_status", S)] + AS_OF_COLS), manifest=True)
        sets = []
        units = []
        for c in cs:
            for si, sname in enumerate(c.ad_sets):
                sid = f"{c.id}-s{si + 1}"
                sets.append((sid, c.id, sname))
                for ai in range(2):
                    uname = _ad_name(c, si, ai)
                    units.append((f"{sid}-a{ai + 1}", sid, uname, c.kind == "pmax"))
        fw.write(f"{p}__dim_ad_set", table({
            "ad_set_id": [s[0] for s in sets], "campaign_id": [s[1] for s in sets], "name": [s[2] for s in sets],
            **_meta(len(sets), asof, prov=f"api:{p}"),
        }, [("ad_set_id", S), ("campaign_id", S), ("name", S)] + AS_OF_COLS), manifest=True)
        fw.write(f"{p}__dim_ad_unit", table({
            "ad_unit_id": [u[0] for u in units], "ad_set_id": [u[1] for u in units], "name": [u[2] for u in units],
            "is_asset_group": [u[3] for u in units], **_meta(len(units), asof, prov=f"api:{p}"),
        }, [("ad_unit_id", S), ("ad_set_id", S), ("name", S), ("is_asset_group", B)] + AS_OF_COLS), manifest=True)


_AD_NAMES = {
    "search": ["Responsive search ad A", "Responsive search ad B"],
    "pmax": ["Asset group: lifestyle images", "Asset group: offer video"],
    "video": ["Video 30s: before and after", "Video 15s: offer cut-down"],
    "social": ["Image: free estimate offer", "Video: homeowner story"],
    "retarget": ["Carousel: recent projects", "Image: finish your estimate"],
}


def _ad_name(c, si, ai) -> str:
    return _AD_NAMES[c.kind][ai] if si == 0 else _AD_NAMES[c.kind][ai].replace("A", "C").replace("B", "D") + " (variant)"


# --------------------------------------------------------------------------------------
# spend by platform, allocation, geo, conversion actions
# --------------------------------------------------------------------------------------


def _child_fracs(rng, D: int) -> np.ndarray:
    sw = np.array([0.6, 0.4])[None, :] * np.exp(rng.normal(0, 0.08, (D, 2)))
    sw /= sw.sum(axis=1, keepdims=True)
    aw = np.array([0.58, 0.42])[None, None, :] * np.exp(rng.normal(0, 0.08, (D, 2, 2)))
    aw /= aw.sum(axis=2, keepdims=True)
    return (sw[:, :, None] * aw).reshape(D, 4)


def write_spend(fw: FeedWriter, w: World, asof) -> None:
    rng = stream(w.seed, "spend-children")
    D = w.D
    days = np.array(w.days, dtype=object)
    d_arr = [d for d in w.days]
    conf_last = np.array(["deterministic"] * D, dtype=object)
    for p in PLATFORMS:
        chunks = []
        for c in [c for c in w.campaigns if c.platform == p]:
            f4 = _child_fracs(rng, D)
            sp, im, cl = w.spend[c.idx], w.imps[c.idx], w.clicks[c.idx]
            cv100 = np.round(w.conv[c.idx] * 100).astype(np.int64)
            ac100 = np.round(w.all_conv[c.idx] * 100).astype(np.int64)
            val = w.conv_value[c.idx]
            ad = {
                "amt": split_int_matrix(sp, f4), "imp": split_int_matrix(im, f4), "clk": split_int_matrix(cl, f4),
                "cv": split_int_matrix(cv100, f4), "ac": split_int_matrix(ac100, f4), "val": split_int_matrix(val, f4),
            }
            st = {k: v.reshape(D, 2, 2).sum(axis=2) for k, v in ad.items()}
            conf = conf_last.copy()
            conf[-1] = "provisional"
            if p == "meta":
                conf[-2:] = "provisional"
            isr = w.imp_share[c.idx]
            vv_c = w.video_views[c.idx]
            rc_c = w.reach[c.idx]
            fq_c = w.freq[c.idx]
            vendor = None if c.operator == IN_HOUSE else "apex-media"
            acct = ACCOUNTS[p][0]
            mkt = c.primary_market

            def block(grain, n_per_day, getter):
                recs = {k: [] for k in ["spend_date", "campaign_id", "ad_set_id", "ad_unit_id", "grain", "grain_object_id",
                                        "amount_cents", "impressions", "clicks", "conversions", "all_conversions",
                                        "conversion_value_cents", "impression_share", "video_views", "reach", "frequency",
                                        "confidence"]}
                for k in range(n_per_day):
                    g = getter(k)
                    recs["spend_date"].extend(d_arr)
                    recs["campaign_id"].extend([c.id] * D)
                    recs["ad_set_id"].extend(g["set"] * D if isinstance(g["set"], list) else [g["set"]] * D)
                    recs["ad_unit_id"].extend(g["unit"] * D if isinstance(g["unit"], list) else [g["unit"]] * D)
                    recs["grain"].extend([grain] * D)
                    recs["grain_object_id"].extend([g["obj"]] * D)
                    recs["amount_cents"].append(g["amt"])
                    recs["impressions"].append(g["imp"])
                    recs["clicks"].append(g["clk"])
                    recs["conversions"].append(g["cv"] / 100.0)
                    recs["all_conversions"].append(g["ac"] / 100.0)
                    recs["conversion_value_cents"].append(g["val"])
                    recs["impression_share"].append(isr)
                    frac = g["frac"]
                    recs["video_views"].append(np.where(vv_c > 0, np.round(vv_c * frac), -1))
                    recs["reach"].append(np.where(rc_c > 0, np.round(rc_c * frac), -1))
                    recs["frequency"].append(fq_c)
                    recs["confidence"].extend(conf.tolist())
                return recs

            camp_get = lambda k: {"set": None, "unit": None, "obj": c.id, "amt": sp, "imp": im, "clk": cl, "cv": cv100,
                                  "ac": ac100, "val": val, "frac": np.ones(D)}
            set_get = lambda k: {"set": f"{c.id}-s{k + 1}", "unit": None, "obj": f"{c.id}-s{k + 1}", "amt": st["amt"][:, k],
                                 "imp": st["imp"][:, k], "clk": st["clk"][:, k], "cv": st["cv"][:, k], "ac": st["ac"][:, k],
                                 "val": st["val"][:, k], "frac": f4.reshape(D, 2, 2).sum(axis=2)[:, k]}
            ad_get = lambda k: {"set": f"{c.id}-s{k // 2 + 1}", "unit": f"{c.id}-s{k // 2 + 1}-a{k % 2 + 1}",
                                "obj": f"{c.id}-s{k // 2 + 1}-a{k % 2 + 1}", "amt": ad["amt"][:, k], "imp": ad["imp"][:, k],
                                "clk": ad["clk"][:, k], "cv": ad["cv"][:, k], "ac": ad["ac"][:, k], "val": ad["val"][:, k],
                                "frac": f4[:, k]}
            for grain, n_pd, getter in (("campaign", 1, camp_get), ("ad_set", 2, set_get), ("ad", 4, ad_get)):
                r = block(grain, n_pd, getter)
                n = len(r["spend_date"])
                cat = {k: (np.concatenate(v) if isinstance(v[0], np.ndarray) else v) for k, v in r.items()}
                cat["market_id"] = [mkt] * n
                cat["vendor_id"] = [vendor] * n
                cat["company_id"] = [c.brand] * n
                chunks.append((n, cat))
        total = sum(n for n, _ in chunks)
        out = {}
        keys = chunks[0][1].keys()
        for k in keys:
            parts = [cat[k] for _, cat in chunks]
            out[k] = np.concatenate([np.asarray(x) if not isinstance(x, list) else np.array(x, dtype=object) for x in parts])
        n = total
        acct = ACCOUNTS[p][0]
        vv = out["video_views"]
        rc = out["reach"]
        tbl = table({
            "platform": [p] * n, "account_id": [acct] * n, "company_id": out["company_id"].tolist(),
            "market_id": out["market_id"].tolist(), "campaign_id": out["campaign_id"].tolist(),
            "ad_set_id": out["ad_set_id"].tolist(), "ad_unit_id": out["ad_unit_id"].tolist(),
            "grain": out["grain"].tolist(), "grain_object_id": out["grain_object_id"].tolist(),
            "spend_date": out["spend_date"].tolist(), "row_type": ["media"] * n, "ingestion_class": ["api_daily"] * n,
            "fee_seq": [0] * n, "amount_cents": out["amount_cents"].astype(np.int64), "impressions": out["impressions"].astype(np.int64),
            "clicks": out["clicks"].astype(np.int64), "conversions": out["conversions"].astype(float),
            "all_conversions": out["all_conversions"].astype(float), "conversion_value_cents": out["conversion_value_cents"].astype(np.int64),
            "impression_share": out["impression_share"].astype(float),
            "video_views": [None if x < 0 else int(x) for x in vv], "reach": [None if x < 0 else int(x) for x in rc],
            "frequency": out["frequency"].astype(float),
            "vendor_id": out["vendor_id"].tolist(),
            "as_of": [asof] * n, "confidence": out["confidence"].tolist(), "provenance_ref": [f"api:{p}:daily"] * n,
        }, [("platform", S), ("account_id", S), ("company_id", S), ("market_id", S), ("campaign_id", S), ("ad_set_id", S),
            ("ad_unit_id", S), ("grain", S), ("grain_object_id", S), ("spend_date", D32), ("row_type", S),
            ("ingestion_class", S), ("fee_seq", I64), ("amount_cents", I64), ("impressions", I64), ("clicks", I64),
            ("conversions", F64), ("all_conversions", F64), ("conversion_value_cents", I64), ("impression_share", F64),
            ("video_views", I64), ("reach", I64), ("frequency", F64), ("vendor_id", S)] + AS_OF_COLS)
        fw.write(f"{p}__fact_spend_daily", tbl, manifest=True)


def write_allocation(fw: FeedWriter, w: World, asof) -> None:
    rows = {k: [] for k in ["platform", "campaign_id", "spend_date", "market_id", "share", "market_count", "geo_postal_cents_in_set"]}
    for c in [c for c in w.campaigns if c.multi]:
        for mid in c.markets:
            mi = MIDX[mid]
            sh = w.share[c.idx, :, mi]
            rows["platform"].extend([c.platform] * w.D)
            rows["campaign_id"].extend([c.id] * w.D)
            rows["spend_date"].extend(w.days)
            rows["market_id"].extend([mid] * w.D)
            rows["share"].extend(sh.tolist())
            rows["market_count"].extend([len(c.markets)] * w.D)
            rows["geo_postal_cents_in_set"].extend(np.round(w.spend[c.idx] * 0.93).astype(np.int64).tolist())
    n = len(rows["platform"])
    fw.write("campaign_market_allocation", table({
        **rows, "basis": ["geo_spend"] * n, "grammar_status": ["multi_market"] * n, "rule_id": ["regional-split-v2"] * n,
        "rules_version": ["v2"] * n, **_meta(n, asof, prov="rules:market-allocation"),
    }, [("platform", S), ("campaign_id", S), ("spend_date", D32), ("market_id", S), ("share", F64), ("basis", S),
        ("grammar_status", S), ("rule_id", S), ("market_count", I64), ("geo_postal_cents_in_set", I64),
        ("rules_version", S)] + AS_OF_COLS), manifest=True)


def write_geo(fw: FeedWriter, w: World, asof) -> None:
    rng = stream(w.seed, "geo")
    D = w.D
    for p in ("google_ads", "microsoft_ads"):
        rows = {k: [] for k in ["campaign_id", "spend_date", "geo_type", "geo_id", "geo_name", "amount_cents", "impressions", "clicks", "conversions"]}
        for c in [c for c in w.campaigns if c.platform == p and c.kind == "search"]:
            m = MARKETS[MIDX[c.primary_market]]
            city_w = np.array([0.50, 0.20, 0.18, 0.12])[None, :] * np.exp(rng.normal(0, 0.10, (D, 4)))
            county_w = np.array([0.62, 0.38])[None, :] * np.exp(rng.normal(0, 0.06, (D, 2)))
            for geo_type, wts, names, ids in (
                ("city", city_w, m.suburbs, [f"{m.id}-city-{k + 1}" for k in range(4)]),
                ("county", county_w, m.county, [f"{m.id}-county-{k + 1}" for k in range(2)]),
            ):
                amt = split_int_matrix(w.spend[c.idx], wts)
                imp = split_int_matrix(w.imps[c.idx], wts)
                clk = split_int_matrix(w.clicks[c.idx], wts)
                cv = wts / wts.sum(axis=1, keepdims=True) * w.conv[c.idx][:, None]
                for k in range(wts.shape[1]):
                    rows["campaign_id"].extend([c.id] * D)
                    rows["spend_date"].extend(w.days)
                    rows["geo_type"].extend([geo_type] * D)
                    rows["geo_id"].extend([ids[k]] * D)
                    rows["geo_name"].extend([names[k]] * D)
                    rows["amount_cents"].extend(amt[:, k].tolist())
                    rows["impressions"].extend(imp[:, k].tolist())
                    rows["clicks"].extend(clk[:, k].tolist())
                    rows["conversions"].extend(np.round(cv[:, k], 2).tolist())
        n = len(rows["campaign_id"])
        fw.write(f"{p}__fact_geo_spend_daily", table({
            "platform": [p] * n, "account_id": [ACCOUNTS[p][0]] * n, **rows, "location_type": ["presence"] * n,
            **_meta(n, asof, prov=f"api:{p}:geo"),
        }, [("platform", S), ("account_id", S), ("campaign_id", S), ("spend_date", D32), ("geo_type", S), ("geo_id", S),
            ("geo_name", S), ("location_type", S), ("amount_cents", I64), ("impressions", I64), ("clicks", I64),
            ("conversions", F64)] + AS_OF_COLS), manifest=True)


ACTIONS = [
    ("ca-form", "Form submit", "LEAD", True, 0.52),
    ("ca-call", "Call from ad", "PHONE_CALL_LEAD", True, 0.30),
    ("ca-book", "Booked estimate online", "BOOK_APPOINTMENT", True, 0.18),
    ("ca-pricing", "Pricing page view", "PAGE_VIEW", False, 0.0),
]


def write_conversion_actions(fw: FeedWriter, w: World, asof) -> None:
    rng = stream(w.seed, "conv-actions")
    D = w.D
    for p in ("google_ads", "microsoft_ads"):
        rows = {k: [] for k in ["campaign_id", "spend_date", "conversion_action_id", "conversion_action_name", "category",
                                 "primary_for_goal", "conversions", "all_conversions"]}
        for c in [c for c in w.campaigns if c.platform == p]:
            wts = np.array([a[4] for a in ACTIONS[:3]])[None, :] * np.exp(rng.normal(0, 0.10, (D, 3)))
            cv100 = np.round(w.conv[c.idx] * 100).astype(np.int64)
            parts = split_int_matrix(cv100, wts)
            for k, a in enumerate(ACTIONS):
                conv = parts[:, k] / 100.0 if k < 3 else np.zeros(D)
                allc = conv * 1.12 if k < 3 else np.round(w.conv[c.idx] * 0.42, 2)
                rows["campaign_id"].extend([c.id] * D)
                rows["spend_date"].extend(w.days)
                rows["conversion_action_id"].extend([a[0]] * D)
                rows["conversion_action_name"].extend([a[1]] * D)
                rows["category"].extend([a[2]] * D)
                rows["primary_for_goal"].extend([a[3]] * D)
                rows["conversions"].extend(np.round(conv, 2).tolist())
                rows["all_conversions"].extend(np.round(allc, 2).tolist())
        n = len(rows["campaign_id"])
        fw.write(f"{p}__fact_conversion_action_daily", table({
            "platform": [p] * n, "account_id": [ACCOUNTS[p][0]] * n, **rows, **_meta(n, asof, prov=f"api:{p}:actions"),
        }, [("platform", S), ("account_id", S), ("campaign_id", S), ("spend_date", D32), ("conversion_action_id", S),
            ("conversion_action_name", S), ("category", S), ("primary_for_goal", B), ("conversions", F64),
            ("all_conversions", F64)] + AS_OF_COLS), manifest=True)


# --------------------------------------------------------------------------------------
# zips and leads by zip
# --------------------------------------------------------------------------------------


def _miles(lat1, lng1, lat2, lng2):
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def build_zips(seed: int):
    """Synthetic zip universe per market. Returns (zip rows, per-market class lists)."""
    rng = stream(seed, "zips")
    zips = []  # dict rows
    classes = {}  # market -> dict class -> list of (zip, weight, serviceable)
    for mi, m in enumerate(MARKETS):
        cls = {"in_area": [], "out_of_area": [], "unknown_branch_list": [], "wrong_branch": []}
        k = 0
        # in-area: 24 zips within 3 to 22 miles
        for i in range(24):
            k += 1
            rad = float(rng.uniform(3, 22))
            ang = float(rng.uniform(0, 2 * math.pi))
            lat = m.lat + (rad * math.sin(ang)) / 69.0
            lng = m.lng + (rad * math.cos(ang)) / (69.0 * math.cos(math.radians(m.lat)))
            z = f"6{mi}{k:03d}"
            zips.append({"zip": z, "lat": round(lat, 5), "lng": round(lng, 5), "branch": m.id, "in_master": True, "status": "serviced"})
            cls["in_area"].append((z, 1.0 / (1 + i * 0.22), m.id, round(rad, 1)))
        for i in range(6):
            k += 1
            rad = float(rng.uniform(45, 115))
            ang = float(rng.uniform(0, 2 * math.pi))
            lat = m.lat + (rad * math.sin(ang)) / 69.0
            lng = m.lng + (rad * math.cos(ang)) / (69.0 * math.cos(math.radians(m.lat)))
            z = f"6{mi}{k:03d}"
            zips.append({"zip": z, "lat": round(lat, 5), "lng": round(lng, 5), "branch": None, "in_master": True, "status": "outside_service_area"})
            cls["out_of_area"].append((z, 1.0 / (1 + i * 0.4), None, round(rad, 1)))
        for i in range(3):
            k += 1
            rad = float(rng.uniform(25, 38))
            ang = float(rng.uniform(0, 2 * math.pi))
            lat = m.lat + (rad * math.sin(ang)) / 69.0
            lng = m.lng + (rad * math.cos(ang)) / (69.0 * math.cos(math.radians(m.lat)))
            z = f"6{mi}{k:03d}"
            zips.append({"zip": z, "lat": round(lat, 5), "lng": round(lng, 5), "branch": None, "in_master": False, "status": "fringe_unlisted"})
            cls["unknown_branch_list"].append((z, 1.0, None, round(rad, 1)))
        classes[m.id] = cls
    # wrong branch: a lead filed to market A whose zip belongs to market B
    for mi, m in enumerate(MARKETS):
        other = MARKETS[(mi + 1) % NM]
        picks = [z for z in classes[other.id]["in_area"]][:4]
        classes[m.id]["wrong_branch"] = [(z[0], 1.0 / (1 + j * 0.5), other.id, round(_miles(m.lat, m.lng, *_coord(zips, z[0])), 1)) for j, z in enumerate(picks)]
    return zips, classes


def _coord(zips, z):
    for r in zips:
        if r["zip"] == z:
            return r["lat"], r["lng"]
    raise KeyError(z)


def write_zips(fw: FeedWriter, zips, asof) -> None:
    n = len(zips)
    fw.write("dim_zip", table({
        "zip": [z["zip"] for z in zips], "zcta_lat": [z["lat"] for z in zips], "zcta_lng": [z["lng"] for z in zips],
        "county_fips": ["99" + z["zip"][1:4] for z in zips], "state": ["MW"] * n, "branch_id": [z["branch"] for z in zips],
        "in_master": [z["in_master"] for z in zips], "zip_status": [z["status"] for z in zips],
        **_meta(n, asof, prov="register:zip-master"),
    }, [("zip", S), ("zcta_lat", F64), ("zcta_lng", F64), ("county_fips", S), ("state", S), ("branch_id", S),
        ("in_master", B), ("zip_status", S)] + AS_OF_COLS), manifest=True)


CLASS_P = np.array([0.64, 0.09, 0.13, 0.06, 0.05, 0.03])
CLASS_NAMES = ["in_area", "wrong_branch", "out_of_area", "unknown_branch_list", "no_zip", "unmapped_zip"]


def write_lead_zip(fw: FeedWriter, w: World, classes, asof) -> None:
    """Leads by zip: every lead in the funnel lands on exactly one zip row, so the geo totals
    tie to the funnel to the lead."""
    rng = stream(w.seed, "lead-zip")
    cols = {k: [] for k in ["lead_date", "company_id", "market_id", "source_id", "subsource_id", "platform", "zip", "leads",
                            "state", "within_radius_mi", "distance_basis", "filed_branch", "serviceable_branch"]}
    # per-source tilt of the class mix: paid social casts a wide net, organic and referral are tighter
    tilt = {"PAIDSOCIAL": np.array([0.9, 1.0, 1.5, 1.0, 1.0, 1.0]), "ORGANIC": np.array([1.05, 1.0, 0.8, 1.0, 1.0, 1.0]),
            "REFERRAL": np.array([1.2, 1.0, 0.5, 0.8, 0.6, 0.6])}
    cache = {}
    for mi, m in enumerate(MARKETS):
        cl = classes[m.id]
        cache[m.id] = {name: (np.array([z[0] for z in cl[name]]), np.array([z[1] for z in cl[name]], dtype=float),
                               [z[2] for z in cl[name]], [z[3] for z in cl[name]]) for name in cl}
        for name in cache[m.id]:
            zz, ww, svc, rad = cache[m.id][name]
            cache[m.id][name] = (zz, ww / ww.sum(), svc, rad)
    leads = w.leads
    D = w.D
    for di in range(D):
        day = w.days[di]
        for mi, m in enumerate(MARKETS):
            for si in range(NS):
                src = SUBSOURCES[si][2]
                pl = SUBSOURCES[si][5]
                for bi in range(NB):
                    n = int(leads[di, mi, si, bi])
                    if n == 0:
                        continue
                    p = CLASS_P * tilt.get(src, np.ones(6))
                    p = p / p.sum()
                    cc = rng.multinomial(n, p)
                    for ci, cnt in enumerate(cc):
                        if cnt == 0:
                            continue
                        name = CLASS_NAMES[ci]
                        if name in ("no_zip", "unmapped_zip"):
                            cols["lead_date"].append(day)
                            cols["company_id"].append(BRANDS[bi])
                            cols["market_id"].append(m.id)
                            cols["source_id"].append(src)
                            cols["subsource_id"].append(SUBSOURCES[si][0])
                            cols["platform"].append(pl)
                            cols["zip"].append(None if name == "no_zip" else "99999")
                            cols["leads"].append(int(cnt))
                            cols["state"].append(name)
                            cols["within_radius_mi"].append(None)
                            cols["distance_basis"].append(None)
                            cols["filed_branch"].append(m.id)
                            cols["serviceable_branch"].append(None)
                            continue
                        zz, ww, svc, rad = cache[m.id][name]
                        per = rng.multinomial(int(cnt), ww)
                        for zi, k in enumerate(per):
                            if k == 0:
                                continue
                            cols["lead_date"].append(day)
                            cols["company_id"].append(BRANDS[bi])
                            cols["market_id"].append(m.id)
                            cols["source_id"].append(src)
                            cols["subsource_id"].append(SUBSOURCES[si][0])
                            cols["platform"].append(pl)
                            cols["zip"].append(str(zz[zi]))
                            cols["leads"].append(int(k))
                            cols["state"].append(name)
                            if name == "unknown_branch_list":
                                cols["within_radius_mi"].append(float(rad[zi]))
                                cols["distance_basis"].append(None)
                                cols["serviceable_branch"].append(None)
                            else:
                                cols["within_radius_mi"].append(float(rad[zi]))
                                cols["distance_basis"].append("office_exact")
                                cols["serviceable_branch"].append(svc[zi] if name in ("in_area", "wrong_branch") else None)
                            cols["filed_branch"].append(m.id)
    n = len(cols["lead_date"])
    fw.write("fact_lead_zip_daily", table({
        **cols, **_meta(n, asof, prov="crm:lead-intake"),
    }, [("lead_date", D32), ("company_id", S), ("market_id", S), ("source_id", S), ("subsource_id", S), ("platform", S),
        ("zip", S), ("leads", I64), ("state", S), ("within_radius_mi", F64), ("distance_basis", S), ("filed_branch", S),
        ("serviceable_branch", S)] + AS_OF_COLS), manifest=True)


# --------------------------------------------------------------------------------------
# funnel
# --------------------------------------------------------------------------------------


def funnel_arrays(w: World):
    """Day x market funnel sums (over source and brand)."""
    s = lambda a: a.sum(axis=(2, 3))
    return {
        "leads": s(w.leads), "sets": s(w.sets), "issues": s(w.issues), "demos": s(w.demos), "sales": s(w.sales),
        "gross": s(w.sold), "cancels": s(w.cancels), "cancel_gross": s(w.cancel_c), "rtc": s(w.rtc),
        "turndown": s(w.turndown), "unruled": s(w.unruled),
    }


def write_funnel(fw: FeedWriter, w: World, asof) -> None:
    f = funnel_arrays(w)
    D = w.D
    cols = {k: [] for k in ["source_system", "office_id", "office", "date", "leads", "sets", "issues", "demos", "sales",
                            "gross_cents", "net_cents", "rtc_cents", "turndown_cents", "cancels", "cancel_gross_cents",
                            "unruled_appointments"]}
    for mi, m in enumerate(MARKETS):
        cols["source_system"].extend(["crm"] * D)
        cols["office_id"].extend([m.id] * D)
        cols["office"].extend([m.id] * D)
        cols["date"].extend([d.isoformat() for d in w.days])
        for k_out, k_in in (("leads", "leads"), ("sets", "sets"), ("issues", "issues"), ("demos", "demos"), ("sales", "sales"),
                            ("gross_cents", "gross"), ("rtc_cents", "rtc"), ("turndown_cents", "turndown"),
                            ("cancels", "cancels"), ("cancel_gross_cents", "cancel_gross"), ("unruled_appointments", "unruled")):
            cols[k_out].extend(f[k_in][:, mi].astype(np.int64).tolist())
        cols["net_cents"].extend((f["gross"][:, mi] - f["cancel_gross"][:, mi]).astype(np.int64).tolist())
    n = len(cols["date"])
    conf = ["deterministic"] * n
    fw.write("lp_spine__fact_funnel_daily", table({
        **cols, "as_of": [asof] * n, "confidence": conf, "provenance_ref": ["crm:daily-spine"] * n,
    }, [("source_system", S), ("office_id", S), ("office", S), ("date", S), ("leads", I64), ("sets", I64), ("issues", I64),
        ("demos", I64), ("sales", I64), ("gross_cents", I64), ("net_cents", I64), ("rtc_cents", I64), ("turndown_cents", I64),
        ("cancels", I64), ("cancel_gross_cents", I64), ("unruled_appointments", I64)] + AS_OF_COLS), manifest=True)

    # the intraday file: a partial row for the build day, provisional, no net column
    rng = stream(w.seed, "funnel-today")
    today = w.end
    last7 = slice(max(0, D - 7), D)
    tc = {k: [] for k in ["source_system", "office_id", "office", "date", "leads", "sets", "issues", "demos", "sales",
                          "gross_cents", "rtc_cents", "turndown_cents", "unruled_appointments"]}
    for mi, m in enumerate(MARKETS):
        frac = 0.35
        lead = int(rng.poisson(f["leads"][last7, mi].mean() * frac))
        sets = int(rng.binomial(lead, 0.25))
        iss = int(rng.binomial(sets, 0.7))
        dem = int(rng.binomial(iss, 0.7))
        sal = int(rng.binomial(dem, 0.17))
        avg = f["gross"][last7, mi].sum() / max(1, f["sales"][last7, mi].sum())
        tc["source_system"].append("crm_intraday")
        tc["office_id"].append(m.id)
        tc["office"].append(m.id)
        tc["date"].append(today.isoformat())
        tc["leads"].append(lead)
        tc["sets"].append(sets)
        tc["issues"].append(iss)
        tc["demos"].append(dem)
        tc["sales"].append(sal)
        tc["gross_cents"].append(int(round(sal * avg / 100.0)) * 100)
        tc["rtc_cents"].append(0)
        tc["turndown_cents"].append(0)
        tc["unruled_appointments"].append(0)
    n = len(tc["date"])
    tc["net_cents"] = [None] * n
    fw.write("funnel__fact_funnel_daily", table({
        **tc, "as_of": [ts(today, 9, 15)] * n, "confidence": ["provisional"] * n, "provenance_ref": ["crm:intraday"] * n,
    }, [("source_system", S), ("office_id", S), ("office", S), ("date", S), ("leads", I64), ("sets", I64), ("issues", I64),
        ("demos", I64), ("sales", I64), ("gross_cents", I64), ("net_cents", I64), ("rtc_cents", I64), ("turndown_cents", I64),
        ("unruled_appointments", I64)] + AS_OF_COLS), manifest=True)
