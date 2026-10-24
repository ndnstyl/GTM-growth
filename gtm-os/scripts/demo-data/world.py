"""The synthetic company: Larkspur Home Services.

One seeded simulation produces every number the demo shows, so every surface ties to every
other (spend rows sum to the spend feed, leaf funnel counts sum to the funnel, and so on).

Grain of the simulation
  * campaign x day            platform delivery (spend, impressions, clicks, conversions)
  * day x market x source x brand  ("leaf") the funnel: leads -> sets -> issues -> demos -> sales -> dollars
Everything else (monthly feeds, lenses, windows, boards) is a roll-up of these two grains.

Money is integer cents everywhere. Nothing here reads the clock.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np

from common import daterange, split_int, split_int_matrix, stream

# --------------------------------------------------------------------------------------
# Reference data (all fictional)
# --------------------------------------------------------------------------------------

COMPANIES = [
    ("LSH", "Larkspur Home Services", "LSH"),
    ("LSP", "Larkspur Pro (trade partner program)", "LSP"),
]
BRAND_LABEL = {"LSH": "Larkspur Home", "LSP": "Larkspur Pro"}


@dataclass(frozen=True)
class Market:
    id: str
    name: str
    weight: float
    lat: float
    lng: float
    address: str
    suburbs: tuple
    county: tuple
    lead_adj: float  # lead-to-set multiplier
    zip_prefix: str


MARKETS = [
    Market("Harborview", "Harborview", 0.26, 41.40, -96.10, "1200 Commerce Way, Harborview", ("Harborview", "East Harborview", "Millbrook", "Port Ashby"), ("Ashby County", "Fenwick County"), 1.04, "684"),
    Market("Pinecrest", "Pinecrest", 0.18, 39.05, -95.70, "88 Ridge Road, Pinecrest", ("Pinecrest", "Cedar Hollow", "Larkspur", "Wren Valley"), ("Larkspur County", "Hollis County"), 0.98, "660"),
    Market("Stonebridge", "Stonebridge", 0.22, 40.80, -98.30, "410 Mill Street, Stonebridge", ("Stonebridge", "North Stonebridge", "Elmford", "Quarry Point"), ("Mill County", "Elmford County"), 1.02, "688"),
    Market("Riverbend", "Riverbend", 0.14, 38.40, -97.40, "75 Canal Avenue, Riverbend", ("Riverbend", "Oxbow", "Dunmore", "Willow Crossing"), ("Oxbow County", "Dunmore County"), 0.95, "674"),
    Market("Lakemont", "Lakemont", 0.10, 40.00, -92.90, "9 Shoreline Drive, Lakemont", ("Lakemont", "Pelican Bay", "Aster Heights", "Brook Landing"), ("Aster County", "Lakemont County"), 0.93, "645"),
    Market("Sunvale", "Sunvale", 0.10, 38.90, -92.30, "301 Palm Court, Sunvale", ("Sunvale", "Coral Gate", "South Sunvale", "Marlow"), ("Marlow County", "Coral County"), 1.00, "652"),
]
MIDX = {m.id: i for i, m in enumerate(MARKETS)}
NM = len(MARKETS)
M_W = np.array([m.weight for m in MARKETS])

PLATFORMS = ["google_ads", "meta", "microsoft_ads"]
ACCOUNTS = {
    "google_ads": ("GA-4417-0020", "Larkspur Google Ads"),
    "meta": ("MA-2208-9141", "Larkspur Meta Ads"),
    "microsoft_ads": ("MS-7305-1182", "Larkspur Microsoft Ads"),
}
AGENCY = "Apex Media Partners"
IN_HOUSE = "Larkspur"
AGENCY_FEE_RATE = 0.15

# subsource = the CRM sub-source a lead is keyed to.
# code, name, source_code, bucket, operator, platform
SUBSOURCES = [
    ("GAI", "Google Ads (In-house)", "PAIDSEARCH", "inhouse", IN_HOUSE, "google_ads"),
    ("BAA", "Microsoft Ads (Agency)", "PAIDSEARCH", "vendor", AGENCY, "microsoft_ads"),
    ("MAI", "Meta Ads (In-house)", "PAIDSOCIAL", "inhouse", IN_HOUSE, "meta"),
    ("MAA", "Meta Ads (Agency)", "PAIDSOCIAL", "vendor", AGENCY, "meta"),
    ("ORG", "Organic Search", "ORGANIC", "unpaid", IN_HOUSE, None),
    ("DMA", "Direct Mail", "MAIL", "offline", IN_HOUSE, None),
    ("TVR", "Regional TV", "TV", "offline", IN_HOUSE, None),
    ("EVT", "Home Shows", "EVENT", "offline", IN_HOUSE, None),
    ("REF", "Referral", "REFERRAL", "unpaid", IN_HOUSE, None),
    ("DIR", "Direct and Other", "DIRECT", "unpaid", IN_HOUSE, None),
]
SIDX = {s[0]: i for i, s in enumerate(SUBSOURCES)}
NS = len(SUBSOURCES)
SOURCE_CODES = ["PAIDSEARCH", "PAIDSOCIAL", "ORGANIC", "MAIL", "TV", "EVENT", "REFERRAL", "DIRECT"]
SOURCE_LABEL = {
    "PAIDSEARCH": "Paid Search", "PAIDSOCIAL": "Paid Social", "ORGANIC": "Organic Search", "MAIL": "Direct Mail",
    "TV": "Regional TV", "EVENT": "Home Shows", "REFERRAL": "Referral", "DIRECT": "Direct and Other",
}
SUB_SOURCE = np.array([SOURCE_CODES.index(s[2]) for s in SUBSOURCES])

BRANDS = ["LSH", "LSP"]
LH = 2

PRODUCTS = [
    # name, sales-mix weight, price factor
    ("Roof replacement", 0.18, 3.6),
    ("Window replacement", 0.30, 1.9),
    ("Siding", 0.12, 2.8),
    ("Gutters and guards", 0.26, 0.45),
    ("Other exterior", 0.14, 0.40),
]

CHANNELS = [
    ("ch_search", "Search"),
    ("ch_pmax", "Performance Max"),
    ("ch_video", "Video"),
    ("ch_social", "Social lead gen"),
    ("ch_retarget", "Retargeting"),
]

# --------------------------------------------------------------------------------------
# Campaigns
# --------------------------------------------------------------------------------------


@dataclass
class Campaign:
    idx: int
    id: str
    platform: str
    name: str
    brand: str
    operator: str
    channel: str  # channel_id
    kind: str  # search | pmax | video | social | retarget
    markets: dict  # market id -> base weight (single entry => single-market)
    daily_cents: float  # base daily spend at trend 1.0
    cpc: float | None  # dollars (CPC-priced)
    cpm: float | None  # dollars (CPM-priced)
    ctr: float
    cvr: float
    subsource: str
    ad_sets: list = field(default_factory=list)
    platform_campaign_id: str = ""

    @property
    def multi(self) -> bool:
        return len(self.markets) > 1

    @property
    def primary_market(self) -> str:
        return max(self.markets, key=lambda k: self.markets[k])


def _mk_weights(ids):
    w = {i: MARKETS[MIDX[i]].weight for i in ids}
    s = sum(w.values())
    return {k: v / s for k, v in w.items()}


def make_campaigns() -> list[Campaign]:
    cs: list[Campaign] = []

    def add(platform, name, brand, operator, channel, kind, markets, daily_dollars, cpc, cpm, ctr, cvr, subsource, ad_sets):
        i = len(cs)
        prefix = {"google_ads": "gads", "meta": "meta", "microsoft_ads": "msads"}[platform]
        n_in_platform = sum(1 for c in cs if c.platform == platform) + 1
        cs.append(Campaign(
            idx=i, id=f"{prefix}-c{n_in_platform:02d}", platform=platform, name=name, brand=brand, operator=operator,
            channel=channel, kind=kind, markets=markets, daily_cents=daily_dollars * 100.0, cpc=cpc, cpm=cpm,
            ctr=ctr, cvr=cvr, subsource=subsource, ad_sets=ad_sets,
        ))

    allm = [m.id for m in MARKETS]
    # Google: 3,800 a day
    g_total = 3800.0
    for m in MARKETS:
        add("google_ads", f"LH | {m.name} | Search | Core", "LSH", IN_HOUSE, "ch_search", "search", {m.id: 1.0},
            g_total * 0.62 * m.weight, 6.4, None, 0.054, 0.085, "GAI", ["Exact match terms", "Phrase and broad terms"])
    pro_m = {"Harborview": 0.45, "Stonebridge": 0.35, "Pinecrest": 0.20}
    for mid, w in pro_m.items():
        add("google_ads", f"LH Pro | {MARKETS[MIDX[mid]].name} | Search | Trade", "LSP", IN_HOUSE, "ch_search", "search", {mid: 1.0},
            g_total * 0.12 * w, 8.2, None, 0.041, 0.060, "GAI", ["Contractor terms", "Partner program terms"])
    add("google_ads", "LH | Metro Triangle | Performance Max", "LSH", IN_HOUSE, "ch_pmax", "pmax",
        _mk_weights(["Harborview", "Pinecrest", "Stonebridge", "Riverbend"]), g_total * 0.16, 3.1, None, 0.026, 0.036, "GAI",
        ["Asset group: homeowners", "Asset group: financing"])
    add("google_ads", "LH | Regional | Video Awareness", "LSH", IN_HOUSE, "ch_video", "video",
        _mk_weights(allm), g_total * 0.10, None, 9.0, 0.0045, 0.012, "GAI", ["In-market audiences", "Custom intent audiences"])
    # Meta: 2,300 a day
    m_total = 2300.0
    agency_lead_markets = {"Riverbend", "Lakemont", "Sunvale"}
    for m in MARKETS:
        ag = m.id in agency_lead_markets
        add("meta", f"LH | {m.name} | Lead Gen | Home Offer", "LSH", AGENCY if ag else IN_HOUSE, "ch_social", "social",
            {m.id: 1.0}, m_total * 0.55 * m.weight, None, 15.5, 0.0115, 0.046, "MAA" if ag else "MAI",
            ["Homeowners 35 to 64", "Lookalike: past customers"])
    add("meta", "LH | Regional | Retargeting", "LSH", IN_HOUSE, "ch_retarget", "retarget", _mk_weights(allm),
        m_total * 0.20, None, 21.0, 0.019, 0.070, "MAI", ["Site visitors 30 days", "Estimate started, not booked"])
    add("meta", "LH | Regional | Video Brand Reach", "LSH", AGENCY, "ch_video", "video", _mk_weights(allm),
        m_total * 0.15, None, 8.5, 0.0055, 0.018, "MAA", ["Broad reach", "Interest: home improvement"])
    for mid, w in {"Harborview": 0.6, "Stonebridge": 0.4}.items():
        add("meta", f"LH Pro | {MARKETS[MIDX[mid]].name} | Lead Gen | Trade", "LSP", IN_HOUSE, "ch_social", "social",
            {mid: 1.0}, m_total * 0.10 * w, None, 17.0, 0.0095, 0.039, "MAI", ["Contractors and remodelers", "Property managers"])
    # Microsoft: 800 a day, four markets
    ms_m = _mk_weights(["Harborview", "Pinecrest", "Stonebridge", "Riverbend"])
    for mid, w in ms_m.items():
        add("microsoft_ads", f"LH | {MARKETS[MIDX[mid]].name} | Search | Core", "LSH", AGENCY, "ch_search", "search", {mid: 1.0},
            800.0 * w, 4.7, None, 0.042, 0.072, "BAA", ["Exact match terms", "Phrase and broad terms"])

    rng = stream(7, "campaign-ids")
    for c in cs:
        c.platform_campaign_id = str(int(rng.integers(10**10, 10**11 - 1)))
    return cs


# --------------------------------------------------------------------------------------
# The world
# --------------------------------------------------------------------------------------


@dataclass
class World:
    seed: int
    start: date
    end: date
    days: list
    D: int
    dow: np.ndarray
    campaigns: list
    # campaign x day
    spend: np.ndarray
    imps: np.ndarray
    clicks: np.ndarray
    conv: np.ndarray
    all_conv: np.ndarray
    conv_value: np.ndarray
    imp_share: np.ndarray  # nan where not applicable
    video_views: np.ndarray
    reach: np.ndarray
    freq: np.ndarray
    share: np.ndarray  # campaign x day x market (sums to 1 over market)
    # campaign x day x market allocated integer parts
    a_spend: np.ndarray
    a_imps: np.ndarray
    a_clicks: np.ndarray
    a_conv: np.ndarray
    # offline and non-media spend
    off_spend: np.ndarray  # day x market x subsource(NS) cents (offline only used)
    fee: np.ndarray  # day x market x subsource fees (agency)
    tools_cents: np.ndarray  # day
    labor_cents: np.ndarray  # day
    # leaf funnel day x market x subsource x brand
    leads: np.ndarray
    sets: np.ndarray
    issues: np.ndarray
    demos: np.ndarray
    sales: np.ndarray
    sold: np.ndarray
    cancels: np.ndarray
    cancel_c: np.ndarray
    rtc: np.ndarray
    turndown: np.ndarray
    unruled: np.ndarray
    leaf_spend: np.ndarray
    leaf_imps: np.ndarray
    leaf_clicks: np.ndarray
    calls: np.ndarray
    connects: np.ndarray
    # call floor (company day)
    dials: np.ndarray
    dials_d: np.ndarray
    connects_d: np.ndarray
    machine: np.ndarray
    agents_n: np.ndarray
    ticket_scale: float
    extra: dict = field(default_factory=dict)

    def day_index(self, d: date) -> int:
        return (d - self.start).days

    def slice_from(self, start: date) -> "World":
        """The same world from `start` on (all arrays cut on the day axis). Daily-grain feeds publish this
        window; month-grain feeds read the full history."""
        a = (start - self.start).days
        if a < 0 or a >= self.D:
            raise ValueError(f"slice start {start} is outside the simulated range {self.start}..{self.end}")
        cut_cd = ("spend", "imps", "clicks", "conv", "all_conv", "conv_value", "imp_share", "video_views", "reach", "freq")
        cut_cdm = ("share", "a_spend", "a_imps", "a_clicks", "a_conv")
        cut_d = ("off_spend", "fee", "tools_cents", "labor_cents", "leads", "sets", "issues", "demos", "sales", "sold", "cancels",
                 "cancel_c", "rtc", "turndown", "unruled", "leaf_spend", "leaf_imps", "leaf_clicks", "calls", "connects",
                 "dials", "dials_d", "connects_d", "machine", "agents_n", "dow")
        kw = {f: getattr(self, f) for f in self.__dataclass_fields__}
        for f in cut_cd + cut_cdm:
            kw[f] = getattr(self, f)[:, a:]
        for f in cut_d:
            kw[f] = getattr(self, f)[a:]
        kw["days"] = self.days[a:]
        kw["D"] = self.D - a
        kw["start"] = start
        extra = dict(self.extra)
        for k in ("season", "trend_l", "crate", "connects_total"):
            extra[k] = extra[k][a:]
        extra["show_days"] = {(di - a, mid): v for (di, mid), v in self.extra["show_days"].items() if di >= a}
        kw["extra"] = extra
        return World(**kw)


def _ar1(rng, n_rows, n_days, rho, sd):
    e = rng.normal(0, sd, size=(n_rows, n_days))
    out = np.zeros_like(e)
    out[:, 0] = e[:, 0]
    for t in range(1, n_days):
        out[:, t] = rho * out[:, t - 1] + e[:, t] * math.sqrt(1 - rho * rho)
    return out


DOW_LEAD = np.array([1.08, 1.06, 1.04, 1.02, 0.98, 0.92, 0.90])  # Mon..Sun
DOW_LEAD = DOW_LEAD / DOW_LEAD.mean()
DOW_SPEND = np.array([1.05, 1.05, 1.04, 1.03, 1.0, 0.95, 0.88])
DOW_SPEND = DOW_SPEND / DOW_SPEND.mean()


def simulate(seed: int, start: date, end: date) -> World:
    days = daterange(start, end)
    D = len(days)
    dow = np.array([d.weekday() for d in days])
    doy = np.array([d.timetuple().tm_yday for d in days])
    t = np.arange(D) / max(1, D - 1)
    season = 1.0 + 0.06 * np.sin(2 * np.pi * (doy - 80) / 365.0)
    camps = make_campaigns()
    C = len(camps)

    # ---------------- campaign delivery ----------------
    rng = stream(seed, "delivery")
    trend_s = 0.82 + 0.18 * t
    f_spend = trend_s * DOW_SPEND[dow] * season
    noise = _ar1(rng, C, D, 0.85, 0.07)
    spend = np.zeros((C, D), dtype=np.int64)
    imps = np.zeros((C, D), dtype=np.int64)
    clicks = np.zeros((C, D), dtype=np.int64)
    conv = np.zeros((C, D))
    for c in camps:
        base = c.daily_cents * f_spend * np.exp(noise[c.idx])
        sp = np.round(base).astype(np.int64)
        cvr_drift = 0.94 + 0.10 * t
        if c.cpc is not None:
            cpc_eff = c.cpc * np.exp(rng.normal(0, 0.05, D)) * (1.04 - 0.07 * t)
            cl = np.round(sp / 100.0 / cpc_eff).astype(np.int64)
            im = np.round(cl / (c.ctr * np.exp(rng.normal(0, 0.05, D)))).astype(np.int64)
        else:
            cpm_eff = c.cpm * np.exp(rng.normal(0, 0.06, D)) * (1.03 - 0.05 * t)
            im = np.round(sp / 100.0 / cpm_eff * 1000.0).astype(np.int64)
            cl = np.round(im * c.ctr * np.exp(rng.normal(0, 0.06, D))).astype(np.int64)
        cv = cl * c.cvr * cvr_drift * np.exp(rng.normal(0, 0.12, D))
        spend[c.idx], imps[c.idx], clicks[c.idx], conv[c.idx] = sp, im, cl, np.round(cv, 2)
    all_conv = np.round(conv * 1.18, 2)
    conv_value = np.round(conv * 9500).astype(np.int64)  # cents of platform-reported value per conversion
    imp_share = np.full((C, D), np.nan)
    video_views = np.zeros((C, D), dtype=np.int64)
    reach = np.zeros((C, D), dtype=np.int64)
    freq = np.full((C, D), np.nan)
    for c in camps:
        if c.platform == "google_ads" and c.kind in ("search", "pmax"):
            imp_share[c.idx] = np.clip(0.66 + 0.08 * np.sin(np.arange(D) / 23.0) + rng.normal(0, 0.03, D), 0.35, 0.92)
        if c.kind == "video":
            video_views[c.idx] = np.round(imps[c.idx] * np.clip(rng.normal(0.31, 0.02, D), 0.2, 0.4)).astype(np.int64)
        if c.platform == "meta":
            f = np.clip(1.8 + 1.1 * (c.kind == "retarget") + 0.5 * t + rng.normal(0, 0.12, D), 1.2, 5.5)
            freq[c.idx] = np.round(f, 2)
            reach[c.idx] = np.round(imps[c.idx] / f).astype(np.int64)

    # ---------------- market allocation ----------------
    share = np.zeros((C, D, NM))
    rng_a = stream(seed, "allocation")
    for c in camps:
        w = np.zeros(NM)
        for mid, ww in c.markets.items():
            w[MIDX[mid]] = ww
        if c.multi:
            wobble = np.exp(rng_a.normal(0, 0.10, (D, NM))) * (w > 0)
            sh = wobble * w[None, :]
            sh = np.round(sh / sh.sum(axis=1, keepdims=True), 4)
            # force exact 1.0 on the largest cell
            diff = 1.0 - sh.sum(axis=1)
            top = np.argmax(sh, axis=1)
            sh[np.arange(D), top] += diff
            share[c.idx] = np.round(sh, 4)
        else:
            share[c.idx, :, MIDX[c.primary_market]] = 1.0
    a_spend = np.zeros((C, D, NM), dtype=np.int64)
    a_imps = np.zeros((C, D, NM), dtype=np.int64)
    a_clicks = np.zeros((C, D, NM), dtype=np.int64)
    a_conv = np.zeros((C, D, NM))
    for c in camps:
        a_spend[c.idx] = split_int_matrix(spend[c.idx], share[c.idx])
        a_imps[c.idx] = split_int_matrix(imps[c.idx], share[c.idx])
        a_clicks[c.idx] = split_int_matrix(clicks[c.idx], share[c.idx])
        a_conv[c.idx] = conv[c.idx][:, None] * share[c.idx]

    # ---------------- offline spend ----------------
    rng_o = stream(seed, "offline")
    off_spend = np.zeros((D, NM, NS), dtype=np.int64)
    # mail: a drop each Tuesday per market
    mail_week = 700.0 * 7 * 100.0  # cents a week
    for di, d in enumerate(days):
        if d.weekday() == 1:
            for mi, m in enumerate(MARKETS):
                off_spend[di, mi, SIDX["DMA"]] = int(round(mail_week * m.weight * (0.9 + 0.2 * trend_s[di]) * rng_o.uniform(0.92, 1.08) / 100)) * 100
    # TV: four markets, flights four weeks on and one off, daily spread
    tv_markets = ["Harborview", "Pinecrest", "Stonebridge", "Sunvale"]
    tv_w = np.array([MARKETS[MIDX[m]].weight for m in tv_markets])
    tv_w = tv_w / tv_w.sum()
    for di, d in enumerate(days):
        week_no = (d - start).days // 7
        if week_no % 5 != 4:
            for k, mid in enumerate(tv_markets):
                off_spend[di, MIDX[mid], SIDX["TVR"]] = int(round(650.0 * 100 * tv_w[k] * 1.0 * rng_o.uniform(0.9, 1.1) * (0.9 + 0.12 * trend_s[di]) * (5 / 4)))
    # events: home shows, weekends, rotating three markets
    ev_markets = ["Harborview", "Stonebridge", "Sunvale", "Pinecrest"]
    show_days = {}
    for di, d in enumerate(days):
        if d.weekday() in (5, 6):
            wk = (d - start).days // 7
            if wk % 3 == 0:
                mid = ev_markets[(wk // 3) % len(ev_markets)]
                show_days[(di, mid)] = True
                off_spend[di, MIDX[mid], SIDX["EVT"]] = int(round(rng_o.uniform(2100, 2700))) * 100

    # agency fees on agency-run media, by market and sub-source
    fee = np.zeros((D, NM, NS), dtype=np.int64)
    leaf_media = np.zeros((D, NM, NS, LH), dtype=np.int64)
    leaf_imps = np.zeros((D, NM, NS, LH), dtype=np.int64)
    leaf_clicks = np.zeros((D, NM, NS, LH), dtype=np.int64)
    paid_conv = np.zeros((D, NM, NS, LH))
    for c in camps:
        si, bi = SIDX[c.subsource], BRANDS.index(c.brand)
        leaf_media[:, :, si, bi] += a_spend[c.idx]
        leaf_imps[:, :, si, bi] += a_imps[c.idx]
        leaf_clicks[:, :, si, bi] += a_clicks[c.idx]
        lf = 0.85 if c.platform == "meta" else 0.95
        paid_conv[:, :, si, bi] += a_conv[c.idx] * lf
    for code in ("MAA", "BAA"):
        si = SIDX[code]
        fee[:, :, si] = np.round(leaf_media[:, :, si, :].sum(axis=2) * AGENCY_FEE_RATE).astype(np.int64)

    # ---------------- leads (leaf) ----------------
    rng_l = stream(seed, "leads")
    trend_l = 0.88 + 0.14 * t
    f_lead = trend_l * DOW_LEAD[dow] * season
    lead_mean = np.zeros((D, NM, NS, LH))
    lead_mean += paid_conv  # paid sources: platform conversions that became CRM leads
    brand_share = {"ORG": 0.76, "DMA": 0.80, "TVR": 0.90, "EVT": 0.88, "REF": 0.70, "DIR": 0.74}
    base = {"ORG": 128.0, "REF": 58.0, "DIR": 42.0}
    for code, mean in base.items():
        si = SIDX[code]
        bs = brand_share[code]
        for bi, bsh in enumerate((bs, 1 - bs)):
            lead_mean[:, :, si, bi] += (mean * f_lead * bsh)[:, None] * (M_W * (1 + 0.1 * np.sin(np.arange(NM))))[None, :]
    # offline sources respond to their spend
    cpl = {"DMA": 32.0, "TVR": 36.0, "EVT": 28.0}
    for code in ("DMA", "TVR", "EVT"):
        si = SIDX[code]
        sp = off_spend[:, :, si].astype(float) / 100.0
        if code == "DMA":
            # a drop pays out over the following ten days
            kernel = np.array([0.02, 0.10, 0.17, 0.18, 0.15, 0.12, 0.10, 0.07, 0.05, 0.04])
            resp = np.zeros_like(sp)
            for k, kw in enumerate(kernel):
                resp[k:] += kw * sp[: D - k] if k else kw * sp
            lm = resp / cpl[code]
        elif code == "TVR":
            smooth = np.zeros_like(sp)
            for k in range(3):
                smooth[k:] += sp[: D - k] / 3.0 if k else sp / 3.0
            lm = smooth / cpl[code]
        else:
            lm = sp / cpl[code]
        bs = brand_share[code]
        lead_mean[:, :, si, 0] += lm * bs
        lead_mean[:, :, si, 1] += lm * (1 - bs)
    leads = rng_l.poisson(lead_mean).astype(np.int64)

    # ---------------- funnel (leaf) ----------------
    rng_f = stream(seed, "funnel")
    p_set = np.array([0.30, 0.29, 0.22, 0.21, 0.31, 0.27, 0.24, 0.33, 0.42, 0.30]) * 0.90
    p_issue = 0.72
    p_demo = np.array([0.72, 0.71, 0.68, 0.67, 0.72, 0.71, 0.70, 0.72, 0.74, 0.70])
    p_close = np.array([0.205, 0.195, 0.135, 0.125, 0.215, 0.195, 0.175, 0.175, 0.31, 0.205]) * 0.78
    mkt_adj = np.array([m.lead_adj for m in MARKETS])
    set_adj = (0.97 + 0.06 * t)[:, None, None, None] * mkt_adj[None, :, None, None]
    close_adj = (0.95 + 0.10 * t)[:, None, None, None] * np.array([1.03, 0.98, 1.01, 0.97, 0.96, 1.0])[None, :, None, None]
    brand_close = np.array([1.0, 0.93])[None, None, None, :]
    ps = np.clip(p_set[None, None, :, None] * set_adj, 0, 0.95)
    pdm = np.clip(p_demo[None, None, :, None] * np.ones_like(ps), 0, 0.95)
    pcl = np.clip(p_close[None, None, :, None] * close_adj * brand_close, 0, 0.9)

    # Stage counts are the expected value with stochastic rounding and one shared daily wobble per stage, not independent
    # coin flips per cell: a month of ~300 sales then moves with the season and the trend instead of with luck.
    def srnd(x):
        """Systematic rounding within each day: every cell is floor or ceiling of its expected count, and the day's total is the
        expected total rounded, so rounding adds no month-to-month noise of its own."""
        flat = x.reshape(D, -1)
        c = np.cumsum(flat, axis=1) + rng_f.random((D, 1))
        n = np.floor(c) - np.floor(c - flat)
        return n.reshape(x.shape).astype(np.int64)

    def wobble(sd, rho=0.6):
        return np.exp(_ar1(rng_f, 1, D, rho, sd)[0])[:, None, None, None]

    sets = np.minimum(srnd(leads * ps * wobble(0.035)), leads)
    issues = np.minimum(srnd(sets * p_issue * wobble(0.03)), sets)
    demos = np.minimum(srnd(issues * pdm * wobble(0.03)), issues)
    sales = np.minimum(srnd(demos * pcl * wobble(0.06)), demos)

    # dollars: average ticket calibrated afterwards so recent revenue per day is about 42,500
    price_noise = np.exp(rng_f.normal(0, 0.10, sales.shape))
    brand_price = np.array([1.0, 0.82])[None, None, None, :]
    unit = 3400.0 * brand_price * price_noise
    sold_raw = sales * unit
    # calibration over the last 30 days
    recent = slice(max(0, D - 30), D)
    cur_per_day = sold_raw[recent].sum() / max(1, (D - max(0, D - 30)))
    ticket_scale = 42500.0 / cur_per_day if cur_per_day > 0 else 1.0
    sold = (np.round(sold_raw * ticket_scale)).astype(np.int64) * 100
    cancels = np.minimum(srnd(sales * 0.085 * wobble(0.1)), sales)
    cancel_c = (np.round(cancels * unit * ticket_scale * rng_f.uniform(0.9, 1.1, sales.shape))).astype(np.int64) * 100
    turn = np.minimum(srnd(sales * 0.03 * wobble(0.1)), sales)
    turndown = (np.round(turn * unit * ticket_scale)).astype(np.int64) * 100
    rtc = np.zeros_like(sold)
    rtc[max(0, D - 3):] = sold[max(0, D - 3):]
    unruled = rng_f.poisson(0.04, sales.shape).astype(np.int64) * (demos > 0)

    # leaf spend (media + fees + offline) for mapped-cost views
    leaf_spend = leaf_media.copy()
    # offline spend follows the brand split of its leads so brand lenses stay honest
    for code in ("DMA", "TVR", "EVT"):
        si = SIDX[code]
        tot = off_spend[:, :, si]
        bs = brand_share[code]
        nbp = np.round(tot * (1 - bs) / 100.0).astype(np.int64) * 100
        leaf_spend[:, :, si, 0] = tot - nbp
        leaf_spend[:, :, si, 1] = nbp
    for code in ("MAA", "BAA"):
        si = SIDX[code]
        # agency fee follows the media it is charged on
        for bi in range(LH):
            leaf_spend[:, :, si, bi] = leaf_media[:, :, si, bi] + np.round(leaf_media[:, :, si, bi] * AGENCY_FEE_RATE).astype(np.int64)
        # reconcile rounding against the market-level fee
        diff = fee[:, :, si] - np.round(leaf_media[:, :, si, 0] * AGENCY_FEE_RATE).astype(np.int64) - np.round(leaf_media[:, :, si, 1] * AGENCY_FEE_RATE).astype(np.int64)
        leaf_spend[:, :, si, 0] += diff
    # tools and labor (company level, not allocated below the grain the source reports)
    rng_t = stream(seed, "tools")
    tools = np.round(30000.0 * (0.96 + 0.08 * t) * rng_t.uniform(0.98, 1.02, D)).astype(np.int64)  # 300 dollars a day, cents
    tools = (tools // 100) * 100
    labor = np.array([int(round(4000000.0 / _days_in_month(d) / 100.0)) * 100 for d in days], dtype=np.int64)  # 40,000 a month, ruled constant

    # ---------------- call floor ----------------
    rng_c = stream(seed, "callfloor")
    day_leads = leads.sum(axis=(1, 2, 3)).astype(float)
    open_f = np.array([1.0, 1.0, 1.0, 1.0, 1.0, 0.55, 0.0])[dow]
    lead_roll = day_leads + 0.5 * np.concatenate([[day_leads[0]], day_leads[:-1]])
    dials = rng_c.poisson(lead_roll * 4.2 * open_f).astype(np.int64)
    crate = np.clip(0.118 + 0.014 * t + rng_c.normal(0, 0.006, D), 0.08, 0.2)
    connects_total = rng_c.binomial(dials, crate).astype(np.int64)
    dials_d = np.round(dials * np.clip(rng_c.normal(0.56, 0.015, D), 0.4, 0.7)).astype(np.int64)
    connects_d = np.round(connects_total * np.clip(rng_c.normal(0.86, 0.01, D), 0.7, 0.95)).astype(np.int64)
    machine = np.round(dials * np.clip(rng_c.normal(0.22, 0.012, D), 0.1, 0.35)).astype(np.int64)
    agents_n = np.where(open_f > 0, np.round(24 + 3 * t + rng_c.normal(0, 1.2, D)).astype(np.int64) * np.where(open_f < 1, 0.7, 1.0), 0).astype(np.int64)
    # allocate calls and connects down to the leaf by lead weight (zero-lead days carry zero)
    flat = leads.reshape(D, -1).astype(float)
    calls = split_int_matrix(dials, flat).reshape(leads.shape)
    connects = split_int_matrix(connects_total, flat).reshape(leads.shape)

    return World(
        seed=seed, start=start, end=end, days=days, D=D, dow=dow, campaigns=camps,
        spend=spend, imps=imps, clicks=clicks, conv=conv, all_conv=all_conv, conv_value=conv_value,
        imp_share=imp_share, video_views=video_views, reach=reach, freq=freq, share=share,
        a_spend=a_spend, a_imps=a_imps, a_clicks=a_clicks, a_conv=a_conv,
        off_spend=off_spend, fee=fee, tools_cents=tools, labor_cents=labor,
        leads=leads, sets=sets, issues=issues, demos=demos, sales=sales, sold=sold, cancels=cancels,
        cancel_c=cancel_c, rtc=rtc, turndown=turndown, unruled=unruled,
        leaf_spend=leaf_spend, leaf_imps=leaf_imps, leaf_clicks=leaf_clicks, calls=calls, connects=connects,
        dials=dials, dials_d=dials_d, connects_d=connects_d, machine=machine, agents_n=agents_n,
        ticket_scale=ticket_scale,
        extra={"show_days": show_days, "season": season, "trend_l": trend_l, "crate": crate, "connects_total": connects_total},
    )


def _days_in_month(d: date) -> int:
    nxt = date(d.year + (d.month == 12), (d.month % 12) + 1, 1)
    return (nxt - date(d.year, d.month, 1)).days


# --------------------------------------------------------------------------------------
# Roll-ups used by several feeds
# --------------------------------------------------------------------------------------


def month_labels(days) -> list[str]:
    return [f"{d.year:04d}-{d.month:02d}" for d in days]


def period_index(labels: list[str]):
    uniq = sorted(set(labels))
    pos = {p: i for i, p in enumerate(uniq)}
    return uniq, np.array([pos[x] for x in labels])


def rollup(arr: np.ndarray, idx: np.ndarray, n: int) -> np.ndarray:
    """Sum arr (D, ...) into n groups along axis 0."""
    out = np.zeros((n,) + arr.shape[1:], dtype=arr.dtype)
    np.add.at(out, idx, arr)
    return out


def sold_by_market_day(w: World) -> np.ndarray:
    return w.sold.sum(axis=(2, 3))


def ad_spend_by_market_day(w: World) -> np.ndarray:
    """Mapped ad spend (media + agency fees + offline) by day x market, cents."""
    return w.leaf_spend.sum(axis=(2, 3))
