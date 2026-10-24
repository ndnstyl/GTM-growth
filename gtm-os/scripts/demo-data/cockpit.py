"""Cockpit JSON feeds under public/data/ and the report-side documents (trust, health, exec, batch state).

Types follow lib/feeds.ts, lib/consentOps.ts, components/reports/Health.tsx, lib/reports/spine/client.ts and
lib/reports/workbench/markers.ts. "Today" in these fixtures is the last data day (the day before the build).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

from common import OUT_DATA, OUT_REPORTS, iso, sha256_file, split_int, stream, ts_iso, write_json
from feeds_money import TARGET_PCT, Money, asof_str, batch_id, month_end, working_days
from world import MARKETS, MIDX, PLATFORMS, SOURCE_CODES, SOURCE_LABEL, SUB_SOURCE, World

STAGES = ["Market Research", "Positioning & Offer", "Content Engine", "Paid Media", "Capture & Consent", "Speed to Lead",
          "Sales Floor", "Attribution & Cost", "Reporting Cockpit", "Reliability"]


def epoch(d: date, hh=6, mm=30) -> int:
    return int(datetime(d.year, d.month, d.day, hh, mm).timestamp())


# --------------------------------------------------------------------------------------
# headline numbers shared by kpi, snapshots, chat and stage stats
# --------------------------------------------------------------------------------------


class Headline:
    def __init__(self, w: World, mo: Money):
        D = w.D
        self.w, self.mo = w, mo
        y = D - 1
        self.y = y
        sl = lambda a, lo, hi: float(a[lo:hi].sum())
        self.leads_y = int(mo.leads[y].sum())
        self.leads_prev = int(mo.leads[y - 7].sum())
        self.demos_y, self.demos_prev = int(mo.demos[y].sum()), int(mo.demos[y - 7].sum())
        self.issues_y, self.issues_prev = int(mo.issues[y].sum()), int(mo.issues[y - 7].sum())
        self.sales_y = int(mo.sales[y].sum())
        # trailing 7 days vs the 7 before
        self.sp7 = sl(mo.ad_spend, D - 7, D) / 100.0
        self.sp7p = sl(mo.ad_spend, D - 14, D - 7) / 100.0
        self.rev7 = sl(mo.sold, D - 7, D) / 100.0
        self.rev7p = sl(mo.sold, D - 14, D - 7) / 100.0
        self.sales7, self.sales7p = sl(mo.sales, D - 7, D), sl(mo.sales, D - 14, D - 7)
        self.leads7, self.leads7p = sl(mo.leads, D - 7, D), sl(mo.leads, D - 14, D - 7)
        self.sets7, self.sets7p = sl(mo.sets, D - 7, D), sl(mo.sets, D - 14, D - 7)
        ms = date(w.end.year, w.end.month, 1)
        a = (ms - w.start).days
        self.mtd_rev = sl(mo.sold, a, D) / 100.0
        self.mtd_spend = sl(mo.ad_spend, a, D) / 100.0
        self.mtd_leads = sl(mo.leads, a, D)
        self.mtd_sales = sl(mo.sales, a, D)
        prev_months = []
        for k in range(1, 4):
            y_, m_ = w.end.year, w.end.month - k
            while m_ <= 0:
                m_ += 12
                y_ -= 1
            ps = date(y_, m_, 1)
            prev_months.append(sl(mo.sold, (ps - w.start).days, (month_end(ps) - w.start).days + 1) / 100.0)
        self.goal = round(float(np.mean(prev_months)) * 1.05 / 10000.0) * 10000.0
        elapsed = working_days(ms, w.end)
        total = working_days(ms, month_end(ms))
        self.pace_frac = elapsed / total
        self.pct_to_pace = round(100.0 * self.mtd_rev / (self.goal * self.pace_frac), 1)
        # per-market cost per set, trailing 7 days
        self.cps = {}
        for mi, m in enumerate(MARKETS):
            sp = float(mo.ad_spend[D - 7:D, mi].sum()) / 100.0
            st = float(mo.sets[D - 7:D, mi].sum())
            self.cps[m.name] = sp / st if st else None
        self.cpl7 = self.sp7 / max(self.leads7, 1)
        self.mer7 = self.rev7 / max(self.sp7, 1)
        self.cac7 = self.sp7 / max(self.sales7, 1)

    def pct(self, cur, prev):
        return round(100.0 * (cur - prev) / prev, 1) if prev else 0.0


# --------------------------------------------------------------------------------------
# cockpit feeds
# --------------------------------------------------------------------------------------


def write_kpi(w: World, mo: Money, h: Headline) -> None:
    best = min((v, k) for k, v in h.cps.items() if v)
    worst = max((v, k) for k, v in h.cps.items() if v)
    text = (f"Cost per set is ${best[0]:,.0f} in {best[1]} and ${worst[0]:,.0f} in {worst[1]} this week: move budget toward "
            f"{best[1]} and check the {worst[1]} landing page before Friday.")
    numbers = {
        "as_of": iso(w.end),
        "tiles": [
            {"key": "leads", "label": "Leads yesterday", "value": h.leads_y, "unit": "count", "delta_pct": h.pct(h.leads_y, h.leads_prev), "detail": "all markets, vs same day last week"},
            {"key": "meetings", "label": "Meetings held", "value": h.demos_y, "unit": "count", "delta_pct": h.pct(h.demos_y, h.demos_prev), "detail": "yesterday"},
            {"key": "opps", "label": "Appointments issued", "value": h.issues_y, "unit": "count", "delta_pct": h.pct(h.issues_y, h.issues_prev), "detail": "issued to reps"},
            {"key": "revenue", "label": "Booked revenue MTD", "value": round(h.mtd_rev), "unit": "usd", "delta_pct": round(h.pct_to_pace - 100.0, 1), "detail": "vs pace"},
            {"key": "cac", "label": "Blended CAC", "value": round(h.cac7), "unit": "usd", "delta_pct": h.pct(h.cac7, h.sp7p / max(h.sales7p, 1)), "detail": "ad spend per sale, last 7 days"},
            {"key": "mer", "label": "MER", "value": round(h.mer7, 2), "unit": "ratio", "delta_pct": h.pct(h.mer7, h.rev7p / max(h.sp7p, 1)), "detail": "last 7 days, revenue ÷ ad spend"},
        ],
        "pace": {"goal": int(h.goal), "actual": round(h.mtd_rev), "pct_to_pace": h.pct_to_pace, "through": iso(w.end)},
    }
    tiles = [
        {"key": t["key"], "label": t["label"], "value": t["value"], "unit": t["unit"], "as_of": iso(w.end), "source": "our database",
         "confidence": "deterministic", "detail": t["detail"]} for t in numbers["tiles"]
    ]
    write_json(OUT_DATA / "kpi.json", {"tiles": tiles, "one_thing": {"date": iso(w.end), "text": text, "file": ""}, "numbers": numbers})


def write_meta(w: World) -> None:
    built = ts_iso(w.end, 6, 30)
    feeds = {k: "ok" for k in ["board", "kpi", "routines", "initiatives", "consent_ops", "reports", "content"]}
    write_json(OUT_DATA / "meta.json", {
        "built_at": built, "feeds": feeds, "north_star_as_of": iso(w.end), "queue_as_of": iso(w.end),
        "queue_newest_delta": iso(w.end), "today": iso(w.end),
    })


CARDS = [
    # stage, title, description, owner, due offset (days from today), status, priority, blocked_on
    ("Market Research", "Publish this week's call SWOT to the growth channel", "Objections, strengths and weaknesses from last week's calls.", "Avery R.", -2, "open", "high", ""),
    ("Positioning & Offer", "Decide the winner of the free-inspection offer test", "Offer B leads by 12 percent on set rate after 1,900 leads.", "Morgan T.", 2, "open", "high", ""),
    ("Positioning & Offer", "Refresh the brand voice guide with the new financing line", "One paragraph and three example headlines.", "Casey L.", 9, "open", "medium", ""),
    ("Content Engine", "Approve the spring flagship film script", "Script set has three variations; variation two scores best.", "Riley S.", 1, "open", "high", ""),
    ("Content Engine", "Cut six vertical bytes from the install story", "The edit crew has the rough cut ready.", "Quinn P.", 4, "open", "medium", ""),
    ("Content Engine", "Release forms for the homeowner story shoot", "Two of four releases are signed.", "Parker W.", -1, "blocked", "high", "Two homeowners have not returned their release forms"),
    ("Paid Media", "Move 15 percent of Meta budget to the best-performing market", "Based on cost per set over the last 14 days.", "Reese D.", 0, "open", "high", ""),
    ("Paid Media", "Pause the two weakest Google ad groups in Riverbend", "Both run above twice the market cost per lead.", "Rowan G.", 3, "open", "medium", ""),
    ("Paid Media", "Order the November direct mail drop", "Six markets, one mailer, tracked by QR code.", "Skyler N.", 7, "open", "medium", ""),
    ("Paid Media", "Tag every social post with a tracked link", "Self-serve tagging is live; two stragglers remain.", "Dakota H.", -3, "open", "low", ""),
    ("Capture & Consent", "Review the stop request waiting on a person", "Ambiguous opt-outs held until someone rules.", "Emerson C.", -1, "open", "high", ""),
    ("Capture & Consent", "Confirm the home show lead form shows the consent line", "Check on the booth tablets before Saturday.", "Finley B.", 3, "open", "medium", ""),
    ("Speed to Lead", "Cut median first response on web chat under 90 seconds", "Currently 118 seconds in Lakemont.", "Harper J.", 5, "open", "high", ""),
    ("Speed to Lead", "Add a financing question path to the phone agent", "Financing is the third most common question.", "Jamie F.", 12, "open", "medium", ""),
    ("Sales Floor", "Coach the three reps below the connect-rate floor", "Use last week's scored calls as the examples.", "Kendall M.", 0, "open", "high", ""),
    ("Sales Floor", "Roll out the objection-handling module to the new hires", "Eight reps start the module Monday.", "Logan R.", 8, "open", "medium", ""),
    ("Attribution & Cost", "Close last month's agency invoice against the recorded spend", "Seventy dollars of fees are unposted.", "Mackenzie A.", -4, "blocked", "high", "Waiting on the agency's month-end invoice"),
    ("Attribution & Cost", "Sign off the monthly marketing payroll figure used in the marketing cost target", "Forty thousand a month, unchanged.", "Nico E.", 10, "open", "low", ""),
    ("Reporting Cockpit", "Add the pacing view to the Friday report", "Spend against budget by market.", "Oakley V.", 2, "open", "medium", ""),
    ("Reporting Cockpit", "Retire two dashboards nobody opened this quarter", "Open counts are on the usage board.", "Peyton Y.", 13, "open", "low", ""),
    ("Reliability", "Rotate the ad platform API credentials", "Quarterly rotation, no downtime expected.", "Remy O.", -2, "open", "high", ""),
    ("Reliability", "Add a stall alarm to the call transcription loop", "It ran 40 minutes long on Tuesday.", "Sage U.", 4, "open", "medium", ""),
    ("Reliability", "Review the three failed runs from last week", "All three were timeouts on the creative sync.", "Tatum Z.", 1, "open", "medium", ""),
]


def write_board(w: World) -> None:
    today = w.end
    cards = []
    for i, (stage, title, desc, owner, off, status, pri, blocked) in enumerate(CARDS, 1):
        due = today + timedelta(days=off)
        cards.append({
            "file": f"launch-{i:03d}", "name": f"launch-{i:03d}", "title": title, "description": desc, "status": status,
            "status_raw": status, "priority": pri, "priority_raw": pri, "domain": stage, "owner": owner, "due": iso(due),
            "blocked_on": blocked, "created": iso(today - timedelta(days=14 + i)), "mtime": epoch(today - timedelta(days=i % 5)),
        })
    overdue = [c["file"] for c in cards if c["due"] < iso(today) and c["status"] != "done"]
    due14 = [c["file"] for c in cards if iso(today) <= c["due"] <= iso(today + timedelta(days=14)) and c["status"] != "done"]
    blocked = [c["file"] for c in cards if c["status"] == "blocked"]
    write_json(OUT_DATA / "board.json", {
        "cards": cards,
        "views": {"overdue": overdue, "due14": due14, "blocked": blocked, "open": [c["file"] for c in cards]},
        "counts": {"total": len(cards), "open": len(cards), "overdue": len(overdue), "blocked": len(blocked)},
    })


JOBS = [
    ("daily-ad-pull", "06:10"), ("cost-sync", "06:25"), ("completeness-gate", "06:40"), ("creative-library-sync", "02:15"),
    ("call-scoring", "every 15 min"), ("self-refreshing-reports", "every 15 min"), ("daily-alert", "07:00"), ("sales-back-to-platforms", "05:30"),
    ("nightly-learning", "03:20"), ("nightly-backup", "01:30"), ("chat-handoff-check", "every 15 min"), ("speed-to-lead-weekly", "08:30"),
    ("hygiene-read-weekly", "08:45"), ("call-swot-weekly", "09:00"), ("cockpit", "always on"), ("answer-service", "always on"),
    ("usage-meter", "always on"), ("report-builder", "always on"),
]
SERVICES = [("cockpit", 0), ("answer-service", 0), ("usage-meter", 0), ("report-builder", 0)]


def write_routines(w: World) -> None:
    built = ts_iso(w.end, 6, 30)
    jobs = []
    for label, sched in JOBS:
        port = None
        jobs.append({"label": label.replace("-", " ").capitalize(), "schedule": sched, "loaded": True, "pid": None if sched != "always on" else 4100 + len(jobs),
                     "last_exit": 0, "plist": "", "serves_port": port})
    write_json(OUT_DATA / "routines.json", {
        "jobs": jobs, "services": [{"name": n.replace("-", " ").capitalize(), "port": p, "listening": True} for n, p in SERVICES], "alerts": [], "built_at": built,
    })


def _next_weekday(d: date, wd: int) -> date:
    return d + timedelta(days=(wd - d.weekday()) % 7)


def write_initiatives(w: World) -> None:
    today = w.end
    markets = [m.name for m in MARKETS]
    ev, live = [], []

    def event(init, init_label, label, channel, market, d, time=None, end_time=None, window_end=None, prio="normal", owner="Marketing lead",
              phones=None, source="registry"):
        return {"initiative": init, "initiative_label": init_label, "label": label, "channel": channel, "market": market, "date": iso(d),
                "time": time, "end_time": end_time, "window_end": iso(window_end) if window_end else None, "priority": prio,
                "owner": owner, "phones": phones, "source": source}

    # direct mail drops: a Tuesday per week, every market, in homes about five days later
    for k in range(-5, 8):
        d = _next_weekday(today, 1) + timedelta(days=7 * k)
        for m in markets[:3] if k % 2 else markets[3:] + markets[:1]:
            ev.append(event(f"mail-{m.lower()}", f"Direct mail, {m}", f"Mailer drop: fall offer, {m}", "direct_mail", m, d,
                            window_end=d + timedelta(days=9), prio="high" if m == "Harborview" else "normal", owner="Media buyer",
                            phones=f"Expect calls up about 20 percent in {m} from day three after the drop; staff the afternoon shift."))
    # TV flights: four weeks on, one off
    for m in ("Harborview", "Pinecrest", "Stonebridge", "Sunvale"):
        for k in range(-1, 3):
            start = today - timedelta(days=today.weekday()) + timedelta(days=35 * k)
            end = start + timedelta(days=27)
            if end >= today - timedelta(days=3) and start <= today + timedelta(days=45):
                ev.append(event(f"tv-{m.lower()}", f"Regional TV, {m}", f"TV flight starts, {m}", "tv", m, start, "18:00", "22:00",
                                prio="high", owner="Marketing lead", phones="Evening spots run Monday to Thursday; calls land the next morning."))
                if start <= today <= end:
                    live.append({"id": f"tv-{m.lower()}", "channel": "tv", "label": f"Regional TV flight, {m}", "market": m, "start": iso(start),
                                 "end": iso(end), "owner": "Marketing lead", "phones": "Morning call volume runs high after evening spots.",
                                 "exec": "Four-week flight, one week dark after.", "lp_subsource": "Regional TV",
                                 "tracking": {"status": "ok", "owner": "Media buyer", "note": "call tracking number rotates by flight", "due": iso(end)},
                                 "days_left": (end - today).days})
    # home shows on weekends
    show_days = sorted({(w.days[di], mid) for (di, mid) in w.extra["show_days"]} | set())
    for k in range(0, 6):
        sat = _next_weekday(today, 5) + timedelta(days=7 * k)
        if k % 3 == 1:
            m = ("Harborview", "Stonebridge", "Sunvale", "Pinecrest")[(k // 3) % 4]
            ev.append(event(f"show-{m.lower()}", f"Home show, {m}", f"Home show weekend, {m}", "events", m, sat, "10:00", "18:00",
                            window_end=sat + timedelta(days=1), prio="high", owner="Events manager",
                            phones="Booth leads sync to the call list Monday morning."))
    for k in range(0, 3):
        d = today + timedelta(days=4 + 10 * k)
        ev.append(event("social-test", "Social creative test", f"New reel set goes live, test {k + 1}", "social", "All markets", d, "09:00",
                        owner="Content lead", phones="Watch set rate on the weekend for the first 48 hours."))
    ev.append(event("billboard-hrb", "Billboard, Harborview", "Billboard creative swap, Harborview", "billboard", "Harborview", today + timedelta(days=6),
                    owner="Media buyer", phones="Same phone number; no change to routing."))
    ev.append(event("magazine-regional", "Regional home magazine", "Magazine issue lands, November", "magazine", "Pinecrest", today + timedelta(days=11),
                    owner="Media buyer", phones="A small bump for two weeks."))
    live.append({"id": "billboard-hrb", "channel": "billboard", "label": "Billboard, Harborview north corridor", "market": "Harborview",
                 "start": iso(today - timedelta(days=21)), "end": iso(today + timedelta(days=39)), "owner": "Media buyer",
                 "phones": "Steady background calls; no spike.", "exec": "Sixty-day flight.", "lp_subsource": "Billboard",
                 "tracking": {"status": "ok", "owner": "Media buyer", "note": "vanity URL and QR on the board", "due": iso(today + timedelta(days=39))},
                 "days_left": 39})
    live.append({"id": "video-streaming", "channel": "video", "label": "Streaming video, all markets", "market": None,
                 "start": iso(today - timedelta(days=9)), "end": iso(today + timedelta(days=19)), "owner": "Marketing lead",
                 "phones": "Lifts branded search two days later.", "exec": "Awareness flight tied to the TV markets.",
                 "lp_subsource": "Streaming video",
                 "tracking": {"status": "needs_fix", "owner": "Media buyer", "note": "tracked link missing on one creative", "due": iso(today + timedelta(days=2))},
                 "days_left": 19})
    ev.sort(key=lambda e: (e["date"], e["time"] or "99:99", e["label"]))
    today_ev = [e for e in ev if e["date"] == iso(today)]
    up14 = [e for e in ev if iso(today) < e["date"] <= iso(today + timedelta(days=14))]
    items = [
        {"id": "oi-1", "label": "Confirm the tracked link on the streaming creative", "owner": "Media buyer", "due": iso(today + timedelta(days=2)),
         "status": "open", "initiative": "video-streaming", "initiative_label": "Streaming video", "note": "One creative ships without its tracked link.", "overdue": False},
        {"id": "oi-2", "label": "Send the November mail list to the vendor", "owner": "Marketing lead", "due": iso(today - timedelta(days=1)),
         "status": "open", "initiative": "mail-harborview", "initiative_label": "Direct mail, Harborview", "note": "Vendor needs it three days ahead.", "overdue": True},
        {"id": "oi-3", "label": "Staff the Saturday home show booth", "owner": "Events manager", "due": iso(today + timedelta(days=3)),
         "status": "in_progress", "initiative": "show-stonebridge", "initiative_label": "Home show, Stonebridge", "overdue": False},
    ]
    write_json(OUT_DATA / "initiatives.json", {
        "today_date": iso(today), "today": today_ev, "live": live, "upcoming14": up14, "calendar": ev, "cover_today": None, "next_cover": None,
        "quiet_today": {"date": iso(today), "why": "no mail, TV or show placement lands today"} if not today_ev else None,
        "volume_week": {"start": iso(today - timedelta(days=today.weekday())), "end": iso(today - timedelta(days=today.weekday()) + timedelta(days=6)),
                        "band": "normal", "why": "one mail drop, no show weekend"},
        "open_items": items, "standing_asks": ["Tag every placement with a tracked link before it runs.", "Tell the floor the day before any drop."],
        "alert": False,
        "counts": {"initiatives": len({e["initiative"] for e in ev}), "live": len(live), "today": len(today_ev), "upcoming14": len(up14), "open_items": len(items)},
        "as_of": ts_iso(today, 6, 30), "registry_updated": iso(today - timedelta(days=2)), "registry": "demo media calendar",
    })


def write_consent(w: World) -> None:
    gen = ts_iso(w.end, 6, 30) + "-05:00"
    base = datetime(w.end.year, w.end.month, w.end.day, 17, 0)
    at = lambda mins: (base - timedelta(minutes=mins)).isoformat(timespec="seconds") + "-05:00"
    items = [
        {"kind": "failed_job", "job": "Nightly consent replay", "owner": "Compliance lead", "owner_basis": "named", "severity": "critical",
         "state": "failed", "age_s": 1260, "at": at(21), "exit_code": 4, "what": "Nightly consent replay failed; retry queued"},
        {"kind": "spool", "severity": "warning", "state": "waiting", "age_s": 420, "held": 2, "revokes_held": 1, "limit_s": 900,
         "owner": "Compliance lead", "owner_basis": "named",
         "what": "2 consent captures held, inside the 15-minute limit"},
        {"kind": "failed_dispatch", "severity": "warning", "request_id": 4412, "lane": "text messages", "channel": "text", "purpose": "transactional",
         "provider": "demo-gateway", "status": "failed", "contact": "phone …0142", "person_ref": "P002", "prospect_id": None, "at": at(190),
         "age_s": 11400, "owner": "Messaging lead", "owner_basis": "default", "what": "Text message failed at the carrier"},
        {"kind": "ambiguous_stop", "severity": "warning", "candidate_id": 318, "source_lane": "website chat", "contact": "phone …7731",
         "person_ref": "P001", "prospect_id": "NB-20418", "at": at(95), "age_s": 5700, "owner": "Compliance lead", "owner_basis": "named",
         "state": "waiting", "what": "Stop request needs a person's call (website chat)"},
    ]
    write_json(OUT_DATA / "consent_ops.json", {
        "schema": "consent_ops/1", "generated_at": gen, "stale_after_s": 315360000, "tier": "T1",
        "source": {"store": "demo consent register", "database": "synthetic", "transaction": "read only", "owners_version": "demo-1.0",
                   "owners_signed_by": "Compliance lead (demo)"},
        "exceptions": {
            "counts": {"failed_job": 1, "spool": 1, "failed_dispatch": 1, "ambiguous_stop": 1},
            "sections": {
                "failed_job": {"state": "ok", "count": 1, "shown": 1, "owner": "Compliance lead"},
                "spool": {"state": "ok", "count": 1, "shown": 1, "owner": "Compliance lead"},
                "failed_dispatch": {"state": "ok", "count": 1, "shown": 1},
                "ambiguous_stop": {"state": "ok", "count": 1, "shown": 1},
                "pending_booking": {"state": "ok", "count": 0, "shown": 0},
            },
            "items": items,
        },
        "timeline": {"window_days": 14, "contact_points_in_window": 2, "contact_points_cap": 150, "persons_shown": 2, "entries_cap": 40,
                     "basis": "synthetic demo data", "shared_person_keys_split": 0},
        "persons": [
            {"ref": "P001", "prospect_ids": ["NB-20418"], "contacts": ["phone …7731"], "last_at": at(95), "entries_total": 3, "entries_shown": 3,
             "timeline": [
                 {"at": at(95), "kind": "hold", "what": "stop queued for a person", "lane": "website chat", "channel": None, "contact": "phone …7731"},
                 {"at": at(100), "kind": "decision", "what": "held for review (marketing)", "lane": "website chat", "channel": "text", "contact": "phone …7731"},
                 {"at": at(1900), "kind": "capture", "what": "grant (voice, text)", "lane": "estimate form", "channel": None, "contact": "phone …7731"},
             ]},
            {"ref": "P002", "prospect_ids": [], "contacts": ["phone …0142"], "last_at": at(190), "entries_total": 2, "entries_shown": 2,
             "timeline": [
                 {"at": at(190), "kind": "dispatch", "what": "text failed at the carrier", "lane": "text messages", "channel": "text", "contact": "phone …0142"},
                 {"at": at(2600), "kind": "capture", "what": "grant (text)", "lane": "home show form", "channel": None, "contact": "phone …0142"},
             ]},
        ],
    })


def write_snapshots(w: World, mo: Money, h: Headline, S) -> None:
    d = OUT_DATA / "snapshots"
    asof = ts_iso(w.end, 6, 30)
    ai, wk = S.ai(), S.work()
    write_json(d / "_index.json", ["pipeline_health", "launch_week", "ai_ops_pulse"])
    write_json(d / "pipeline_health.json", {"as_of": asof, "data": {
        "Leads, last 7 days": int(h.leads7), "Sets, last 7 days": int(h.sets7), "Sales, last 7 days": int(h.sales7),
        "Cost per lead": f"${h.cpl7:,.2f}", "Cost per sale": f"${h.cac7:,.0f}", "MER": f"{h.mer7:.1f}x"}})
    overdue = sum(1 for c in CARDS if c[4] < 0)
    blocked = sum(1 for c in CARDS if c[5] == "blocked")
    write_json(d / "launch_week.json", {"as_of": asof, "data": {
        "Placements live": 3, "Open launch tasks": len(CARDS), "Overdue": overdue, "Blocked": blocked, "Next drop": "Tuesday, Harborview"}})
    write_json(d / "ai_ops_pulse.json", {"as_of": asof, "data": {
        "Loops healthy": f"{len(JOBS) - 1} of {len(JOBS)}", "Runs, last 7 days": int(wk["runs"]), "Graded accuracy": f"{100 * ai['right'] / ai['graded']:.1f}%",
        "AI cost yesterday": f"${ai['actual_y']:,.0f}", "Net saved yesterday": f"${ai['net_y']:,.0f}", "Open knowledge gaps": ai["open_gaps"]}})
