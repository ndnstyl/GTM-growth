"""Report-side JSON documents: trust register, feed and job health, exec readout, batch state, content library."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

from common import OUT_DATA, OUT_REPORTS, iso, sha256_file, stream, ts_iso, write_json
from cockpit import JOBS, SERVICES
from feedio import FeedWriter
from feeds_money import TARGET_PCT, Money, asof_str, batch_id
from world import MARKETS, PLATFORMS, World, month_labels, period_index, rollup

SPINE_FEEDS = ["spine_funnel_monthly", "spine_spend_monthly", "spine_funnel_rows_daily", "spine_spend_rows"]

LANE_OF = {
    "hourly": ["funnel__fact_funnel_daily"],
    "weekly": ["lens_cohort", "lens_projection", "work_census_period", "work_matrix_period", "meter_gaps_period", "meter_learning_history"],
}


def lane(name: str) -> str:
    for k, v in LANE_OF.items():
        if name in v:
            return k
    return "nightly"


SKEWS = {
    "lens_month": ["leads and sets are dated to entry; sales to contract date, so one month holds four clocks"],
    "lens_week": ["a week that has not closed carries no movement figure"],
    "efficiency__monthly": ["net lags: the most recent weeks are still inside the cancel window"],
    "spine_funnel_monthly": ["cancels post in the month they happen, not the month of the sale"],
    "dm_source_chain_daily": ["unpaid sources carry no spend by construction"],
    "crm_spine__fact_funnel_daily": ["the last two days restate as late data lands"],
    "meta__fact_spend_daily": ["the last two days are provisional until the platform finalizes them"],
}


def write_trust(w: World, fw: FeedWriter) -> None:
    feeds = {}
    for name in sorted(fw.files):
        t = {
            "data_through": iso(w.end), "status": "published", "registered": True, "verdict": "VERIFIED", "verdict_date": iso(w.end),
            "review_cadence_days": 7, "holds": [], "skews": SKEWS.get(name, []), "settlement": None, "lens_read": name.startswith("lens_"),
        }
        if name == "efficiency__monthly":
            t["settlement"] = {"pattern": "append_only", "settlement_days": 40, "reason": "cancel window"}
        if name == "spine_spend_monthly":
            t["holds"] = [{"kind": "invoice", "state": "waiting", "why": "the agency's month-end invoice has not arrived; the last good file is served"}]
        feeds[name] = t
    write_json(OUT_REPORTS / "_trust.json", {"generated_at": ts_iso(w.end + timedelta(days=1), 6, 27), "feeds": feeds})


def write_health(w: World, fw: FeedWriter) -> None:
    built = ts_iso(w.end + timedelta(days=1), 6, 30)
    names = sorted(fw.files)
    feeds = []
    for n in names:
        f = fw.files[n]
        feeds.append({"name": n, "schedule": lane(n), "status": f["status"], "as_of": ts_iso(w.end + timedelta(days=1), 6, 25), "rows": f["rows"],
                      "state": "ok", "why": f"fresh: data through {iso(w.end)}", "last_alert": None})
    sched = {}
    for lane_name in ("hourly", "nightly", "weekly"):
        run = [n for n in names if lane(n) == lane_name]
        sched[lane_name] = {"last_run": built, "last_status": "ok", "feeds_run": run, "feeds_skipped": []}
    doc = {
        "generated_at": built, "as_of": iso(w.end), "schedules": sched, "cooldown": {},
        "summary": {"ok": len(feeds), "stale": 0, "error": 0, "missing": 0, "cooldown": 0, "parked": 0},
        "feeds": feeds, "alerts_24h": 0, "alerts_recent": [], "overall": "ok",
    }
    write_json(OUT_REPORTS / "_health.json", doc)
    write_json(OUT_REPORTS / "_feed_health.json", doc)


def write_job_health(w: World) -> None:
    built = datetime(w.end.year, w.end.month, w.end.day, 6, 30)
    jobs = []
    for i, (label, sched) in enumerate(JOBS):
        if sched == "always on":
            state, run_at = "RUNNING", built - timedelta(minutes=2)
        elif label == "creative-library-sync":
            state, run_at = "STALE", built - timedelta(days=2, hours=4)
        else:
            state, run_at = "OK", built - timedelta(minutes=(i * 37) % 300 + 20)
        row = {"label": label, "last_exit": 0, "runs": 380 + i, "loaded": True, "plist_parse": "ok", "log": None, "log_exists": False,
               "last_run_at": run_at.isoformat(timespec="seconds"), "freshness_from": "run receipt", "state": state}
        if state == "STALE":
            row["reason"] = "has not fired in two days"
            row["known_cause"] = "platform API credential waiting on its quarterly rotation"
            row["owner"] = "Reliability lead"
        jobs.append(row)
    counts = {}
    for j in jobs:
        counts[j["state"]] = counts.get(j["state"], 0) + 1
    vendors = [
        ("google_ads", "enforce", 41200, 100000, "creative-library-sync"), ("meta", "enforce", 18800, 60000, "daily-ad-pull"),
        ("microsoft_ads", "enforce", 5200, 40000, "daily-ad-pull"), ("analytics", "enforce", 9100, 50000, "self-refreshing-reports"),
        ("crm", "enforce", 22400, 80000, "sales-back-to-platforms"), ("model-service", "observe", 61000, None, "call-scoring"),
    ]
    resets = (built + timedelta(hours=17)).isoformat(timespec="seconds")
    write_json(OUT_REPORTS / "_job_health.json", {
        "generated_at": built.isoformat(timespec="seconds"), "counts": counts, "overall": "stale", "jobs": jobs,
        "vendors": {
            "as_of": built.isoformat(timespec="seconds"), "stale": False, "stale_age_s": 120, "registry_invalid": False, "lkg_expiry_s": 86400,
            "cooldown_state_corrupt": None, "unregistered": [],
            "vendors": [{"vendor": v, "mode": m, "used": u, "ceiling": c, "pct": None if c is None else round(u / c, 3), "pace": 0.9,
                         "resets_at": resets, "state": "ok" if m == "enforce" else "observe", "recheck_due": False, "top_lane": lane_,
                         "refusals_suppressed": 0, "last_incident_ts": None, "chronic_spent": False, "ratification_overdue": False}
                        for v, m, u, c, lane_ in vendors],
            "fallback_note": None,
        },
    })


def write_spine_docs(w: World, wf: World, mof: Money, fw: FeedWriter, spine: dict) -> None:
    """spine_exec.json, spine_batch.json, spine_state.json. `wf` is the full-history world."""
    uniq, idx = mof.month_idx()
    n = len(uniq)
    cur = uniq[-1]
    sold = rollup(mof.sold.sum(axis=1), idx, n)
    spend = rollup(mof.ad_spend.sum(axis=1), idx, n)
    leads = rollup(mof.leads.sum(axis=1), idx, n)
    sets = rollup(mof.sets.sum(axis=1), idx, n)
    issues = rollup(mof.issues.sum(axis=1), idx, n)
    sales = rollup(mof.sales.sum(axis=1), idx, n)
    asof = asof_str(w)

    def mer(i):
        return {"period": uniq[i], "spend_cents": int(spend[i]), "revenue_cents": int(sold[i]),
                "mer_pct": round(100.0 * spend[i] / sold[i], 1), "platforms_reporting": list(PLATFORMS), "platforms_expected": list(PLATFORMS),
                "renders_15_line": True, "spend_partial_label": None, "provisional": i == n - 1,
                "cost_definition_used": "ad spend: online media, agency fees and offline media"}

    def unit(i):
        s_ = int(spend[i])
        return {"period": uniq[i], "grain": "company", "cost_per_lead_cents": int(round(s_ / leads[i])), "cost_per_set_cents": int(round(s_ / sets[i])),
                "cost_per_issue_cents": int(round(s_ / issues[i])), "cost_per_sale_cents": int(round(s_ / sales[i])), "provisional": i == n - 1,
                "cost_definition_used": "ad spend: online media, agency fees and offline media", "spend_cents": s_, "presence_complete": True}

    last = n - 2
    now_i = list(range(last - 11, last + 1))
    prior_i = list(range(last - 23, last - 11))
    ttm_now, ttm_prior = int(sold[now_i].sum()), int(sold[prior_i].sum())
    change = ttm_now - ttm_prior
    monthly = []
    for i in range(n - 13, n):
        monthly.append({"period": uniq[i], "gross_cents": int(sold[i]), "mom_pct": None if i == n - 1 else round(100.0 * (sold[i] - sold[i - 1]) / sold[i - 1], 1),
                        "mtd": i == n - 1})
    closed = [{"period": uniq[i], "status": "closed", "closed_by": "analyst seat", "closed_at": ts_iso(date(int(uniq[i][:4]), int(uniq[i][5:]), 1) + timedelta(days=38), 9, 0)}
              for i in range(n - 7, n - 1)]
    month_state = closed + [{"period": cur, "status": "open", "closed_by": None, "closed_at": None}]
    m_last = mer(last)
    bottom = (f"Last month the company booked ${sold[last] / 100:,.0f} on ${spend[last] / 100:,.0f} of ad spend, a MER of "
              f"{sold[last] / spend[last]:.1f}x, and trailing twelve-month revenue is {100.0 * change / ttm_prior:+.1f}% on the year before. "
              f"Cost per sale was ${spend[last] / sales[last] / 100:,.0f}.")
    write_json(OUT_REPORTS / "spine_exec.json", {
        "as_of": asof, "producer": "demo exec export (synthetic data)",
        "provenance": {"mer": "spine.metric_mer", "revenue_ttm": "spine.metric_revenue_ttm", "unit_costs": "spine.metric_unit_costs", "revenue_monthly": "spine.metric_revenue_monthly"},
        "bottom_line": bottom,
        "compass": {
            "call_center_reading": "Set rate is the lever the floor moves today; every point of set rate is worth about the same as a day of ad spend.",
            "exec_reading": "Spend is growing slower than revenue, so MER keeps improving; the open question is how much of that holds as the offers are tested.",
            "actions": [
                {"action": "Review the offer test result before the next budget move", "owner": "Marketing lead", "status": "OPEN"},
                {"action": "Hold the Meta budget shift until the agency invoice posts", "owner": "Paid media operator", "status": "OPEN"},
            ],
        },
        "mer": {"this_month": mer(n - 1), "last_month": m_last},
        "revenue_ttm": {"as_of_month": uniq[last], "ttm_now_cents": ttm_now, "ttm_prior_cents": ttm_prior, "change_abs_cents": change,
                        "change_pct": round(100.0 * change / ttm_prior, 1), "pct_refused_reason": None,
                        "window_now": f"{uniq[now_i[0]]} to {uniq[now_i[-1]]}", "window_prior": f"{uniq[prior_i[0]]} to {uniq[prior_i[-1]]}"},
        "unit_costs": {"this_month": unit(n - 1), "last_month": unit(last)},
        "revenue_monthly": monthly, "month_state": month_state,
        "verify_queue_pending": [{"id": "vq-0412", "source_key": "agency_sheet:meta", "rows": 31, "staged_at": ts_iso(w.end, 16, 40)}],
        "unavailable": [],
    })
    batch = batch_id(w)
    write_json(OUT_REPORTS / "spine_batch.json", {
        "batch_id": batch, "as_of": asof,
        "feeds": {n_: {"rows": fw.files[n_]["rows"], "sha256": sha256_file(fw.files[n_]["path"])} for n_ in SPINE_FEEDS},
    })
    write_json(OUT_REPORTS / "spine_state.json", {
        "batch_id": batch, "as_of": asof, "platforms_expected": list(PLATFORMS),
        "platforms_reporting_by_period": {p: list(PLATFORMS) for p in uniq}, "cost_definition_ruled": True,
        "months": [{"period": p, "status": "open" if p == cur else "closed"} for p in uniq],
        "effective_dates": [
            {"source": "marketing register", "date": f"{uniq[0]}-01", "what": "ad spend definition: online media, agency fees and offline media", "ruling": "ruled"},
            {"source": "marketing register", "date": f"{uniq[-9]}-01", "what": "agency fee rate moved to 15 percent of media", "ruling": "ruled"},
        ],
        "current_period": cur,
    })


# --------------------------------------------------------------------------------------
# content library
# --------------------------------------------------------------------------------------

SERIES = ["Before and After", "Myth Busters", "Homeowner Stories", "Behind the Install", "Financing Explained"]
TOPICS = [
    ("Roof replacement", "A roof you stop thinking about", "most homeowners wait for a leak before they plan a roof"),
    ("Window replacement", "Quieter rooms, lower bills", "new windows only matter for looks"),
    ("Siding", "A front of the house that holds up", "siding is a paint job"),
    ("Gutters and guards", "The cheapest fix that saves the most", "gutters are an afterthought"),
    ("Free estimate", "What happens in a free estimate", "a free estimate is a sales trap"),
    ("Financing", "Monthly payments in plain numbers", "financing means high interest"),
    ("Storm season", "Before the storm, not after", "storm repair can always wait"),
    ("Curb appeal", "What buyers notice from the street", "curb appeal is cosmetic"),
    ("Energy bills", "Where the heat actually leaves", "insulation is the whole story"),
    ("Warranty", "What a warranty really covers", "all warranties are the same"),
    ("Installer crews", "Who shows up at your door", "crews are interchangeable"),
    ("Year in review", "A year of finished homes", "the work is invisible once done"),
]
ROUTES = ["Real install footage", "Animated template", "AI-generated b-roll", "Motion graphic", "Screen recording", "Customer interview"]
GATES_USED = ["RELEASE", "PREREQ", "OPSEC", "SPEC"]


def build_library(w: World) -> dict:
    rng = stream(w.seed, "library")
    recs = []
    k = 0
    for month in range(1, 13):
        topic, teach, myth = TOPICS[month - 1]
        for tier, fmt, dur in (("flagship", "film", 78), ("series", "short", 24), ("carousel", "carousel", 0)):
            k += 1
            series = SERIES[(month + (0 if tier == "flagship" else 2 if tier == "series" else 4)) % len(SERIES)]
            brand = "universal" if tier == "flagship" else ("lh-pro" if (month % 4 == 0 and tier == "series") else "both-variants" if tier == "carousel" else "lh-main")
            rid = f"{'F' if tier == 'flagship' else 'S' if tier == 'series' else 'C'}{month:02d}"
            gates = []
            if tier == "flagship" and month % 3 == 0:
                gates = ["RELEASE"]
            if tier == "series" and month % 5 == 0:
                gates = ["PREREQ"]
            if tier == "carousel" and month % 6 == 0:
                gates = ["SPEC"]
            if month == 9 and tier == "series":
                gates = ["OPSEC"]
            hook = {"id": f"{rid}-H1", "on_screen": f"{topic}: the part nobody shows you", "spoken": f"Here is what happens to {topic.lower()} when the job is done right."}
            alt = [{"id": f"{rid}-H{j + 2}", "on_screen": t_, "spoken": s_} for j, (t_, s_) in enumerate([
                (f"Stop believing this about {topic.lower()}", f"People say {myth}. Here is why that costs them."),
                (f"Three questions before you call about {topic.lower()}", "Ask these first and you will save a week."),
                (f"We timed a {topic.lower()} job", "Start to finish, here is what the crew actually does."),
            ])]
            n_beats = 6 if tier == "flagship" else 4
            beats = []
            for b in range(n_beats):
                t0 = int(b * dur / n_beats)
                beats.append({"t": f"0:{t0:02d}" if dur < 60 else f"{t0 // 60}:{t0 % 60:02d}", "picture": ["The house before the work", "The crew arrives and sets up", "The close-up of the work", "The homeowner at the door", "The finished front of the house", "The offer and the number to call"][b % 6],
                              "route": ROUTES[(b + month) % len(ROUTES)], "on_screen": ["Before", "Day one", "The detail", "In their words", "After", "Free estimate"][b % 6],
                              "vo": ["Most people see this and wait.", "Day one is prep, not paint.", "This is the step that decides how long it lasts.", "Here is what the homeowner said.", "Same house, one week later.", "Book the free estimate."][b % 6]})
            byte_list = []
            if tier == "flagship":
                for j in range(3):
                    byte_list.append({"id": f"{rid}-B{j + 1}", "from_beats": [j, j + 1], "hook": f"{topic}: cut {j + 1} from the film", "end_card": {"line_id": f"L{(month + j) % 5 + 1}"}})
            ai = []
            if tier != "carousel" and month % 2 == 0:
                ai.append({"route": "AI-generated b-roll", "prompt_sketch": f"A slow push-in on a finished home exterior at golden hour, {topic.lower()} in focus.", "est_credits": int(rng.integers(40, 160))})
            credits = float(sum(a["est_credits"] for a in ai))
            recs.append({
                "id": rid, "tier": tier, "series": series, "title": f"{topic}: {teach.lower()}" if tier != "carousel" else f"{topic}: five things to know",
                "brand_scope": brand, "format": fmt, "duration_s": dur, "aspects": ["9:16", "1:1"] if tier != "flagship" else ["16:9", "9:16"],
                "style": ["documentary", "explainer", "testimonial", "time-lapse"][month % 4],
                "angle": {"norm_broken": myth.capitalize() + ".", "mechanism": "show the real process, then the number"},
                "hook": hook, "alt_hooks": alt, "teach": teach + ".", "beats": beats, "bytes": byte_list,
                "end_card": {"line_id": f"L{month % 5 + 1}", "variant_note": "phone number and web address over the estimate form"},
                "cta_tier": ["soft", "direct"][month % 2],
                "facts": [f"A {topic.lower()} job takes the crew {2 + month % 3} days on a typical home.", "Every estimate is free and written.", "Financing is available with monthly payments shown up front."],
                "gates": gates,
                "stills": [{"kind": "carousel", "copy": f"{topic}: slide {s + 1}", "route": ROUTES[(s + 1) % len(ROUTES)]} for s in range(2 if tier != "carousel" else 5)],
                "broll_needs": [f"Crew at work on a {topic.lower()} job", "Exterior establishing shot at golden hour", "Close-up of the finished detail"],
                "ai_generations": ai, "est_credits_total": credits, "people_on_camera": tier == "flagship", "publish_month": month,
                "week": 1 + (month + (0 if tier == "flagship" else 1 if tier == "series" else 2)) % 4,
            })
    by_month = {str(m): int(sum(r["est_credits_total"] for r in recs if r["publish_month"] == m)) for m in range(1, 13)}
    return {"meta": {"generated_at": ts_iso(w.end + timedelta(days=1), 6, 30), "records": len(recs), "credits_by_month": by_month, "credit_ceiling_month": 2500},
            "records": recs}


def write_library(w: World) -> None:
    write_json(OUT_DATA / "content" / "library.json", build_library(w), indent=None)
