"""AI operations feeds: the AI spend meter, answer accuracy, and the work ledger of loops, agents and skills.

Everything is synthetic. Model tiers are generic ("frontier" vendor models and "local" models run on our own
hardware); there are no real vendor names, prices or hosts.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

import numpy as np

from common import split_int_matrix, stream
from feedio import B, F64, FeedWriter, I64, S, table
from feeds_money import asof_str
from world import World, month_labels, period_index

# (price per million input tokens, price per million output tokens) in dollars; micro-dollars per token numerically
FRONTIER_EQUIV = {
    "frontier-large": (5.0, 25.0), "frontier-fast": (1.0, 5.0), "local-32b": (3.0, 15.0), "local-8b": (1.0, 5.0),
    "local-vision": (3.0, 15.0), "local-embed": (0.13, 0.0), "local-stt": (0.5, 0.5),
}
LOCAL = {"local-32b", "local-8b", "local-vision", "local-embed", "local-stt"}

# lane, model, endpoint_family, box, calls/day at start, growth multiple over the year, prompt tokens, output tokens
COMBOS = [
    ("front-door-chat", "frontier-fast", "chat", "cloud", 520, 2.4, 2600, 340),
    ("front-door-chat", "local-32b", "chat", "host-a", 240, 3.0, 2400, 330),
    ("phone-agent", "frontier-fast", "chat", "cloud", 410, 2.2, 1900, 210),
    ("call-listening", "local-stt", "transcription", "host-b", 380, 2.0, 9000, 1600),
    ("call-listening", "local-32b", "chat", "host-a", 380, 2.0, 5200, 520),
    ("content-engine", "frontier-large", "chat", "cloud", 90, 3.2, 3800, 900),
    ("content-engine", "local-vision", "vision", "host-c", 160, 2.6, 1900, 220),
    ("report-analyst", "frontier-large", "chat", "cloud", 70, 2.8, 4800, 1100),
    ("report-analyst", "local-32b", "chat", "host-a", 130, 2.6, 4200, 800),
    ("cost-accuracy", "local-32b", "chat", "host-a", 210, 1.8, 5600, 700),
    ("knowledge-base", "local-embed", "embeddings", "host-b", 900, 2.2, 420, 0),
    ("knowledge-base", "local-8b", "chat", "host-b", 330, 2.5, 2100, 300),
    ("creative-library", "local-vision", "vision", "host-c", 120, 2.4, 1900, 240),
]
BOXES = ["cloud", "host-a", "host-b", "host-c"]
SEATS = [("growth-lead", 52, "frontier-large"), ("paid-media", 38, "frontier-large"), ("analyst", 64, "frontier-large"),
         ("scriptwriter", 31, "frontier-fast"), ("edit-crew", 70, "frontier-fast"), ("cost-crew", 44, "frontier-large"),
         ("ci-pair", 26, "frontier-fast")]
SEAT_FEE_MONTH = 200.0  # dollars per seat per month, flat plan
ROLES = ["website-chat", "phone-agent", "kb-assistant", "cockpit-chat"]
INTENTS = ["pricing", "scheduling", "product-info", "service-area", "financing", "warranty", "complaint", "other"]
INTENT_SHARE = np.array([0.22, 0.19, 0.17, 0.11, 0.10, 0.07, 0.05, 0.09])
ROLE_BASE = {"website-chat": 190.0, "phone-agent": 260.0, "kb-assistant": 150.0, "cockpit-chat": 40.0}
WORKFLOWS = [("daily-ad-pull", 3.0), ("cost-sync", 3.0), ("call-scoring", 11.0), ("reel-edit", 4.0), ("weekly-report", 1.2),
             ("kb-answer", 8.0), ("chat-session", 10.0), ("lead-followup", 6.0)]


def _dow_f(w: World, weekend=0.55):
    return np.where(w.dow >= 5, weekend, 1.0)


def write_meter(fw: FeedWriter, w: World) -> dict:
    D = w.D
    rng = stream(w.seed, "meter")
    t = np.arange(D) / max(1, D - 1)
    dstr = [d.isoformat() for d in w.days]
    dow = _dow_f(w, 0.6)
    incomplete_day = max(0, D - 47)
    # ---------------- cost
    cost_rows = {k: [] for k in ["call_date", "lane", "model", "endpoint_family", "box_id", "complete", "calls", "prompt_tokens",
                                  "output_tokens", "frontier_micro", "actual_micro", "net_micro", "frontier_micro_all",
                                  "excluded_from_net_n", "proposed_n", "unmapped_n", "unpriced_n", "unattributed_n", "unnamed_n", "errors"]}
    by_day_model = defaultdict(lambda: [0, 0])
    by_day_box = defaultdict(int)
    tot_calls_day = np.zeros(D, dtype=np.int64)
    for lane, model, ep, box, base, growth, pt, ot in COMBOS:
        mean = base * (1.0 + (growth - 1.0) * t) * dow * np.exp(rng.normal(0, 0.06, D))
        calls = rng.poisson(np.maximum(mean, 0.1)).astype(np.int64)
        ptoks = (calls * pt * rng.uniform(0.96, 1.04, D)).astype(np.int64)
        otoks = (calls * ot * rng.uniform(0.96, 1.04, D)).astype(np.int64)
        inp, outp = FRONTIER_EQUIV[model]
        frontier = (ptoks * inp + otoks * outp).astype(np.int64)
        actual = frontier.copy() if model not in LOCAL else ((ptoks + otoks) * 0.03).astype(np.int64)
        excl = rng.binomial(calls, 0.004).astype(np.int64)
        avg_unit = frontier / np.maximum(calls, 1)
        frontier_all = frontier + (excl * avg_unit).astype(np.int64)
        for di in range(D):
            complete = not (di == incomplete_day and box == "host-b")
            cost_rows["call_date"].append(dstr[di])
            cost_rows["lane"].append(lane)
            cost_rows["model"].append(model)
            cost_rows["endpoint_family"].append(ep)
            cost_rows["box_id"].append(box)
            cost_rows["complete"].append(complete)
            cost_rows["calls"].append(int(calls[di]))
            cost_rows["prompt_tokens"].append(int(ptoks[di]))
            cost_rows["output_tokens"].append(int(otoks[di]))
            cost_rows["frontier_micro"].append(int(frontier[di]))
            cost_rows["actual_micro"].append(int(actual[di]))
            cost_rows["net_micro"].append(int(frontier[di] - actual[di]))
            cost_rows["frontier_micro_all"].append(int(frontier_all[di]))
            cost_rows["excluded_from_net_n"].append(int(excl[di]))
            cost_rows["proposed_n"].append(0)
            cost_rows["unmapped_n"].append(0)
            cost_rows["unpriced_n"].append(0)
            cost_rows["unattributed_n"].append(int(rng.binomial(calls[di], 0.003)))
            cost_rows["unnamed_n"].append(int(rng.binomial(calls[di], 0.002)))
            cost_rows["errors"].append(int(rng.binomial(calls[di], 0.005)))
            by_day_model[(di, model)][0] += int(calls[di])
            by_day_model[(di, model)][1] += int(ptoks[di] + otoks[di])
            by_day_box[(di, box)] += int(calls[di])
        tot_calls_day += calls
    fw.write("meter_cost_daily", table(cost_rows, [
        ("call_date", S), ("lane", S), ("model", S), ("endpoint_family", S), ("box_id", S), ("complete", B), ("calls", I64),
        ("prompt_tokens", I64), ("output_tokens", I64), ("frontier_micro", I64), ("actual_micro", I64), ("net_micro", I64),
        ("frontier_micro_all", I64), ("excluded_from_net_n", I64), ("proposed_n", I64), ("unmapped_n", I64), ("unpriced_n", I64),
        ("unattributed_n", I64), ("unnamed_n", I64), ("errors", I64)]))

    tier = {k: [] for k in ["call_date", "model", "day_complete", "calls", "tokens"]}
    for (di, model), (c, tk) in sorted(by_day_model.items()):
        tier["call_date"].append(dstr[di])
        tier["model"].append(model)
        tier["day_complete"].append(True)
        tier["calls"].append(c)
        tier["tokens"].append(tk)
    fw.write("meter_tier_mix_daily", table(tier, [("call_date", S), ("model", S), ("day_complete", B), ("calls", I64), ("tokens", I64)]))

    comp = {k: [] for k in ["recon_date", "box_id", "complete", "server_requests", "meter_rows", "difference", "tdd_fail_n"]}
    for di in range(D):
        for box in BOXES:
            n = by_day_box.get((di, box), 0)
            if n == 0:
                continue
            gap = 1 if (di == incomplete_day and box == "host-b") else 0
            comp["recon_date"].append(dstr[di])
            comp["box_id"].append(box)
            comp["complete"].append(gap == 0)
            comp["server_requests"].append(n + gap)
            comp["meter_rows"].append(n)
            comp["difference"].append(gap)
            comp["tdd_fail_n"].append(gap)
    fw.write("meter_completeness", table(comp, [("recon_date", S), ("box_id", S), ("complete", B), ("server_requests", I64),
                                                ("meter_rows", I64), ("difference", I64), ("tdd_fail_n", I64)]))

    # ---------------- seats
    mrows = {k: [] for k in ["msg_date", "seat_id", "model", "transcript_kind", "messages", "input_tokens", "output_tokens",
                              "cache_write_5m", "cache_write_1h", "cache_read", "api_equiv_micro"]}
    seat_day = defaultdict(lambda: [0, 0])
    for seat, base, model in SEATS:
        for kind, kshare in (("interactive", 0.62), ("headless", 0.38)):
            mean = base * kshare * (0.9 + 0.5 * t) * dow * np.exp(rng.normal(0, 0.1, D))
            msgs = rng.poisson(np.maximum(mean, 0.05)).astype(np.int64)
            inp_t = (msgs * rng.uniform(900, 1400, D)).astype(np.int64)
            out_t = (msgs * rng.uniform(260, 520, D)).astype(np.int64)
            cw5 = (msgs * rng.uniform(1500, 2600, D)).astype(np.int64)
            cw1 = (msgs * rng.uniform(300, 900, D)).astype(np.int64)
            cr = (msgs * rng.uniform(21000, 38000, D)).astype(np.int64)
            inp, outp = FRONTIER_EQUIV[model]
            api = (inp_t * inp + out_t * outp + cw5 * inp * 1.25 + cw1 * inp * 2.0 + cr * inp * 0.1).astype(np.int64)
            for di in range(D):
                if msgs[di] == 0:
                    continue
                mrows["msg_date"].append(dstr[di])
                mrows["seat_id"].append(seat)
                mrows["model"].append(model)
                mrows["transcript_kind"].append(kind)
                mrows["messages"].append(int(msgs[di]))
                mrows["input_tokens"].append(int(inp_t[di]))
                mrows["output_tokens"].append(int(out_t[di]))
                mrows["cache_write_5m"].append(int(cw5[di]))
                mrows["cache_write_1h"].append(int(cw1[di]))
                mrows["cache_read"].append(int(cr[di]))
                mrows["api_equiv_micro"].append(int(api[di]))
                seat_day[(di, seat)][0] += int(msgs[di])
                seat_day[(di, seat)][1] += int(api[di])
    fw.write("meter_seat_model_daily", table(mrows, [
        ("msg_date", S), ("seat_id", S), ("model", S), ("transcript_kind", S), ("messages", I64), ("input_tokens", I64),
        ("output_tokens", I64), ("cache_write_5m", I64), ("cache_write_1h", I64), ("cache_read", I64), ("api_equiv_micro", I64)]))
    srows = {k: [] for k in ["msg_date", "seat_id", "billing_month", "pricing_state", "messages", "sessions", "api_equiv_micro",
                              "fee_micro_day", "net_micro", "proposed_n", "unpriced_n"]}
    for (di, seat), (msgs, api) in sorted(seat_day.items()):
        d = w.days[di]
        dim = (date(d.year + (d.month == 12), (d.month % 12) + 1, 1) - date(d.year, d.month, 1)).days
        fee = int(SEAT_FEE_MONTH / dim * 1_000_000)
        srows["msg_date"].append(dstr[di])
        srows["seat_id"].append(seat)
        srows["billing_month"].append(f"{d.year:04d}-{d.month:02d}")
        srows["pricing_state"].append("priced")
        srows["messages"].append(msgs)
        srows["sessions"].append(1)
        srows["api_equiv_micro"].append(api)
        srows["fee_micro_day"].append(fee)
        srows["net_micro"].append(api - fee)
        srows["proposed_n"].append(0)
        srows["unpriced_n"].append(0)
    fw.write("meter_seat_daily", table(srows, [
        ("msg_date", S), ("seat_id", S), ("billing_month", S), ("pricing_state", S), ("messages", I64), ("sessions", I64),
        ("api_equiv_micro", I64), ("fee_micro_day", I64), ("net_micro", I64), ("proposed_n", I64), ("unpriced_n", I64)]))

    # ---------------- workflows
    wrows = {k: [] for k in ["call_date", "workflow_type", "pricing_state", "day_complete", "calls", "total_tokens",
                              "calls_without_counts", "frontier_micro"]}
    for wf, mean_n in WORKFLOWS:
        n_inst = rng.poisson(np.maximum(mean_n * (0.8 + 0.7 * t) * dow, 0.1))
        for di in range(D):
            for _ in range(int(n_inst[di])):
                calls = int(rng.integers(2, 40) if wf != "weekly-report" else rng.integers(20, 90))
                tokens = int(calls * rng.uniform(2200, 6400))
                wrows["call_date"].append(dstr[di])
                wrows["workflow_type"].append(wf)
                wrows["pricing_state"].append("priced")
                wrows["day_complete"].append(True)
                wrows["calls"].append(calls)
                wrows["total_tokens"].append(tokens)
                wrows["calls_without_counts"].append(int(rng.binomial(calls, 0.01)))
                wrows["frontier_micro"].append(int(tokens * rng.uniform(2.2, 4.5)))
    fw.write("meter_workflow_tokens", table(wrows, [
        ("call_date", S), ("workflow_type", S), ("pricing_state", S), ("day_complete", B), ("calls", I64), ("total_tokens", I64),
        ("calls_without_counts", I64), ("frontier_micro", I64)]))
    return {"calls_day": tot_calls_day, "by_day_model": by_day_model}


def write_accuracy(fw: FeedWriter, w: World) -> dict:
    D = w.D
    rng = stream(w.seed, "accuracy")
    t = np.arange(D) / max(1, D - 1)
    dstr = [d.isoformat() for d in w.days]
    dow = _dow_f(w, 0.7)
    mlabel = month_labels(w.days)
    uniq, midx = period_index(mlabel)
    q = {k: [] for k in ["q_date", "seat_role", "intent", "asked", "answered", "refused", "deflected", "errored", "other_n", "deflect_overrides"]}
    acc_day = {k: [] for k in ["period", "grain", "seat_role", "intent", "gradeable_n", "graded_n", "ungraded_n", "re_verify_n", "right_n",
                                "wrong_source_n", "better_source_n", "wrong_tool_n", "unfaithful_n", "stale_n"]}
    acc_month = defaultdict(lambda: np.zeros(10, dtype=np.int64))
    faith_day = np.zeros((D, 6), dtype=np.int64)
    asked_total = np.zeros(D, dtype=np.int64)
    answered_total = np.zeros(D, dtype=np.int64)
    p_out = np.array([0.887, 0.025, 0.065, 0.005, 0.018])
    for role in ROLES:
        for ii, intent in enumerate(INTENTS):
            mean = ROLE_BASE[role] * INTENT_SHARE[ii] * (0.85 + 0.55 * t) * dow
            asked = rng.poisson(np.maximum(mean, 0.05)).astype(np.int64)
            outc = np.stack([rng.multinomial(int(a), p_out) for a in asked])  # answered, refused, deflected, errored, other
            answered, refused, deflected, errored, other = (outc[:, k] for k in range(5))
            overrides = rng.binomial(deflected, 0.06)
            acc_p = np.clip(0.905 + 0.045 * t + rng.normal(0, 0.012, D), 0.8, 0.99)
            gradeable = rng.binomial(answered, 0.62)
            graded = rng.binomial(gradeable, 0.86)
            ungraded = gradeable - graded
            reverify = rng.binomial(graded, 0.02)
            right = rng.binomial(graded, acc_p)
            rest = graded - right
            wr = np.stack([rng.multinomial(int(r), [0.30, 0.20, 0.15, 0.20, 0.15]) for r in rest]) if D else np.zeros((0, 5))
            for di in range(D):
                q["q_date"].append(dstr[di])
                q["seat_role"].append(role)
                q["intent"].append(intent)
                q["asked"].append(int(asked[di]))
                q["answered"].append(int(answered[di]))
                q["refused"].append(int(refused[di]))
                q["deflected"].append(int(deflected[di]))
                q["errored"].append(int(errored[di]))
                q["other_n"].append(int(other[di]))
                q["deflect_overrides"].append(int(overrides[di]))
                acc_day["period"].append(dstr[di])
                acc_day["grain"].append("day")
                acc_day["seat_role"].append(role)
                acc_day["intent"].append(intent)
                acc_day["gradeable_n"].append(int(gradeable[di]))
                acc_day["graded_n"].append(int(graded[di]))
                acc_day["ungraded_n"].append(int(ungraded[di]))
                acc_day["re_verify_n"].append(int(reverify[di]))
                acc_day["right_n"].append(int(right[di]))
                for k, name in enumerate(["wrong_source_n", "better_source_n", "wrong_tool_n", "unfaithful_n", "stale_n"]):
                    acc_day[name].append(int(wr[di, k]))
                vec = np.array([gradeable[di], graded[di], ungraded[di], reverify[di], right[di], *wr[di]], dtype=np.int64)
                acc_month[(uniq[midx[di]], role, intent)] += vec
            faith_day[:, 0] += graded
            faith_day[:, 1] += right + wr[:, 1]  # supported: right or merely a better source existed
            faith_day[:, 2] += wr[:, 3]
            faith_day[:, 3] += ungraded
            asked_total += asked
            answered_total += answered
    fw.write("meter_question_daily", table(q, [
        ("q_date", S), ("seat_role", S), ("intent", S), ("asked", I64), ("answered", I64), ("refused", I64), ("deflected", I64),
        ("errored", I64), ("other_n", I64), ("deflect_overrides", I64)]))
    for (p, role, intent), v in sorted(acc_month.items()):
        acc_day["period"].append(p)
        acc_day["grain"].append("month")
        acc_day["seat_role"].append(role)
        acc_day["intent"].append(intent)
        for name, x in zip(["gradeable_n", "graded_n", "ungraded_n", "re_verify_n", "right_n", "wrong_source_n", "better_source_n",
                            "wrong_tool_n", "unfaithful_n", "stale_n"], v):
            acc_day[name].append(int(x))
    fw.write("meter_accuracy_period", table(acc_day, [
        ("period", S), ("grain", S), ("seat_role", S), ("intent", S), ("gradeable_n", I64), ("graded_n", I64), ("ungraded_n", I64),
        ("re_verify_n", I64), ("right_n", I64), ("wrong_source_n", I64), ("better_source_n", I64), ("wrong_tool_n", I64),
        ("unfaithful_n", I64), ("stale_n", I64)]))

    fr = {k: [] for k in ["period", "grain", "checked_n", "supported_n", "unfaithful_n", "unverified_n", "excluded_unvalidated_n", "no_record_n"]}
    month_acc = defaultdict(lambda: np.zeros(5, dtype=np.int64))
    for di in range(D):
        checked = int(faith_day[di, 0] * 0.72)
        unf = int(rng.binomial(checked, 0.012))
        sup = checked - unf - int(rng.binomial(checked, 0.02))
        unver = checked - sup - unf
        excl = int(rng.binomial(max(0, int(faith_day[di, 0]) - checked), 0.08))
        norec = int(rng.binomial(checked, 0.004))
        fr["period"].append(dstr[di])
        fr["grain"].append("day")
        fr["checked_n"].append(checked)
        fr["supported_n"].append(sup)
        fr["unfaithful_n"].append(unf)
        fr["unverified_n"].append(unver)
        fr["excluded_unvalidated_n"].append(excl)
        fr["no_record_n"].append(norec)
        month_acc[uniq[midx[di]]] += np.array([checked, sup, unf, unver, excl])
    for p, v in sorted(month_acc.items()):
        fr["period"].append(p)
        fr["grain"].append("month")
        fr["checked_n"].append(int(v[0]))
        fr["supported_n"].append(int(v[1]))
        fr["unfaithful_n"].append(int(v[2]))
        fr["unverified_n"].append(int(v[3]))
        fr["excluded_unvalidated_n"].append(int(v[4]))
        fr["no_record_n"].append(0)
    fw.write("meter_faithfulness_period", table(fr, [
        ("period", S), ("grain", S), ("checked_n", I64), ("supported_n", I64), ("unfaithful_n", I64), ("unverified_n", I64),
        ("excluded_unvalidated_n", I64), ("no_record_n", I64)]))

    lat = {k: [] for k in ["period", "grain", "intent", "n", "retrieval_p50", "retrieval_p95", "first_token_p50", "complete_p50",
                            "complete_p95", "retrieval_budget_p50", "complete_budget_p50"]}
    for ii, intent in enumerate(INTENTS):
        base_ret = 180 + 22 * ii
        for di in range(D):
            n = int(max(5, answered_total[di] * INTENT_SHARE[ii]))
            improve = 1.0 - 0.18 * t[di]
            rp50 = base_ret * improve * rng.uniform(0.94, 1.06)
            lat["period"].append(dstr[di])
            lat["grain"].append("day")
            lat["intent"].append(intent)
            lat["n"].append(n)
            lat["retrieval_p50"].append(round(rp50, 1))
            lat["retrieval_p95"].append(round(rp50 * 2.6, 1))
            lat["first_token_p50"].append(round(rp50 + 420 * improve, 1))
            lat["complete_p50"].append(round(rp50 + 2100 * improve * rng.uniform(0.95, 1.05), 1))
            lat["complete_p95"].append(round(rp50 + 5600 * improve * rng.uniform(0.95, 1.08), 1))
            lat["retrieval_budget_p50"].append(400.0)
            lat["complete_budget_p50"].append(3500.0)
    fw.write("meter_latency_period", table(lat, [
        ("period", S), ("grain", S), ("intent", S), ("n", I64), ("retrieval_p50", F64), ("retrieval_p95", F64), ("first_token_p50", F64),
        ("complete_p50", F64), ("complete_p95", F64), ("retrieval_budget_p50", F64), ("complete_budget_p50", F64)]))

    # learning history: one nightly run
    lh = {k: [] for k in ["run_date", "outcome", "checker_status", "improve_n", "hold_n", "regress_n", "rollback_n", "labels_checker", "gaps_new", "gaps_closed"]}
    outcomes = rng.choice(["improve", "hold", "regress", "rollback"], size=D, p=[0.34, 0.54, 0.07, 0.05])
    for di in range(D):
        o = str(outcomes[di])
        lh["run_date"].append(dstr[di])
        lh["outcome"].append(o)
        lh["checker_status"].append("fail" if o in ("regress", "rollback") else "pass")
        for name in ("improve", "hold", "regress", "rollback"):
            lh[f"{name}_n"].append(1 if o == name else 0)
        lh["labels_checker"].append(int(rng.integers(12, 60)))
        lh["gaps_new"].append(int(rng.poisson(0.8)))
        lh["gaps_closed"].append(int(rng.poisson(1.5 if o == "improve" else 0.75)))
    fw.write("meter_learning_history", table(lh, [
        ("run_date", S), ("outcome", S), ("checker_status", S), ("improve_n", I64), ("hold_n", I64), ("regress_n", I64),
        ("rollback_n", I64), ("labels_checker", I64), ("gaps_new", I64), ("gaps_closed", I64)]))

    gp = {k: [] for k in ["period", "open_at_end", "opened", "closed", "median_days_to_close"]}
    openn = 62
    for p in uniq:
        di = [i for i in range(D) if mlabel[i] == p]
        opened = sum(lh["gaps_new"][i] for i in di)
        closed = min(openn + opened, sum(lh["gaps_closed"][i] for i in di))
        openn = openn + opened - closed
        gp["period"].append(p)
        gp["open_at_end"].append(int(openn))
        gp["opened"].append(int(opened))
        gp["closed"].append(int(closed))
        gp["median_days_to_close"].append(round(float(rng.uniform(4.0, 9.5) - 2.0 * (uniq.index(p) / len(uniq))), 1))
    fw.write("meter_gaps_period", table(gp, [("period", S), ("open_at_end", I64), ("opened", I64), ("closed", I64), ("median_days_to_close", F64)]))
    return {"asked_total": asked_total, "answered_total": answered_total, "uniq": uniq, "faith_day": faith_day}


# --------------------------------------------------------------------------------------
# work ledger
# --------------------------------------------------------------------------------------

# routine id, unit class, box, runs per day (weekday), minutes of human work replaced per run, tokens per run (prompt, output)
ROUTINES = [
    ("daily-ad-pull", "loop", "host-a", 1, 22, (0, 0)),
    ("cost-sync", "loop", "host-a", 1, 35, (0, 0)),
    ("completeness-gate", "loop", "host-a", 1, 15, (0, 0)),
    ("creative-library-sync", "loop", "host-c", 1, 40, (2600, 300)),
    ("call-scoring", "loop", "host-b", 24, 4, (5200, 520)),
    ("call-swot-weekly", "loop", "host-b", 0.15, 90, (48000, 3200)),
    ("hygiene-read-weekly", "loop", "host-a", 0.15, 75, (22000, 2100)),
    ("speed-to-lead-weekly", "loop", "host-a", 0.15, 55, (18000, 1800)),
    ("self-refreshing-reports", "loop", "host-a", 24, 2, (0, 0)),
    ("daily-alert", "loop", "host-a", 1, 12, (900, 160)),
    ("sales-back-to-platforms", "loop", "host-a", 1, 30, (0, 0)),
    ("nightly-backup", "loop", "host-a", 1, 10, (0, 0)),
    ("nightly-learning", "loop", "host-b", 1, 25, (31000, 2500)),
    ("chat-handoff-check", "loop", "cloud", 4, 6, (1200, 150)),
    ("paid-media-operator", "agent", "cloud", 6, 20, (14000, 1800)),
    ("marketing-analyst", "agent", "cloud", 9, 18, (16000, 2200)),
    ("viral-scriptwriter", "agent", "cloud", 5, 25, (6200, 1900)),
    ("edit-crew", "agent", "host-c", 7, 38, (9800, 1400)),
    ("cost-accuracy-crew", "agent", "host-a", 4, 45, (12000, 1500)),
    ("ai-phone-answering", "automation", "cloud", 70, 3, (1900, 210)),
    ("website-ai-chat", "automation", "cloud", 85, 3, (2600, 340)),
    ("qr-builder", "skill", "cloud", 3, 14, (800, 200)),
    ("brand-voice-pass", "skill", "cloud", 8, 16, (4200, 900)),
]
LABOR_RATE = 38.0  # dollars per hour, ruled constant for the demo


def write_work(fw: FeedWriter, w: World) -> None:
    D = w.D
    rng = stream(w.seed, "work")
    t = np.arange(D) / max(1, D - 1)
    dstr = [d.isoformat() for d in w.days]
    mlabel = month_labels(w.days)
    uniq, midx = period_index(mlabel)
    dow = np.where(w.dow >= 5, 0.5, 1.0)
    rows = {k: [] for k in ["run_day", "box_id", "unit_class", "routine_id", "runs", "success_n", "failed_n", "unknown_end_n",
                             "duration_ms_sum", "tokens_prompt_sum", "tokens_output_sum"]}
    cls_day = defaultdict(lambda: [0, 0, 0])
    month_val = defaultdict(lambda: {"minutes": 0.0, "tokens_cost": 0.0, "runs": 0})
    fail_p = 0.0042
    for rid, cls, box, per_day, minutes, (ptok, otok) in ROUTINES:
        scale = 0.55 + 0.9 * t  # the program grows through the year
        for di in range(D):
            if cls in ("agent", "automation", "skill") and di < D * 0.05 * (sum(map(ord, rid)) % 7):
                continue
            if rid == "creative-library-sync" and di >= D - 2:
                continue  # the one stale loop on the health page: it has not fired for two days
            mean = per_day * scale[di] * (dow[di] if cls != "loop" or per_day > 2 else 1.0)
            runs = int(rng.poisson(mean)) if mean < 50 else int(round(rng.normal(mean, mean * 0.05)))
            if runs == 0:
                continue
            failed = int(rng.binomial(runs, fail_p * (1.8 if di > D - 20 and rid == "creative-library-sync" else 1.0)))
            unknown = int(rng.binomial(runs - failed, 0.002))
            ok = runs - failed - unknown
            dur = int(runs * rng.uniform(4000, 90000))
            rows["run_day"].append(dstr[di])
            rows["box_id"].append(box)
            rows["unit_class"].append(cls)
            rows["routine_id"].append(rid)
            rows["runs"].append(runs)
            rows["success_n"].append(ok)
            rows["failed_n"].append(failed)
            rows["unknown_end_n"].append(unknown)
            rows["duration_ms_sum"].append(dur)
            rows["tokens_prompt_sum"].append(int(runs * ptok * rng.uniform(0.95, 1.05)))
            rows["tokens_output_sum"].append(int(runs * otok * rng.uniform(0.95, 1.05)))
            cd = cls_day[(di, box, cls)]
            cd[0] += runs
            cd[1] += ok
            cd[2] += failed
            mv = month_val[(uniq[midx[di]], box)]
            mv["minutes"] += ok * minutes
            mv["tokens_cost"] += runs * (ptok * 3.0 + otok * 15.0) / 1_000_000.0 * (0.04 if box != "cloud" else 0.5) + runs * 0.0009
            mv["runs"] += runs
    fw.write("work_runs_daily", table(rows, [
        ("run_day", S), ("box_id", S), ("unit_class", S), ("routine_id", S), ("runs", I64), ("success_n", I64), ("failed_n", I64),
        ("unknown_end_n", I64), ("duration_ms_sum", I64), ("tokens_prompt_sum", I64), ("tokens_output_sum", I64)]))

    cp = {k: [] for k in ["period", "grain", "box_id", "unit_class", "runs", "success_n", "failed_n"]}
    mon = defaultdict(lambda: [0, 0, 0])
    for (di, box, cls), (r, ok, f) in sorted(cls_day.items()):
        cp["period"].append(dstr[di])
        cp["grain"].append("day")
        cp["box_id"].append(box)
        cp["unit_class"].append(cls)
        cp["runs"].append(r)
        cp["success_n"].append(ok)
        cp["failed_n"].append(f)
        m = mon[(uniq[midx[di]], box, cls)]
        m[0] += r
        m[1] += ok
        m[2] += f
    for (p, box, cls), (r, ok, f) in sorted(mon.items()):
        cp["period"].append(p)
        cp["grain"].append("month")
        cp["box_id"].append(box)
        cp["unit_class"].append(cls)
        cp["runs"].append(r)
        cp["success_n"].append(ok)
        cp["failed_n"].append(f)
    fw.write("work_class_period", table(cp, [("period", S), ("grain", S), ("box_id", S), ("unit_class", S), ("runs", I64),
                                             ("success_n", I64), ("failed_n", I64)]))

    sv = {k: [] for k in ["period_start", "period_type", "box_id", "counterfactual_usd_micro", "actual_usd_micro", "net_usd_micro"]}
    for (p, box), mv in sorted(month_val.items()):
        cf = mv["minutes"] / 60.0 * LABOR_RATE
        act = mv["tokens_cost"] + mv["runs"] * 0.0004
        sv["period_start"].append(f"{p}-01")
        sv["period_type"].append("month")
        sv["box_id"].append(box)
        sv["counterfactual_usd_micro"].append(int(cf * 1_000_000))
        sv["actual_usd_micro"].append(int(act * 1_000_000))
        sv["net_usd_micro"].append(int((cf - act) * 1_000_000))
    fw.write("work_savings_period", table(sv, [("period_start", S), ("period_type", S), ("box_id", S), ("counterfactual_usd_micro", I64),
                                               ("actual_usd_micro", I64), ("net_usd_micro", I64)]))

    # weekly census: registered units against units that actually ran
    ce = {k: [] for k in ["window_start", "window_end", "box_id", "unit_class", "census_count", "leaf_run_count", "difference"]}
    reg = defaultdict(int)
    for rid, cls, box, *_ in ROUTINES:
        reg[(box, cls)] += 1
    wk0 = w.start - timedelta(days=w.start.weekday())
    weeks = (w.end - wk0).days // 7 + 1
    for k in range(weeks):
        a = wk0 + timedelta(days=7 * k)
        b = a + timedelta(days=6)
        if b > w.end:
            continue  # only closed weeks
        for (box, cls), n in sorted(reg.items()):
            ce["window_start"].append(a.isoformat())
            ce["window_end"].append(b.isoformat())
            ce["box_id"].append(box)
            ce["unit_class"].append(cls)
            ce["census_count"].append(n)
            ce["leaf_run_count"].append(n)
            ce["difference"].append(0)
    fw.write("work_census_period", table(ce, [("window_start", S), ("window_end", S), ("box_id", S), ("unit_class", S),
                                              ("census_count", I64), ("leaf_run_count", I64), ("difference", I64)]))

    mx = {k: [] for k in ["period_start", "box_id", "stage", "result"]}
    for p in uniq:
        for box in ("cloud", "host-a", "host-b", "host-c"):
            for stage in ("census", "run", "outcome", "savings"):
                mx["period_start"].append(f"{p}-01")
                mx["box_id"].append(box)
                mx["stage"].append(stage)
                held = p == uniq[-1] and box == "host-c" and stage == "savings"
                mx["result"].append("HOLD: labor minutes for one new skill still unsigned" if held else "PASS")
    fw.write("work_matrix_period", table(mx, [("period_start", S), ("box_id", S), ("stage", S), ("result", S)]))
