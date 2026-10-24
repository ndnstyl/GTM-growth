"""Micro-app fixtures under public/demo/: research, content studio, QR registry, recall meetings.

All synthetic. People are a fictional first name and last initial; competitors are fictional; URLs use example.com.
"""
from __future__ import annotations

import shutil
import subprocess
from datetime import date, datetime, timedelta

from common import OUT_DEMO, iso, stream, write_json
from world import MARKETS, World

FIRST = ["Avery", "Jordan", "Riley", "Morgan", "Casey", "Taylor", "Quinn", "Parker", "Reese", "Rowan", "Skyler", "Dakota"]


def person(i: int) -> str:
    return f"{FIRST[i % len(FIRST)]} {'ABCDEFGHJKLMNPRSTW'[(i * 7) % 18]}."


# --------------------------------------------------------------------------------------
# research
# --------------------------------------------------------------------------------------


def write_research(w: World, calls_read: int) -> dict:
    asof = iso(w.end)
    pct = lambda p: int(round(calls_read * p))
    swot = {
        "as_of": asof, "calls_read": calls_read, "period": "last 7 days",
        "strengths": [
            {"theme": "Same-day estimate", "calls": pct(0.115), "quote": "I called at nine and somebody was at the house by two. Nobody else did that."},
            {"theme": "Written price, no pressure", "calls": pct(0.092), "quote": "He left me the number in writing and said take your time. I liked that."},
            {"theme": "Crew showed up on the day promised", "calls": pct(0.078), "quote": "My neighbor used someone else and waited three weeks. You were here Tuesday like you said."},
            {"theme": "Clear financing options", "calls": pct(0.064), "quote": "The monthly payment was on the first page. That made it easy to say yes."},
            {"theme": "Long warranty", "calls": pct(0.051), "quote": "The ten year warranty is what got my husband on board."},
        ],
        "weaknesses": [
            {"theme": "Price shock on the first quote", "calls": pct(0.089), "quote": "I did not expect it to be that much. I thought it would be half."},
            {"theme": "Hard to reach the office after five", "calls": pct(0.057), "quote": "I tried calling back last night and it just rang."},
            {"theme": "Estimate window too wide", "calls": pct(0.046), "quote": "Between eight and noon is a big window to wait around the house."},
            {"theme": "Unclear what is included", "calls": pct(0.039), "quote": "Does that price include removing the old windows? Nobody said."},
            {"theme": "Slow to send the written proposal", "calls": pct(0.031), "quote": "He said I would have it that day and it came two days later."},
        ],
        "opportunities": [
            {"theme": "Financing asked about unprompted", "calls": pct(0.053), "quote": "Do you do payments? I would do it this year if I could spread it out."},
            {"theme": "Storm damage urgency", "calls": pct(0.044), "quote": "We had the hail last week and the insurance adjuster said to get quotes."},
            {"theme": "Neighbors referred them", "calls": pct(0.041), "quote": "Three houses on our street have your signs up, so I figured I should call."},
            {"theme": "Interest in bundling roof and gutters", "calls": pct(0.027), "quote": "If we are doing the roof anyway, can the gutters go on at the same time?"},
            {"theme": "Spanish-language requests", "calls": pct(0.019), "quote": "Mi mamá prefiere hablar en español, ¿tienen alguien?"},
        ],
        "threats": [
            {"theme": "Competitor quoted 12 percent lower", "calls": pct(0.039), "quote": "Another company came in about twelve percent under you for the same windows."},
            {"theme": "Door-to-door storm chasers", "calls": pct(0.028), "quote": "A guy knocked on the door after the storm and wanted a deposit today."},
            {"theme": "Big-box store installs", "calls": pct(0.022), "quote": "The home center said they could install it for less, so why should I pay you?"},
            {"theme": "Rising material costs in the news", "calls": pct(0.017), "quote": "I read prices are going up again, so I am wondering if I should wait."},
            {"theme": "Review scores on a competitor's page", "calls": pct(0.013), "quote": "Their page has a lot more reviews than yours does."},
        ],
        "objections": [
            {"text": "I need to talk to my spouse", "calls": pct(0.126), "trend": "up", "rebuttal": "Offer a two-person estimate time and send the written summary to both of them the same day."},
            {"text": "The price is higher than I expected", "calls": pct(0.089), "trend": "up", "rebuttal": "Lead with the monthly payment, then show what the price includes line by line."},
            {"text": "I want to get a few more quotes", "calls": pct(0.071), "trend": "flat", "rebuttal": "Agree, then give the three questions to ask every contractor, including warranty terms."},
            {"text": "I am not ready to do it this year", "calls": pct(0.052), "trend": "down", "rebuttal": "Name the cost of waiting for this specific home and book a follow-up date."},
            {"text": "Can you do it cheaper if I pay cash?", "calls": pct(0.038), "trend": "flat", "rebuttal": "Explain the one standard price and the written guarantee that comes with it."},
            {"text": "I had a bad experience with a contractor before", "calls": pct(0.031), "trend": "down", "rebuttal": "Acknowledge it, then walk through who is on the crew and how the job is checked at the end."},
        ],
        "competitors": [
            {"name": "Summit Home Pros", "mentions": pct(0.039), "positioning": "Low price, long lead times, heavy use of subcontractors."},
            {"name": "Ironwood Exteriors", "mentions": pct(0.026), "positioning": "Premium brand, strong reviews, financing through a partner bank."},
            {"name": "BrightLine Remodeling", "mentions": pct(0.021), "positioning": "Whole-house packages, aggressive seasonal discounts."},
            {"name": "Cardinal Roofing and Windows", "mentions": pct(0.018), "positioning": "Local family name, fast storm response."},
            {"name": "Hearth and Home Exteriors", "mentions": pct(0.011), "positioning": "Premium siding, slower and pricier."},
        ],
    }
    write_json(OUT_DEMO / "research" / "swot.json", swot)
    offer = {
        "positioning": "The exterior contractor that gives you a written price in one visit and shows the monthly payment first.",
        "pillars": [
            {"title": "One visit, one written price", "proof": "92 percent of estimates are written and sent the same day.", "claims_status": "approved"},
            {"title": "Monthly payment shown first", "proof": "Payment options sit on the first page of every proposal.", "claims_status": "approved"},
            {"title": "Crew you can name", "proof": "Every job lists the crew lead and the final walkthrough time.", "claims_status": "approved"},
            {"title": "Long, plain warranty", "proof": "Workmanship warranty in writing, in plain language.", "claims_status": "pending"},
            {"title": "Energy savings", "proof": "Savings claims need substantiation before they run in ads.", "claims_status": "blocked"},
        ],
        "offers": [
            {"id": "o1", "name": "Free inspection and written price", "hook": "Get your exact price in one visit", "price_anchor": "No cost, no obligation", "guarantee": "Price held for 30 days", "test_status": "winning", "lift_pct": 12.4},
            {"id": "o2", "name": "Spring financing offer", "hook": "Start now, first payment in 90 days", "price_anchor": "From $89 a month", "guarantee": "Rate locked at signing", "test_status": "testing", "lift_pct": 5.1},
            {"id": "o3", "name": "Roof and gutters bundle", "hook": "Do both while the ladders are up", "price_anchor": "Gutters at half price with a roof", "guarantee": "One crew, one schedule", "test_status": "testing", "lift_pct": 3.2},
            {"id": "o4", "name": "Neighbor referral credit", "hook": "A $250 credit for you and a neighbor", "price_anchor": "$250 off each", "guarantee": "Credit applied at signing", "test_status": "retired", "lift_pct": -2.8},
        ],
        "bursts": [
            {"id": "b1", "name": "Weekend storm-prep push", "channel": "social", "window": "Oct 24-26", "headline": "Check your roof before the storm, not after", "status": "scheduled"},
            {"id": "b2", "name": "Direct mail follow-up push", "channel": "email and text", "window": "Oct 27-29", "headline": "Your estimate is waiting: pick a time", "status": "scheduled"},
            {"id": "b3", "name": "Veterans week thank-you", "channel": "social", "window": "Nov 6-11", "headline": "A thank-you offer for those who served", "status": "draft"},
        ],
    }
    write_json(OUT_DEMO / "research" / "offer.json", offer)
    return {"objections": len(swot["objections"]), "competitors": len(swot["competitors"]), "offers_testing": sum(1 for o in offer["offers"] if o["test_status"] == "testing"),
            "offers_winning": sum(1 for o in offer["offers"] if o["test_status"] == "winning"), "top_objection": swot["objections"][0]}


# --------------------------------------------------------------------------------------
# studio
# --------------------------------------------------------------------------------------

from content_text import LIBRARY_TITLES, LIBRARY_NOTES, SCRIPTS, MEETINGS, fallback_script

BRANDS = [("lh-main", "Larkspur Home"), ("lh-pro", "Larkspur Pro")]
IDEA_TITLES = [
    ("Why a free estimate is worth the hour", "Most people expect a sales trap; show the actual hour.", "myth-buster"),
    ("A roof you stop thinking about", "Slow reveal of a finished roof at golden hour.", "before-after"),
    ("Three questions before you sign", "A checklist any homeowner can use with any contractor.", "explainer"),
    ("The crew lead explains day one", "A crew lead walks through prep, not paint.", "behind-the-install"),
    ("What a monthly payment really looks like", "A plain breakdown of a financed roof.", "financing"),
    ("Windows you can hear the difference in", "A sound test at the front door.", "demo"),
    ("Storm season checklist", "Five things to check from the ground.", "seasonal"),
    ("Neighbors who picked us", "Two doors on one street, one story.", "testimonial"),
    ("Gutters: the cheapest fix that saves the most", "Water damage cost against a gutter guard.", "myth-buster"),
    ("How we price a siding job", "Open the spreadsheet on camera.", "explainer"),
    ("Same house, one week later", "A time-lapse before and after.", "before-after"),
    ("What the warranty actually covers", "Read the warranty line by line.", "explainer"),
    ("A day in the life of an estimator", "Ride along on three estimates.", "behind-the-install"),
    ("Pro program: the contractor's view", "Why trade partners send us work.", "trade"),
    ("Curb appeal that buyers notice", "What buyers see from the street.", "seasonal"),
    ("Energy bills: where the heat leaves", "Thermal camera on an old window.", "demo"),
]
STATUSES = ["idea", "scripted", "in_edit", "ready"]


def _thumb(path, title, hue):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">'
           f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl({hue},55%,22%)"/>'
           f'<stop offset="1" stop-color="hsl({(hue + 40) % 360},65%,38%)"/></linearGradient></defs>'
           f'<rect width="480" height="270" fill="url(#g)"/><circle cx="395" cy="70" r="38" fill="rgba(255,255,255,0.14)"/>'
           f'<text x="24" y="226" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">{title}</text>'
           f'<text x="24" y="250" font-family="Inter, Arial, sans-serif" font-size="13" fill="rgba(255,255,255,0.75)">Larkspur demo creative</text></svg>')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg, encoding="utf-8")


def write_studio(w: World) -> dict:
    rng = stream(w.seed, "studio")
    today = w.end
    base = OUT_DEMO / "studio"
    write_json(base / "brands.json", {"brands": [{"id": i, "label": l} for i, l in BRANDS]})
    ideas = []
    for i, (title, hook, angle) in enumerate(IDEA_TITLES):
        ideas.append({"id": f"idea-{i + 1:02d}", "brand": BRANDS[1][0] if "Pro" in title or "trade" in angle else BRANDS[0][0], "title": title, "hook": hook,
                      "angle": angle, "status": STATUSES[(i * 3 + 1) % 4], "created": iso(today - timedelta(days=3 + 2 * i))})
    write_json(base / "ideas.json", {"ideas": ideas})
    kinds = ["video", "carousel", "still", "video", "video"]
    stages = ["draft", "review", "approved"]
    channels = [["social", "youtube"], ["social"], ["youtube"], ["social", "email"]]
    library = []
    for i in range(32):
        title, kind = LIBRARY_TITLES[i]
        lid = f"lib-{i + 1:03d}"
        _thumb(base / "thumbs" / f"{lid}.svg", title[:34], (i * 37) % 360)
        stage = stages[(i + i // 5) % 3]
        library.append({"id": lid, "brand": BRANDS[1][0] if i % 5 == 4 else BRANDS[0][0], "title": title, "kind": kind,
                        "stage": stage, "duration_s": None if kind != "video" else int(rng.choice([15, 24, 30, 45, 78])),
                        "market": MARKETS[i % len(MARKETS)].name if i % 3 else "All markets", "created": iso(today - timedelta(days=i * 2 + 1)),
                        "channels": channels[i % len(channels)], "note": LIBRARY_NOTES[stage],
                        "thumb": f"/demo/studio/thumbs/{lid}.svg"})
    write_json(base / "library.json", {"items": library})
    el_kinds = [("voice", ["Warm narrator, female", "Direct narrator, male", "Spanish narrator", "Crew-lead voice"]),
                ("music", ["Upbeat acoustic bed", "Warm piano lift", "Light percussion pulse", "Quiet documentary pad"]),
                ("endcard", ["Free estimate end card", "Financing end card", "Storm-prep end card"]),
                ("broll", ["Crew on a roof at sunrise", "Finished front elevation", "Close-up of window install", "Gutter guard detail"]),
                ("logo", ["Larkspur Home logo", "Larkspur Pro logo"])]
    elements = []
    n = 0
    for kind, labels in el_kinds:
        for lab in labels:
            n += 1
            elements.append({"id": f"el-{n:02d}", "brand": BRANDS[1][0] if "Pro" in lab else BRANDS[0][0], "kind": kind, "label": lab, "uses": int(rng.integers(3, 60))})
    write_json(base / "elements.json", {"items": elements})
    sets = []
    for s_i in range(8):
        topic = IDEA_TITLES[s_i][0]
        variations = []
        for v, (label, hook, body, humor) in enumerate(SCRIPTS.get(s_i) or fallback_script(topic), 1):
            variations.append({"id": f"v{v}", "label": label, "hook": hook, "body": body,
                               "seconds": 24 + 2 * v + (s_i % 3), "humor": humor, "score": int(rng.integers(66, 92))})
        best = max(variations, key=lambda x: x["score"])["id"]
        sets.append({"id": f"set-{s_i + 1:02d}", "brand": BRANDS[s_i % 4 == 3][0], "topic": topic, "created": iso(today - timedelta(days=2 + 3 * s_i)), "best": best, "variations": variations})
    write_json(base / "scripts.json", {"sets": sets})
    seats = [("researcher", "Researcher", "Finds the angle, proof points and comparable ads", "auto"), ("transcriber", "Transcriber", "Turns raw footage into a searchable transcript", "auto"),
             ("editor", "Editor", "Assembles the rough cut from the script and footage", "review"), ("animator", "Animator", "Builds the motion graphics and lower thirds", "auto"),
             ("screen", "Screen editor", "Cuts screen recordings and product walkthroughs", "auto"), ("sound", "Sound designer", "Mixes voice, music and effects", "auto"),
             ("finisher", "Finisher", "Exports every aspect ratio and checks the brand rules", "review")]
    stage_names = ["research", "transcribe", "edit", "animate", "screen", "sound", "finish", "done"]
    cuts = []
    for i in range(12):
        st = stage_names[(i * 3) % 8]
        cuts.append({"id": f"cut-{i + 1:02d}", "title": IDEA_TITLES[i][0], "brand": BRANDS[i % 5 == 4][0], "stage": st,
                     "progress": 100 if st == "done" else int(rng.integers(8, 96)), "updated": iso(today - timedelta(days=i % 5))})
    jobs = []
    statuses = ["done", "done", "done", "running", "queued", "done", "done", "failed"]
    for j in range(24):
        cut = cuts[j % len(cuts)]["id"]
        seat = seats[j % len(seats)][0]
        st = statuses[j % len(statuses)]
        start = datetime(today.year, today.month, today.day, 8 + (j % 9), (j * 7) % 60)
        jobs.append({"id": f"job-{j + 1:03d}", "cut": cut, "seat": seat, "status": st, "started": start.isoformat(timespec="seconds"),
                     "ended": None if st in ("running", "queued") else (start + timedelta(minutes=2 + j % 9)).isoformat(timespec="seconds"),
                     "summary": {"done": "Finished and handed to the next seat.", "running": "Working through the footage now.", "queued": "Waiting for the previous seat.",
                                 "failed": "Stopped on a missing brand asset; the seat asked for a replacement."}[st]})
    write_json(base / "crew.json", {"seats": [{"id": a, "label": b, "outcome": c, "mode": d} for a, b, c, d in seats], "cuts": cuts, "jobs": jobs})
    write_json(base / "run_steps.json", {"steps": [
        {"label": "Researching the angle", "ms": 1400, "output": "Found three proof points and two comparable ads that did well in this market."},
        {"label": "Writing three script variations", "ms": 1600, "output": "Wrote a pain hook, a story hook and a myth hook, each under thirty seconds."},
        {"label": "Scoring the variations", "ms": 1200, "output": "The myth hook scored highest on clarity; the story hook on warmth."},
        {"label": "Pulling matching footage", "ms": 1500, "output": "Matched twelve clips from the footage library to the script beats."},
        {"label": "Cutting the rough edit", "ms": 1700, "output": "Assembled a 28 second vertical cut with captions."},
        {"label": "Checking brand and claims rules", "ms": 1100, "output": "Passed: no restricted claims, correct end card, tracked link attached."},
        {"label": "Filing the result", "ms": 900, "output": "Saved to the library for review: Why a free estimate is worth the hour."},
    ], "result_id": "lib-001"})
    media = base / "media"
    media.mkdir(parents=True, exist_ok=True)
    clip = media / "sample.mp4"
    if shutil.which("ffmpeg"):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-f", "lavfi", "-i",
                        "testsrc2=size=640x360:rate=24:duration=6", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "34",
                        "-movflags", "+faststart", str(clip)], check=True)
    else:
        raise FileNotFoundError("ffmpeg is needed to render the sample clip (public/demo/studio/media/sample.mp4)")
    return {"library": library, "ideas": ideas, "cuts": cuts, "sets": sets}


# --------------------------------------------------------------------------------------
# qr
# --------------------------------------------------------------------------------------


SRC_LABEL = {"flyer": "Flyer", "direct-mail": "Direct mail", "yard-sign": "Yard sign", "event": "Event", "tv": "TV"}


def write_qr(w: World) -> None:
    rng = stream(w.seed, "qr")
    today = w.end
    sources = ["flyer", "direct-mail", "yard-sign", "event", "tv"]
    mediums = ["print", "offline", "qr"]
    rows = []
    campaigns = ["fall-offer", "storm-prep", "financing-push", "referral", "home-show", "neighbor-signs"]
    for i in range(22):
        src = sources[i % 5]
        med = mediums[i % 3]
        camp = campaigns[i % len(campaigns)]
        m = MARKETS[i % len(MARKETS)]
        slug = f"{src}-{camp}-{m.name.lower()}"
        rows.append({"id": f"qr-{i + 1:03d}", "name": f"{src.replace('-', ' ').title()}: {camp.replace('-', ' ')}, {m.name}",
                     "url": f"https://example.com/offer?utm_source={src}&utm_medium={med}&utm_campaign={camp}&utm_content={m.name.lower()}",
                     "utm_source": src, "utm_medium": med, "utm_campaign": camp, "utm_content": m.name.lower(), "created": iso(today - timedelta(days=5 + 6 * i)),
                     "scans_30d": int(rng.integers(0, 420)) if i % 7 != 6 else 0, "market": m.name, "status": "paused" if i % 7 == 6 else "live"})
    write_json(OUT_DEMO / "qr" / "registry.json", {"rows": rows, "sources": sources, "mediums": mediums})


# --------------------------------------------------------------------------------------
# recall
# --------------------------------------------------------------------------------------

MEETING_SCRIPTS = [
    ("Estimate call: roof and gutters, Harborview", "sales call", ["roof", "gutters", "financing"]),
    ("Weekly paid media review", "team sync", ["spend", "set rate", "creative"]),
    ("Customer interview: window replacement", "customer interview", ["noise", "energy bills", "install day"]),
    ("Estimate call: siding, Stonebridge", "sales call", ["siding", "timeline", "warranty"]),
    ("Sales floor coaching huddle", "team sync", ["connect rate", "objections", "scripts"]),
    ("Estimate call: roof, Pinecrest", "sales call", ["storm damage", "insurance", "price"]),
    ("Content planning: spring films", "team sync", ["scripts", "footage", "release forms"]),
    ("Customer interview: financing experience", "customer interview", ["monthly payment", "approval", "paperwork"]),
    ("Estimate call: windows, Riverbend", "sales call", ["price", "spouse", "timeline"]),
    ("Efficiency target review", "team sync", ["marketing cost", "pacing", "budget"]),
]


PAIRS = [("Avery R.", "Taylor M."), ("Jordan K.", "Riley S."), ("Dakota H.", "Morgan T."), ("Remy O.", "Casey L."), ("Sam B.", "Ellis T."),
         ("Parker W.", "Reese A."), ("Cameron P.", "Harper L."), ("Dakota H.", "Kendall M."), ("Quinn F.", "Drew N."), ("Jordan K.", "Riley S.")]


def write_recall(w: World) -> None:
    rng = stream(w.seed, "recall")
    today = w.end
    meetings = []
    for i, m in enumerate(MEETINGS):
        d = today - timedelta(days=i * 2 + (i % 2))
        a, b = PAIRS[i]
        speakers = [a, b]
        lines = []
        t = 8
        for spk, text in m["lines"]:
            h, rem = divmod(t, 3600)
            mm, ss = divmod(rem, 60)
            lines.append({"t": f"{h:02d}:{mm:02d}:{ss:02d}", "speaker": speakers[spk], "text": text})
            t += int(rng.integers(14, 55))
        summary = m["summary"]
        meetings.append({
            "id": f"mtg-{i + 1:02d}", "title": m["title"], "date": iso(d), "duration_min": int(rng.integers(12, 48)), "participants": speakers, "kind": m["kind"],
            "summary": summary,
            "action_items": [{"owner": speakers[o], "text": text, "due": iso(d + timedelta(days=days))} for o, text, days in m["actions"]],
            "topics": m["topics"], "transcript": lines,
        })
    write_json(OUT_DEMO / "recall" / "meetings.json", {"meetings": meetings}, indent=None)
