"""public/demo/ fixtures: the home map's stage cards, the scripted chat, the artifacts ring and the run panel.

Every number quoted in prose comes from `stats.Stats`, which queries the generated parquet.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from feeds_money import TARGET_PCT
from common import OUT_DEMO, OUT_DATA, iso, stream, ts_iso, write_json
import fixtures_apps
from stats import Stats
from world import World

GTM_JSON = OUT_DEMO.parent.parent / "lib" / "demo" / "gtm.json"


def usd(x, d=0):
    return f"${x:,.{d}f}"


def pct(x, d=1):
    return f"{x:.{d}f}%"


def delta(cur, prev, d=0):
    if not prev:
        return "flat"
    ch = 100.0 * (cur - prev) / prev
    if round(abs(ch), d) == 0:
        return "flat"
    return f"{'up' if ch >= 0 else 'down'} {abs(ch):.{d}f}%"


PLATFORM_NAME = {"google_ads": "Google Ads", "meta": "Meta", "microsoft_ads": "Microsoft Ads"}


def n(x):
    return f"{int(round(x)):,}"


def pretty(iso_day: str) -> str:
    d = datetime.fromisoformat(iso_day)
    return d.strftime("%b ") + str(d.day)


def src(label, href):
    return {"label": label, "href": href}


def build_chat(S: Stats, w: World, ex: dict, M: dict) -> dict:
    e = w.end
    K = lambda key, win: "{{" + key + "@" + win + "}}"
    MV = lambda win: M["windows"][win]["values"]
    MP = lambda win: M["windows"][win]["prior"]
    d7, p7, p7e = S.d7, S.p7, S.p7e
    pw = S.paid_week()
    f7, fp = S.funnel(d7, e), S.funnel(p7, p7e)
    f28 = S.funnel(e - timedelta(days=27), e)
    fy, fyw = S.funnel(e, e), S.funnel(e - timedelta(days=7), e - timedelta(days=7))
    sp7, spp = S.adspend(d7, e), S.adspend(p7, p7e)
    mk7 = S.funnel_by_market(d7, e)
    mk28 = S.funnel_by_market(e - timedelta(days=27), e)
    sm7 = S.adspend_by_market(d7, e)
    cps = sorted([(sm7.get(m["id"], 0) / m["sets"], m["name"], m["sets"]) for m in mk7 if m["sets"]])
    floor, floor_p = S.floor(d7, e), S.floor(p7, p7e)
    agents = S.agent_rates(e - timedelta(days=13), e)
    gsc, gscp = S.gsc(d7, e), S.gsc(p7, p7e)
    tq = S.top_query(d7, e)
    ga = S.ga4_channels(d7, e)
    ai, wk, eff, land = S.ai(), S.work(), S.efficiency(), S.landing()
    weak, best = S.weakest_campaign(), S.best_campaign()
    srcs = S.source_costs(e - timedelta(days=27), e)
    srcc = S.source_close(e - timedelta(days=27), e)
    mail = next(x for x in srcs if x["name"] == "Direct Mail")
    tv = next(x for x in srcs if x["name"] == "Regional TV")
    close_by_mkt = sorted([(m["sales"] / m["issues"] * 100 if m["issues"] else 0, m["name"], m["issues"]) for m in mk28], reverse=True)
    cpl7 = sp7 / f7["leads"]
    cplp = spp / fp["leads"]
    mer7 = f7["gross"] / sp7
    merp = fp["gross"] / spp
    mtd, goal, pace = M["pace"]["actual"], M["pace"]["goal"], M["pace"]["pct_to_pace"]
    lib = ex["studio"]["library"]
    cur_eff = eff["cur"]
    entries = []

    def add(id_, match, q, answer, sources, follow):
        entries.append({"id": id_, "match": match, "q": q, "answer": answer, "sources": sources, "follow_ups": follow})

    plats = ", ".join(f"{PLATFORM_NAME[k]} {usd(v)}" for k, v in pw["cur"].items())
    add("paid-week", ["paid", "spend", "ads", "week", "media"], "How did paid media do this week?",
        f"Ad spend was **{K('ad_spend','last7')}** over the last 7 days, {delta(MV('last7')['ad_spend'], MP('last7')['ad_spend'])} on the week before.\n{plats} went through the three ad platforms; the rest is agency fees and offline media.\n"
        f"That spend sat against {K('gross_revenue','last7')} of revenue, a MER of {K('mer','last7')}.",
        [src("Paid Media report", "/reports/#paid_media")], ["Which campaign is the weakest?", "What is our MER this week?"])
    add("weakest-campaign", ["weakest", "worst", "campaign", "waste", "pause"], "Which campaign is the weakest?",
        f"Over the last 14 days **{weak[0]}** ({PLATFORM_NAME[weak[1]]}) cost {usd(weak[4], 2)} per conversion on {usd(weak[2])} of spend, "
        f"the highest of any lead-generating campaign above $3,000. The best was {best[0]} at {usd(best[4], 2)}. Awareness video is left out of this ranking.\nA pause or a budget cut here frees money for the winners.",
        [src("Paid Media report", "/reports/#paid_media")], ["Which market has the lowest cost per set?"])
    add("best-campaign", ["best", "strongest", "winning", "campaign", "top"], "Which campaign is working best?",
        f"**{best[0]}** is the most efficient campaign over the last 14 days at {usd(best[4], 2)} per conversion on {usd(best[2])} of spend.",
        [src("Paid Media report", "/reports/#paid_media")], ["Which campaign is the weakest?"])
    add("leads-yesterday", ["leads", "yesterday", "volume"], "How many leads did we get yesterday?",
        f"**{K('leads','yesterday')} leads** yesterday, {delta(MV('yesterday')['leads'], MP('yesterday')['leads'])} on the same day last week. Of those leads, {K('sets','yesterday')} appointments were set, and the day closed with {K('sales','yesterday')} sales.",
        [src("Overview", "/reports/")], ["How is the funnel this week?"])
    add("cost-per-lead", ["cost", "lead", "cpl", "cheaper"], "What is our cost per lead?",
        f"Cost per lead is **{K('cost_per_lead','last7')}** over the last 7 days ({delta(MV('last7')['cost_per_lead'], MP('last7')['cost_per_lead'])} on the prior week): {K('ad_spend','last7')} of ad spend over {K('leads','last7')} leads.",
        [src("Overview", "/reports/")], ["What is our MER this week?"])
    add("mer", ["mer", "return", "revenue", "spend", "efficiency"], "What is our MER this week?",
        f"MER is **{K('mer','last7')}** over the last 7 days: {K('gross_revenue','last7')} of revenue on {K('ad_spend','last7')} of ad spend. The prior week was {MP('last7')['mer']:.1f}x.",
        [src("Workbench boards", "/reports/workbench/?board=board-mer")], ["Where does the month land?"])
    add("revenue-mtd", ["revenue", "month", "pace", "goal", "booked"], "Are we on pace this month?",
        f"Booked revenue is **{K('gross_revenue','mtd')}** month to date, through {pretty(M['through'])}, against a monthly goal of {usd(goal)}. The goal expects about {usd(M['pace']['expected_by_today'])} by now, so we are at {M['pace']['pct_to_pace']:.0f}% of pace.",
        [src("Exec readout", "/reports/exec/")], ["Where does the month land?"])
    add("funnel-week", ["funnel", "sets", "demos", "conversion", "week"], "How is the funnel this week?",
        f"Last 7 days: **{K('leads','last7')} leads**, {K('sets','last7')} appointments set, {K('issued','last7')} issued, {K('meetings','last7')} meetings held and **{K('sales','last7')} sales**.\n"
        f"Set rate {K('set_rate','last7')} ({MP('last7')['set_rate']:.1f}% the week before); close rate {K('close_rate','last7')}.",
        [src("Workbench", "/reports/workbench/")], ["What is the set rate?"])
    add("best-market", ["market", "lowest", "cost per set", "best", "worst"], "Which market has the lowest cost per set?",
        f"Over the last 7 days **{cps[0][1]}** is the cheapest at {usd(cps[0][0])} per set ({cps[0][2]} sets) and **{cps[-1][1]}** the most expensive at {usd(cps[-1][0])}.\n"
        f"Moving budget toward the cheaper market is the first lever.",
        [src("Digital Marketing board", "/reports/digital/")], ["Which market closes best?"])
    add("close-market", ["close", "rate", "market", "closes", "best"], "Which market closes best?",
        f"Over 28 days **{close_by_mkt[0][1]}** closes best at {pct(close_by_mkt[0][0])} of issued appointments, and {close_by_mkt[-1][1]} lowest at {pct(close_by_mkt[-1][0])}. "
        f"Company close rate over the same days is {K('close_rate','last28')}.",
        [src("Workbench", "/reports/workbench/")], ["Which source's leads close best?"])
    add("set-rate", ["set", "rate", "appointments", "booked"], "What is the set rate?",
        f"Set rate is **{K('set_rate','last7')}** over the last 7 days against {MP('last7')['set_rate']:.1f}% the week before: {K('sets','last7')} appointments set from {K('leads','last7')} leads.",
        [src("Overview", "/reports/")], ["What is the connect rate on the floor?"])
    add("connect-rate", ["connect", "dials", "floor", "calls", "rate"], "What is the connect rate on the floor?",
        f"The floor connected **{K('connect_rate','last7')}** of {K('dials','last7')} dials over the last 7 days (prior week {MP('last7')['connect_rate']:.1f}%), with about {floor['agents']:.0f} reps on each open day.",
        [src("Sales Floor", "/reports/#call_center")], ["Which reps are below the floor average?"])
    low = agents[:3]
    add("agents-below", ["reps", "agents", "below", "coach", "lowest"], "Which reps are below the floor average?",
        "The three lowest connect rates over 14 days: " + ", ".join(f"**{a[0]}** {pct(a[3])} on {int(a[1])} dials" for a in low) +
        f". The floor average is {pct(floor['rate'])}, so these are the coaching candidates.",
        [src("Sales Floor", "/reports/#call_center")], ["What is the connect rate on the floor?"])
    add("source-close", ["source", "close", "best", "referral", "leads"], "Which source's leads close best?",
        f"Over 28 days **{srcc[0]['name']}** closes best at {pct(srcc[0]['close'])} of meetings held ({int(srcc[0]['demos'])} meetings). "
        f"The weakest is {srcc[-1]['name']} at {pct(srcc[-1]['close'])}.",
        [src("Digital Marketing board", "/reports/digital/")], ["How is direct mail doing?"])
    add("direct-mail", ["mail", "direct", "postcards", "mailer"], "How is direct mail doing?",
        f"Over 28 days direct mail produced **{int(mail['leads'])} leads** and {int(mail['sets'])} sets on {usd(mail['spend'])} of spend, "
        f"{usd(mail['cps'])} per set. Responses land over the ten days after each Tuesday drop.",
        [src("Digital Marketing board", "/reports/digital/")], ["How is regional TV doing?"])
    add("tv", ["tv", "television", "flight", "regional"], "How is regional TV doing?",
        f"Regional TV over 28 days: **{int(tv['leads'])} leads**, {int(tv['sets'])} sets, {usd(tv['spend'])} of spend, {usd(tv['cps'])} per set. "
        f"Four markets carry flights, four weeks on and one off.",
        [src("Digital Marketing board", "/reports/digital/")], ["How is direct mail doing?"])
    add("organic", ["organic", "search", "seo", "clicks", "google"], "How is organic search doing?",
        f"Search Console clicks were **{int(gsc['clicks']):,}** over the last 7 days, {delta(gsc['clicks'], gscp['clicks'])} on the prior week, from {int(gsc['impressions']):,} impressions. "
        f"The top query was \"{tq[0]}\" with {int(tq[1])} clicks.",
        [src("Organic report", "/reports/#organic")], ["Which channels send the most web traffic?"])
    tot = sum(x[1] for x in ga)
    add("web-traffic", ["traffic", "sessions", "website", "channels", "web"], "Which channels send the most web traffic?",
        "Sessions over the last 7 days: " + ", ".join(f"**{g[0]}** {int(g[1]):,} ({100 * g[1] / tot:.0f}%)" for g in ga[:3]) + f", out of {int(tot):,} in total.",
        [src("Organic report", "/reports/#organic")], ["How is organic search doing?"])
    add("ai-accuracy", ["ai", "accuracy", "answers", "graded", "chat"], "How accurate are the AI answers?",
        f"Of {int(ai['graded']):,} answers a reviewer graded in the last 7 days, **{pct(100 * ai['right'] / ai['graded'])}** were right. "
        f"The AI answered {pct(100 * ai['answered'] / ai['asked'])} of {int(ai['asked']):,} questions itself, handed off {pct(100 * ai['deflected'] / ai['asked'])} and declined {pct(100 - 100 * ai['answered'] / ai['asked'] - 100 * ai['deflected'] / ai['asked'])}.",
        [src("AI accuracy board", "/reports/workbench/")], ["What does the AI cost?"])
    add("ai-cost", ["ai", "cost", "tokens", "savings", "saved"], "What does the AI cost?",
        f"AI workloads made {int(ai['calls']):,} calls in the last 7 days. At vendor list price that work would cost **{usd(ai['frontier'])}**; it actually cost {usd(ai['actual'])}, "
        f"a saving of {usd(round(ai['frontier']) - round(ai['actual']))}. Month to date the saving is {usd(ai['mtd_net'])}.",
        [src("AI cost board", "/reports/workbench/")], ["How healthy are the loops?"])
    add("loops-health", ["loops", "jobs", "health", "failed", "reliability"], "How healthy are the loops?",
        f"The scheduled loops, AI seats and playbooks ran **{int(wk['runs']):,} times** in the last 7 days; {pct(100 * (wk['runs'] - wk['failed']) / wk['runs'], 2)} succeeded and {int(wk['failed'])} failed. "
        f"One loop, the creative library sync, has not fired in two days and is flagged on the health page.",
        [src("Health", "/reports/#health")], ["What does the AI cost?"])
    add("efficiency", ["marketing cost", "cost target", "target", "percent of revenue"], "Where are we against the marketing cost target?",
        f"All-in marketing cost is **{K('marketing_cost_pct','mtd')}** of net revenue month to date against a target of {TARGET_PCT:.0f}%. "
        f"Last month closed at {K('marketing_cost_pct','mom')}.",
        [src("Marketing cost target board", "/reports/workbench/?board=board-efficiency-target")], ["Where does the month land?"])
    add("month-landing", ["land", "projection", "forecast", "month", "end"], "Where does the month land?",
        f"Pacing the share of a month normally booked by today, the month lands near **${land[1] / 1e6:.1f}M**, somewhere between ${land[2] / 1e6:.2f}M and ${land[3] / 1e6:.2f}M. "
        f"The goal is ${goal / 1e6:.2f}M.",
        [src("Workbench", "/reports/workbench/")], ["Are we on pace this month?"])
    n_ready = sum(1 for x in lib if x["stage"] == "approved")
    n_review = sum(1 for x in lib if x["stage"] == "review")
    add("content-pipeline", ["content", "pipeline", "creative", "videos", "library"], "What is in the content pipeline?",
        f"The library holds **{len(lib)} pieces**: {n_ready} approved, {n_review} in review and {len(lib) - n_ready - n_review} in draft. "
        f"The edit crew has {len(ex['studio']['cuts'])} cuts in progress.",
        [src("Content Studio", "/studio/")], ["What changed this week?"])
    add("consent", ["consent", "stop", "opt-out", "exceptions", "compliance"], "Are there consent exceptions open?",
        "Four consent items are open: one failed replay job, one capture held briefly, one failed text and one ambiguous stop waiting on a person. "
        "None is past its limit; the ambiguous stop is the one that needs a decision today.",
        [src("Capture and consent", "/capture/")], ["How healthy are the loops?"])
    to = ex["research"]["top_objection"]
    add("top-objection", ["objection", "calls", "objections", "swot", "spouse"], "What is the top objection on calls?",
        f"**\"{to['text']}\"** came up on {n(to['calls'])} of {n(floor['connects'])} connected calls this week and is trending {to['trend']}. "
        f"Suggested response: {to['rebuttal'][:1].lower() + to['rebuttal'][1:]}",
        [src("Research", "/research/")], ["Where does the month land?"])
    add("speed", ["speed", "response", "fast", "latency", "first"], "How fast does the AI respond?",
        f"The median full answer takes **{ai['latency_s']:.1f} seconds** end to end over the last 7 days, inside the 3.5 second budget. "
        f"Open knowledge gaps: {ai['open_gaps']}.",
        [src("AI accuracy board", "/reports/workbench/")], ["How accurate are the AI answers?"])
    add("what-changed", ["changed", "week", "summary", "news", "happened"], "What changed this week?",
        f"Leads were {delta(MV('last7')['leads'], MP('last7')['leads'])}, ad spend {delta(MV('last7')['ad_spend'], MP('last7')['ad_spend'])} and revenue {delta(MV('last7')['gross_revenue'], MP('last7')['gross_revenue'])}. "
        f"MER {'held at ' + K('mer','last7') if round(MP('last7')['mer'], 1) == round(MV('last7')['mer'], 1) else 'moved from ' + format(MP('last7')['mer'], '.1f') + 'x to ' + K('mer','last7')}. "
        f"The floor connect rate {'held at ' + K('connect_rate','last7') if round(MP('last7')['connect_rate'], 1) == round(MV('last7')['connect_rate'], 1) else 'went from ' + format(MP('last7')['connect_rate'], '.1f') + '% to ' + K('connect_rate','last7')}.",
        [src("Overview", "/reports/")], ["How did paid media do this week?"])
    pm7, pp7 = {m["name"]: m for m in mk7}, {m["name"]: m for m in S.funnel_by_market(p7, p7e)}
    lead_gap = sorted([(100.0 * (pm7[k]["leads"] - pp7[k]["leads"]) / pp7[k]["leads"], k, pm7[k]["leads"], pp7[k]["leads"]) for k in pm7 if k in pp7 and pp7[k]["leads"]])
    add("market-leads", ["market", "behind", "leads", "pacing"], "Which market is behind on leads?",
        f"**{lead_gap[0][1]}** is furthest behind: {int(lead_gap[0][2]):,} leads in the last 7 days against {int(lead_gap[0][3]):,} the week before ({lead_gap[0][0]:+.0f}%). "
        f"**{lead_gap[-1][1]}** is furthest ahead at {lead_gap[-1][0]:+.0f}%. Across all markets there were {K('leads','last7')} leads.",
        [src("Leads and geo", "/reports/#leads_geo")], ["Which market has the lowest cost per set?"])
    add("ai-books", ["book", "booked", "appointments", "schedule", "ai"], "How many appointments did the AI book?",
        "None. The AI phone line does not book appointments. After hours it answers the call, captures the caller's name, address and need, and emails the team a summary the next morning. "
        "A person on the call floor sets the appointment.",
        [src("AI front door", "/reports/workbench/?board=board-ai-accuracy")], ["How accurate are the AI answers?"])
    add("ai-daytime", ["daytime", "business", "hours", "phone", "answer", "calls"], "Does the AI phone answer calls during the day?",
        "No. Daytime calls go to the call floor. The AI phone line covers after-hours calls, and the website chat answers visitors around the clock and emails the team the full conversation for leads and complaints.",
        [src("AI front door", "/reports/workbench/?board=board-ai-accuracy")], ["What is the connect rate on the floor?"])
    assert 20 <= len(entries) <= 40, len(entries)
    return {
        "intro": "Ask about leads, spend, speed to lead, the sales floor, AI or content. Answers come from the demo company's data.",
        "suggestions": ["How did paid media do this week?", "Which market has the lowest cost per set?", "Which reps are below the floor average?",
                        "What is the top objection on calls?", "Where does the month land?", "How accurate are the AI answers?"],
        "fallback": "That one is outside this demo script. Try one of the suggestions.", "entries": entries,
    }


def build_stage_stats(S: Stats, w: World, ex: dict, M: dict) -> dict:
    e = w.end
    d7 = S.d7
    pw = S.paid_week()
    floor = S.floor(d7, e)
    ai, wk, eff = S.ai(), S.work(), S.efficiency()
    rs = ex["research"]
    lib = ex["studio"]["library"]
    def k(v):
        return f"${v / 1000:.1f}k"

    def dl(cur, prev):
        t = delta(cur, prev)
        return "flat" if t.startswith("up 0") or t.startswith("down 0") else t

    stages = [
        ("Market Research", f"{rs['objections']} objections", str(rs["objections"]), "weekly", "ok"),
        ("Positioning & Offer", f"{rs['offers_winning']} winning", str(rs["offers_winning"]), f"{rs['offers_testing']} testing", "ok"),
        ("Content Engine", f"{len(lib)} pieces", str(len(lib)), f"{sum(1 for x in lib if x['stage'] == 'approved')} approved", "ok"),
        ("Paid Media", f"{k(M['windows']['last7']['values']['ad_spend'])}, 7 days", k(M["windows"]["last7"]["values"]["ad_spend"]), dl(M["windows"]["last7"]["values"]["ad_spend"], M["windows"]["last7"]["prior"]["ad_spend"]), "ok"),
        ("Capture & Consent", "4 open", "4", "none past limit", "watch"),
        ("Speed to Lead", f"{pct(100 * ai['answered'] / ai['asked'])} answered", pct(100 * ai["answered"] / ai["asked"]), f"{pct(100 * ai['right'] / ai['graded'])} right", "ok"),
        ("Sales Floor", f"{pct(M['windows']['last7']['values']['connect_rate'])} connect", pct(M["windows"]["last7"]["values"]["connect_rate"]), f"{floor['agents']:.0f} reps", "ok"),
        ("Attribution & Cost", f"{pct(M['windows']['mtd']['values']['marketing_cost_pct'])} of revenue", pct(M["windows"]["mtd"]["values"]["marketing_cost_pct"]), f"target {TARGET_PCT:.0f}%", "ok" if M["windows"]["mtd"]["values"]["marketing_cost_pct"] <= TARGET_PCT + 3 else "watch"),
        ("Reporting Cockpit", "100% fresh", "100%", "on time", "ok"),
        ("Reliability", f"{int(wk['failed'])} failed runs", str(int(wk["failed"])), "1 loop stale", "alert"),
    ]
    names = [s["name"] for s in json.loads(GTM_JSON.read_text())["stages"]]
    if names != [s[0] for s in stages]:
        raise ValueError(f"stage names differ from lib/demo/gtm.json: {names} vs {[s[0] for s in stages]}")
    return {"as_of": iso(e), "stages": [{"name": n, "headline": h, "value": v, "delta": d, "status": st} for n, h, v, d, st in stages]}


RING_ITEMS = [
    ("Weekly paid media read", "report", ["paid", "weekly"], "Paid media operator", "Spend, waste and tracking risk across the three platforms."),
    ("Call SWOT, last 7 days", "report", ["research", "calls"], "Call SWOT loop", "Objections, strengths and weaknesses."),
    ("Spring offer test brief", "brief", ["offer", "test"], "Growth marketing lead", "Three offers, one winner so far."),
    ("Brand voice guide v3", "playbook", ["brand", "voice"], "Brand voice pass", "Tone rules every content tool follows."),
    ("Q4 budget allocation", "deck", ["budget", "planning"], "Growth marketing lead", "Where each dollar goes by market and channel."),
    ("Efficiency target readout", "report", ["efficiency", "cost"], "Marketing analyst", "All-in cost against net revenue by market."),
    ("November mail drop plan", "brief", ["mail", "offline"], "Media buyer", "Six markets, one mailer, a QR code on each."),
    ("Storm-prep reel set", "script", ["content", "social"], "Viral ad scriptwriter", "Three script variations for the weekend burst."),
    ("Install story flagship script", "script", ["content", "video"], "Viral ad scriptwriter", "Seventy-eight second film with six cut-down bytes."),
    ("Speed-to-lead weekly", "report", ["speed", "weekly"], "Speed-to-lead loop", "First-touch time by channel."),
    ("AI front door scorecard", "report", ["ai", "weekly"], "AI front door loop", "Answer rate, accuracy and hand-offs."),
    ("Financing explainer carousel", "deck", ["content", "financing"], "Slide and carousel builder", "Seven slides, brand checked."),
    ("Meta budget shift proposal", "brief", ["paid", "meta"], "Paid media operator", "Move 15 percent to the cheapest market."),
    ("Home show staffing kit", "playbook", ["events", "sales"], "Events seat", "Booth script, staffing grid and lead form."),
    ("Consent exceptions summary", "report", ["consent", "compliance"], "Compliance lead", "Four open items and their owners."),
    ("Creative library sync log", "report", ["creative", "ops"], "Creative library sync", "Ads pulled from three platforms and described."),
    ("Agency invoice reconciliation", "report", ["cost", "agency"], "Cost accuracy crew", "Seventy dollars of fees unposted."),
    ("Rep coaching notes, week 42", "brief", ["sales", "coaching"], "Sales floor coach", "Three reps, three scored calls each."),
    ("Objection handling module", "playbook", ["sales", "training"], "Training classroom", "Eight new hires start Monday."),
    ("Website chat transcript review", "report", ["ai", "chat"], "AI outlier review", "Twelve flagged conversations, all handed to a person."),
    ("Weekly report, Friday", "report", ["weekly", "exec"], "Marketing analyst", "Revenue, spend, MER and pacing."),
    ("QR campaign set, yard signs", "brief", ["qr", "offline"], "QR campaign builder", "Eighteen codes, scan-verified."),
    ("Short-form strategy playbook", "playbook", ["content", "strategy"], "Short-form playbook", "Audience, scoring and calls to action."),
    ("Cost sync gap alert", "report", ["cost", "alert"], "Cost sync loop", "Resolved: one missing day, backfilled."),
    ("Landing page test results", "report", ["web", "test"], "Marketing analyst", "Variant B lifts form starts 9 percent."),
    ("Regional TV flight recap", "report", ["tv", "offline"], "Marketing analyst", "Calls land the morning after evening spots."),
    ("Self-serve link tagging guide", "playbook", ["links", "social"], "Link tagging kit", "How any post gets a tracked link."),
    ("Data classification checklist", "playbook", ["security", "data"], "Data classification", "What may go to which tool."),
    ("Compliance gap review", "report", ["security", "audit"], "Compliance audit", "Controls mapped, three gaps open."),
]


def write_ring(w: World) -> None:
    today = w.end
    cards = []
    for i, (title, kind, tags, source, note) in enumerate(RING_ITEMS):
        cards.append({"path": f"artifacts/{kind}/{i + 1:03d}-{title.lower().replace(' ', '-').replace(',', '').replace(':', '')}", "title": title, "kind": kind, "tags": tags,
                      "source": source, "note": note, "created": iso(today - timedelta(days=i % 21 + i // 7)), "state": "ok", "hidden": False})
    write_json(OUT_DEMO / "ring.json", cards)


def write_runs(w: World) -> None:
    today = w.end
    base = OUT_DEMO / "runs"
    buttons = [
        ("loop-ad-pull", "Daily ad performance pull", "Pulls spend, clicks and conversions from every platform"),
        ("loop-cost-sync", "Cost sync and gap alert", "Records every platform's spend and flags any missing day"),
        ("loop-completeness", "Daily completeness gate", "Holds reports when a feed is missing a day"),
        ("loop-call-scoring", "Call scoring", "Transcribes and scores the latest sales calls"),
        ("loop-library-sync", "Creative library sync", "Pulls every live ad and describes it"),
        ("loop-hygiene", "Weekly paid hygiene read", "Checks for waste, broken tracking and policy risk"),
        ("loop-speed-to-lead", "Speed-to-lead weekly", "Reads first-touch time by channel"),
        ("loop-reports", "Rebuild the reports", "Refreshes every report feed now"),
    ]
    out = []
    for i, (wid, label, detail) in enumerate(buttons):
        t = datetime(today.year, today.month, today.day, 6, 10 + i * 4)
        out.append({"workflow_id": wid, "label": label, "state": "ready", "detail": detail,
                    "last_run": {"run_id": f"run-seed-{i + 1:02d}", "status": "succeeded", "ts": t.isoformat(timespec="seconds"),
                                 "link": "", "acknowledged": True}})
    write_json(base / "buttons.json", out)
    skills = ["Brand voice pass", "Push planner", "Call SWOT", "Weekly paid media read", "Weekly report", "Copy variations", "Short-form strategy playbook",
              "Founder voice rewrite", "Shot list", "Slide and carousel builder", "QR campaign builder", "Data classification check", "Compliance gap review",
              "Silent failure diagnosis"]
    write_json(base / "skills.json", [{"name": n, "model": "demo", "effort": "-", "max_turns": 0, "running": False, "runnable": True} for n in skills])
    seed = []
    plan = [("skill", "Weekly paid media read", "succeeded"), ("loop", "loop-ad-pull", "succeeded"), ("skill", "Call SWOT", "succeeded"),
            ("skill", "Brand voice pass", "succeeded"), ("loop", "loop-library-sync", "failed"), ("skill", "Weekly report", "succeeded"),
            ("loop", "loop-cost-sync", "succeeded"), ("skill", "Copy variations", "succeeded"), ("loop", "loop-call-scoring", "succeeded"),
            ("skill", "Push planner", "succeeded"), ("loop", "loop-library-sync", "failed")]
    for i, (typ, target, status) in enumerate(plan):
        start = datetime(today.year, today.month, today.day, 5, 40) - timedelta(hours=i * 5 + 1, minutes=i * 3)
        end = start + timedelta(seconds=40 + 11 * i)
        if status == "succeeded":
            tail = [f"{RUN_LABELS.get(target, target)}: started", "inputs read: 3 of 3", "checks passed", "output written", f"{target}: finished"]
            detail = "Finished without errors."
        else:
            tail = [f"{RUN_LABELS.get(target, target)}: started", "platform API answered 401", "retry 1 of 2 failed", "retry 2 of 2 failed", "stopped; credential rotation is due"]
            detail = "The platform API rejected the saved credential."
        seed.append({"run_id": f"run-seed-{i + 1:02d}", "type": typ, "target": target, "label": RUN_LABELS.get(target, target), "model": "demo", "effort": "-",
                     "started": start.isoformat(timespec="seconds"), "ended": end.isoformat(timespec="seconds"), "status": status,
                     "loop_status": status if typ == "loop" else None, "detail": detail, "link": "", "log": "\n".join(tail), "log_tail": "\n".join(tail),
                     "acknowledged": status == "failed"})
    write_json(base / "seed_runs.json", seed)


RUN_LABELS = {"loop-ad-pull": "Daily ad pull", "loop-library-sync": "Creative library sync", "loop-cost-sync": "Cost sync", "loop-call-scoring": "Call scoring", "loop-reports": "Report rebuild"}


def write_fixtures(w: World, S: Stats, M: dict) -> None:
    floor = S.floor(S.d7, w.end)
    research = fixtures_apps.write_research(w, int(floor["connects"]))
    studio = fixtures_apps.write_studio(w)
    fixtures_apps.write_qr(w)
    ex = {"research": research, "studio": studio}
    write_json(OUT_DEMO / "stage_stats.json", build_stage_stats(S, w, ex, M))
    write_json(OUT_DEMO / "chat.json", build_chat(S, w, ex, M))
    write_ring(w)
    write_runs(w)
