"""Canon views and boards (public/data-views/) and the Digital Marketing board templates (public/data-views/digital/).

A view is a re-computable question (source + slice + presentation), never a number. Every file here is validated by the
app's own validators (scripts/demo-data/validate_views.ts, run by check.py), so a renamed dim or measure fails loudly.
Employer-specific views (review fraud, CRM report browsers) are not carried; "office" views are named for markets.
"""
from __future__ import annotations

import json
from datetime import timedelta

from common import OUT_VIEWS, iso, write_json
from world import World

AUTHOR = "GTM OS demo build"


def _stamp(w: World) -> dict:
    return {"origin": "canon", "created_by": AUTHOR, "created_at": iso(w.end)}


def view(w, vid, name, description, narrative, source, rows, cols, measures, filters=None, preset="last_13", presentation="table",
         chart=None, compare=None):
    v = {"id": vid, "name": name, "description": description, "narrative": narrative, "sourceKey": source, "rows": rows, "cols": cols,
         "measures": measures, "filters": filters or [], "datePreset": preset, "presentation": presentation}
    if chart:
        v["chartSpec"] = chart
    if compare:
        v["compare"] = compare
    v.update(_stamp(w))
    return v


def f_eq(dim, *values):
    return {"dimKey": dim, "op": "=" if len(values) == 1 else "in", "values": list(values)}


def build_views(w: World) -> list[dict]:
    V = lambda *a, **k: view(w, *a, **k)
    out = []
    # ---- revenue and funnel (spine monthly)
    out += [
        V("revenue-by-market", "Revenue by market", "Gross revenue and sales, month by market.",
          "Where the dollars land, month by month and market by market. A soft market shows here first; the drill shows which days drove it.",
          "spine_funnel_monthly", ["period"], ["office"], ["gross"]),
        V("revenue-by-market-bar", "Revenue by market, ranked", "Gross revenue by market over the last 13 months.",
          "Which markets carry the company and which trail it. Click a bar on the revenue board to filter the trend beside it.",
          "spine_funnel_monthly", ["office"], [], ["gross"], presentation="chart", chart={"kind": "bar_h", "x": "office", "y": "gross"}),
        V("revenue-trend-board", "Gross revenue trend", "Gross revenue by month.",
          "The shape of the year: growth, the seasonal dip and the current month shown as month to date.",
          "spine_funnel_monthly", ["period"], [], ["gross"], preset="last_25", presentation="chart", chart={"kind": "line", "x": "period", "y": "gross"}),
        V("net-trend-board", "Net revenue trend", "Revenue after cancels, by month.",
          "Net sits under gross by the cancels and credit declines; the gap is the cost of a sale that does not stick.",
          "spine_funnel_monthly", ["period"], [], ["net"], preset="last_25", presentation="chart", chart={"kind": "line", "x": "period", "y": "net"}),
        V("growth-decomposition", "Growth, this year against last", "Gross revenue by market with the prior-year and trailing-twelve-month pairs.",
          "Which markets drove growth against the same month last year, and how the trailing twelve months compare with the twelve before.",
          "spine_funnel_monthly", ["period", "office"], [], ["gross"],
          compare={"modes": ["prior_year", "ttm_pair"], "pairPctWithDollars": True, "newRevenueSplit": True, "varianceFlag": True}),
        V("aov-by-market", "Average sale by market", "Average gross dollars per sale, month by market.",
          "Average sale moves slowly; a sudden change in one market usually means a product mix or a pricing change there.",
          "spine_funnel_monthly", ["period"], ["office"], ["aov"]),
        V("funnel-conversion", "Funnel, lead to sale", "Leads, sets, issues, demos and sales by month, with sales per issue.",
          "Every stage of the funnel in one table, so a drop in sales can be traced to the stage where it started.",
          "spine_funnel_monthly", ["period"], [], ["leads", "sets", "issues", "demos", "sales", "sale_per_issue"]),
        V("unit-costs", "Unit costs by month", "Cost per lead, set, issued appointment and sale.",
          "What it costs to move one prospect one step down the funnel, month by month; ad spend over the stage count.",
          "spend_funnel_monthly", ["period"], [], ["cost_per_lead", "cost_per_set", "cost_per_issue", "cost_per_sale"]),
        V("mer-board", "Ad spend as a share of revenue", "Ad spend divided by gross revenue, by month.",
          "The share of every revenue dollar spent on ads; lower is better, and the trend matters more than any one month.",
          "spend_funnel_monthly", ["period"], [], ["mer"], presentation="chart", chart={"kind": "line", "x": "period", "y": "mer"}),
        V("spend-media-fee-board", "Spend split: media, agency fees, offline", "Monthly spend by line type.",
          "How much of the budget buys media, how much pays the agency, and how much goes to print, TV and shows.",
          "spine_spend_monthly", ["period", "row_type"], [], ["spend"], presentation="chart",
          chart={"kind": "stacked_bar", "x": "period", "y": "spend", "series": "row_type"}),
        V("spend-by-platform", "Spend by platform", "Monthly ad spend by platform.",
          "Where the money goes each month across the three ad platforms and offline media.",
          "spine_spend_monthly", ["period"], ["platform"], ["spend"]),
    ]
    # ---- efficiency target (all-in marketing cost against net revenue)
    gm = "golden_rule_monthly"
    out += [
        V("efficiency-tier-by-market", "Marketing cost tier by market", "Marketing cost as a share of net revenue and the tier it earns, by market and month.",
          "Each market against the 28 percent target: the ceiling a market can spend at target and where it actually landed.",
          gm, ["period", "office"], ["bonus_tier"], ["ceiling_at_target", "marketing_cost_pct", "mer_traditional"]),
        V("efficiency-monthly", "Marketing cost target, monthly", "Net issued, net revenue and the share still pending, revenue per issued appointment and cost percent by market.",
          "The monthly record behind the target: revenue per net issued appointment, the ceiling it implies and the cost percent against it.",
          gm, ["period", "office"], [], ["net_iss", "net_usd", "prenet_usd", "nsli", "nsli_plus_prenet", "ceiling_at_target", "marketing_cost_pct"]),
        V("efficiency-tieout", "Marketing cost target, matches the CRM", "Rows checked, failures and explained residuals, by month and market.",
          "Every published number is recomputed a second way each night; this view is where a mismatch would show first.",
          "golden_rule_tieout", ["period", "office"], ["result"], ["rows", "fails", "residuals"]),
        V("efficiency-daily", "Marketing cost target, daily", "Net issued, net revenue and the share still pending per day by market.",
          "The daily rows that roll up to the month, so a bad week can be found before the month closes.",
          "golden_rule_daily", ["date", "office"], [], ["net_iss", "net_usd", "prenet_usd", "nsli_plus_prenet", "ceiling_at_target"]),
    ]
    # ---- growth lenses
    out += [
        V("funnel-ratios-by-market", "Funnel ratios by market", "Demo, close, set, issue and lead-to-sale rates by market and month.",
          "The conversion rates that explain a market's revenue: where leads stall and which market converts best.",
          "lens_month", ["period"], ["market"], ["demo_rate", "close_rate", "set_rate", "issue_rate", "lead_to_sale_rate"], [f_eq("lens", "company")]),
        V("lens-campaign-type", "Paid media by campaign type", "Spend, impressions, clicks and click-through rate by campaign type.",
          "What each kind of campaign bought, measured as the platforms report it; paid media only, and labeled that way.",
          "lens_month", ["period"], ["lens_value"], ["impressions", "clicks", "ctr"], [f_eq("lens", "campaign_type")]),
        V("lens-month-landing", "Where the month lands", "This month's sold dollars projected from the share normally booked by this day, with a band.",
          "A projection built from how much of a month is usually booked by now, with a band from the error the same method made in prior months.",
          "lens_projection", ["period"], ["lens_value"], ["projection_point"], [f_eq("projection_key", "month_landing_sold")], preset="all"),
        V("lens-product-monthly", "Sold dollars by product", "Sales, sold dollars, demos and close rate by product and month.",
          "Which product lines grow, which shrink and how each one closes.",
          "lens_month", ["period"], ["lens_value"], ["sold", "sales", "demos", "close_rate"], [f_eq("lens", "product")]),
        V("lens-source-cohort-60", "Which source's leads close best by day 60", "Share of each week's leads that reached a sale by day 60, by source.",
          "Leads grouped by the week they arrived and followed forward, so a source is judged on how its leads mature, not on which month a sale landed in.",
          "lens_cohort", ["period"], ["lens_value"], ["reached_sale_share", "cohort_leads", "cohort_reached_sale"],
          [f_eq("lens", "source"), f_eq("mark_days", "60")], preset="all"),
    ]
    # ---- AI operations
    out += [
        V("ai-accuracy-asked", "Questions asked and how they ended", "Questions by day and topic: answered, refused, deflected, errored.",
          "How much the AI is asked, and how often it answers, hands off or declines.",
          "meter_questions", ["q_date"], ["intent"], ["q_asked", "q_answered", "q_refused", "q_deflected", "q_errored", "q_other_n", "q_answer_rate"], preset="last_25"),
        V("ai-accuracy-faithfulness", "Answer faithfulness", "Share of checked answers fully supported by their sources.",
          "Whether answers say what the sources say; unsupported claims are counted, not averaged away.",
          "meter_faithfulness", ["period"], [], ["faith_checked_n", "faith_supported_n", "faith_unfaithful_n", "faith_unverified_n", "faith_excluded_unvalidated_n", "faith_faithfulness_pct"], preset="last_25"),
        V("ai-accuracy-gaps", "Knowledge gaps", "Gaps opened, closed and still open at the end of each month.",
          "The list of questions the AI could not answer well, and whether it is shrinking.",
          "meter_gaps", ["period"], [], ["gap_open_at_end", "gap_opened", "gap_closed", "gap_median_days_to_close"], preset="all"),
        V("ai-accuracy-graded", "Graded answers by topic", "Graded accuracy, routing accuracy and stale-source rate by topic.",
          "Where the AI is strongest and weakest, by topic, from answers a reviewer actually graded.",
          "meter_accuracy", ["intent"], [], ["acc_gradeable_n", "acc_graded_n", "acc_ungraded_n", "acc_right_n", "acc_wrong_source_n", "acc_better_source_n", "acc_wrong_tool_n", "acc_unfaithful_n", "acc_stale_n", "acc_re_verify_n", "acc_graded_accuracy_pct", "acc_routing_accuracy_pct", "acc_stale_pct"], preset="last_25"),
        V("ai-accuracy-latency", "Response speed", "Retrieval and full-answer time by topic against budget.",
          "How long a customer waits, against the budget set for each step.",
          "meter_latency", ["period"], ["intent"], ["lat_n", "lat_retrieval_p50", "lat_retrieval_p95", "lat_complete_p50", "lat_complete_p95", "lat_retrieval_budget_p50", "lat_complete_budget_p50"], preset="last_25"),
        V("ai-accuracy-learning", "Nightly learning runs", "Each night's learning run and whether it improved, held, regressed or rolled back.",
          "The AI changes itself only when a checker agrees; rollbacks show the guardrail working.",
          "meter_learning", ["run_date"], ["outcome"], ["learn_runs", "learn_improve_n", "learn_hold_n", "learn_regress_n", "learn_rollback_n", "learn_labels_checker", "learn_gaps_new", "learn_gaps_closed"], preset="last_25"),
        V("ai-completeness", "Meter completeness", "Requests the servers saw against calls counted, by day and host.",
          "Proof that no AI call went uncounted: every difference is named, and zero is the normal answer.",
          "meter_completeness", ["recon_date"], ["complete"], ["comp_server_requests", "comp_meter_rows", "comp_difference", "comp_tdd_fail_n"], preset="last_25"),
        V("ai-cost-by-lane", "AI calls and tokens by workload", "Calls, tokens and unpriced counts by workload and model.",
          "Which workloads use the most AI and which model tier serves them.",
          "meter_cost", ["lane"], ["model"], ["cost_calls", "cost_prompt_tokens", "cost_output_tokens", "cost_frontier_all_usd", "cost_unnamed_n", "cost_unmapped_n", "cost_unpriced_n"], preset="last_25"),
        V("ai-cost-calls-trend", "AI calls per day by workload", "Daily calls stacked by workload.",
          "How fast AI use is growing and which workloads drive it.",
          "meter_cost", ["call_date", "lane"], [], ["cost_calls"], preset="last_25", presentation="chart",
          chart={"kind": "stacked_bar", "x": "call_date", "y": "cost_calls", "series": "lane"}),
        V("ai-cost-net-savings", "AI cost and net savings", "What the work would have cost at list price, what it did cost and the difference.",
          "What the same AI calls would cost at vendor list price, against what they cost to run locally.",
          "meter_cost", ["call_date"], [], ["cost_frontier_all_usd", "cost_frontier_usd", "cost_actual_usd", "cost_net_usd", "cost_excluded_from_net", "cost_proposed_n"], preset="last_25"),
        V("ai-seat-by-model", "Seat usage by model", "Messages, tokens and list-price equivalent by model.",
          "Which model tier the AI roles lean on, and what that usage would cost per token.",
          "meter_seat_model", ["model"], ["transcript_kind"], ["seatm_messages", "seatm_input_tokens", "seatm_output_tokens", "seatm_cache_write_5m", "seatm_cache_write_1h", "seatm_cache_read", "seatm_api_equiv_usd"], preset="last_25"),
        V("ai-seat-lane", "Seat usage by day", "Messages, usage at list price, flat fee and net, by AI role and day.",
          "Each AI role is on a flat plan; this shows what the same use would cost by the token and what the plan saves.",
          "meter_seat", ["msg_date"], ["seat_id"], ["seat_messages", "seat_session_days", "seat_api_equiv_usd", "seat_fee_usd", "seat_net_usd", "seat_proposed_n", "seat_unpriced_n"], preset="last_25"),
        V("ai-tier-mix", "Model tier mix", "Tokens per day by model tier.",
          "How much work runs on local models against vendor models, day by day.",
          "meter_tier_mix", ["call_date", "model"], [], ["tier_calls", "tier_tokens"], preset="last_25", presentation="chart",
          chart={"kind": "stacked_bar", "x": "call_date", "y": "tier_tokens", "series": "model"}),
        V("ai-workflow-tokens", "Tokens per workflow", "Workflows, calls and tokens by workflow type.",
          "What one run of each workflow costs in tokens, so a runaway workflow is easy to spot.",
          "meter_workflow", ["workflow_type"], ["day_complete"], ["wf_workflows", "wf_calls", "wf_total_tokens", "wf_tokens_per_workflow", "wf_calls_without_counts"], preset="last_25"),
    ]
    # ---- work ledger
    out += [
        V("work-census-tie", "Registered units against runs", "Units on the register against units that ran, by week and class.",
          "Every unit that is supposed to run is counted, and every difference is named.",
          "work_census", ["wcn_window_start", "wcn_window_end", "wcn_unit_class"], [], ["wcn_census_count", "wcn_leaf_run_count", "wcn_difference"], preset="last_25"),
        V("work-matrix-state", "Ledger checks by stage", "Pass and fail counts for each ledger stage and month.",
          "The ledger checks itself at four stages each month; anything other than a pass is held for review.",
          "work_matrix", ["wm_period_start", "wm_stage"], [], ["wm_rows", "wm_fail_n"]),
        V("work-outcomes", "Run outcomes by class", "Runs, successes, failures and unknown ends by unit class.",
          "How reliable each kind of automation is: loops, AI seats, always-on systems and playbooks.",
          "work_runs_daily", ["unit_class"], [], ["work_runs", "work_success_n", "work_failed_n", "work_unknown_end_n"], preset="last_25"),
        V("work-routine-rollup", "Runs by routine", "Runs, successes and failures per routine.",
          "Which routines run most and which fail most.",
          "work_runs_daily", ["routine_id"], [], ["work_runs", "work_success_n", "work_failed_n"], preset="last_25"),
        V("work-runs-by-class-day", "Runs by class and day", "Daily runs, successes and failures by unit class.",
          "The daily heartbeat of the automation program.",
          "work_runs_daily", ["run_day", "unit_class"], [], ["work_runs", "work_success_n", "work_failed_n", "work_unknown_end_n"], preset="last_25"),
        V("work-savings-triple", "Hours saved, valued, against what it cost", "Counterfactual labor value, actual AI cost and the net, by month.",
          "What the same work would have cost done by hand at the set hourly rate, what running it cost, and the difference.",
          "work_savings", ["ws_period_start"], [], ["ws_counterfactual_usd", "ws_actual_usd", "ws_net_usd"], [f_eq("ws_period_type", "month")]),
    ]
    return out


def build_boards(w: World) -> list[dict]:
    def board(bid, name, description, panels, cross=None):
        b = {"id": bid, "name": name, "description": description,
             "panels": [{"viewId": p[0], "layout": {"span": p[1]}} for p in panels], "crossFilter": cross or []}
        b.update(_stamp(w))
        return b

    return [
        board("board-revenue", "Board 1: Revenue", "Gross and net monthly trends, market ranking (click a bar to filter) and the growth decomposition.",
              [("revenue-trend-board", 2), ("revenue-by-market-bar", 2), ("net-trend-board", 2), ("growth-decomposition", 2)],
              [{"fromPanel": 1, "selection": "category", "toPanels": [0, 2]}]),
        board("board-mer", "Board 2: Spend against revenue", "Ad spend share of revenue, the spend split and spend by platform.",
              [("mer-board", 2), ("spend-media-fee-board", 2), ("spend-by-platform", 2)]),
        board("board-efficiency-target", "Board 3: Marketing cost target", "All-in marketing cost against net revenue, by market, checked against the CRM.",
              [("efficiency-tier-by-market", 2), ("efficiency-monthly", 2), ("efficiency-tieout", 2), ("efficiency-daily", 2)]),
        board("board-ai-cost", "Board 4: AI cost", "What the AI workload costs, what it saves and whether every call was counted.",
              [("ai-cost-net-savings", 2), ("ai-seat-lane", 2), ("ai-cost-by-lane", 2), ("ai-cost-calls-trend", 2), ("ai-workflow-tokens", 2),
               ("ai-tier-mix", 2), ("ai-seat-by-model", 2), ("ai-completeness", 2)]),
        board("board-ai-accuracy", "Board 5: AI accuracy", "Questions, graded accuracy, faithfulness, speed, learning and gaps.",
              [("ai-accuracy-asked", 2), ("ai-accuracy-graded", 2), ("ai-accuracy-faithfulness", 2), ("ai-accuracy-latency", 2),
               ("ai-accuracy-learning", 2), ("ai-accuracy-gaps", 2)]),
        board("board-work-ledger", "Board 6: Work ledger", "What the loops, AI seats and playbooks ran, whether it worked and what it saved.",
              [("work-runs-by-class-day", 2), ("work-outcomes", 1), ("work-routine-rollup", 1), ("work-savings-triple", 2), ("work-census-tie", 1),
               ("work-matrix-state", 1)]),
    ]


def _digital_stamp(w):
    return {"origin": "canon", "created_by": "Digital Marketing board build (demo)", "created_at": iso(w.end)}


def build_digital(w: World) -> tuple[dict, dict]:
    st = _digital_stamp(w)
    rebased = lambda scope, label, title, extra="": {
        "id": f"digital-rebased-by-{scope[0]}", "name": "{metric_label} by " + label,
        "description": f"This window against the prior window on the same working days, per {extra or label}.",
        "narrative": f"Each {extra or label}'s " + "{metric_label} for the window beside the prior window on the same count of working days, with the difference.",
        "sourceKey": "dm_windows", "rows": ["scope"], "cols": [], "measures": ["{metric}", "{metric_prior}", "{metric_delta}"],
        "filters": [{"dimKey": "scope_kind", "op": "in", "values": [scope[1]]}, {"dimKey": "win", "op": "in", "values": ["mtd"]}],
        "datePreset": "all", "presentation": "table", **st, "_digital": {"scope_kind": scope[1], "title": title},
    }
    templates = {
        "rebased-by-market": rebased(("market", "market"), "market", "By market"),
        "rebased-by-bucket": rebased(("bucket", "bucket"), "who runs the account", "By who runs the account", "ownership bucket (in-house, agency, offline)"),
        "rebased-by-platform": rebased(("platform", "platform"), "platform", "By platform", "ad platform"),
        "rebased-by-source": rebased(("source", "source"), "source", "By source", "CRM source"),
        "spend-by-owner-and-market": {
            "id": "digital-spend-by-owner-and-market", "name": "Paid and social spend by who runs it, per market",
            "description": "In-house beside agency on the same market and the same days; fees are their own segment of each bar.",
            "narrative": "Each market's bar stacks in-house media, agency media and agency fees for the period, so the in-house result reads against the agency on the same market and the same days.",
            "sourceKey": "dm_spend", "rows": ["market", "segment"], "cols": [], "measures": ["spend"],
            "filters": [{"dimKey": "bucket", "op": "in", "values": ["inhouse", "vendor"]}], "datePreset": "all", "presentation": "chart",
            "chartSpec": {"kind": "stacked_bar", "x": "market", "y": "spend", "series": "segment"}, **st},
        "spend-by-platform-account-campaign": {
            "id": "digital-spend-by-platform-account-campaign", "name": "Spend by platform, account and campaign, with basis and confidence",
            "description": "Media and fee dollars per campaign, with how each dollar was recorded.",
            "narrative": "Every ad dollar for the period, by campaign, with how it was recorded.",
            "sourceKey": "dm_spend", "rows": ["platform", "account", "campaign", "basis", "confidence"], "cols": [],
            "measures": ["media_spend", "fees", "spend"], "filters": [{"dimKey": "bucket", "op": "in", "values": ["inhouse", "vendor"]}],
            "datePreset": "all", "presentation": "table", **st},
        "spend-tools-and-retainers": {
            "id": "digital-spend-tools-and-retainers", "name": "Tools and software",
            "description": "Analytics, CRM and creative tools: counted in marketing cost, kept outside the in-house against agency ad comparison.",
            "narrative": "The third line of marketing cost: tools and software for the period, by line and operator, counted toward the marketing cost target and excluded from the ad split.",
            "sourceKey": "dm_spend", "rows": ["display_name", "operator"], "cols": [], "measures": ["spend"],
            "filters": [{"dimKey": "bucket", "op": "in", "values": ["tools"]}], "datePreset": "all", "presentation": "table", **st},
        "spend-by-month-and-owner": {
            "id": "digital-spend-by-month-and-owner", "name": "Spend by month and who runs it (cross-foot)",
            "description": "In-house, agency, tools, offline and marketing payroll per month, with the total.",
            "narrative": "Each month's spend split by who runs it, with the total column and a check that the parts add up.",
            "sourceKey": "dm_spend", "rows": ["period"], "cols": ["bucket"], "measures": ["spend"], "filters": [], "datePreset": "last_13",
            "presentation": "table", **st},
        "source-chain": {
            "id": "digital-source-chain", "name": "Raw contacts to sale by source, sub-source and market",
            "description": "Leads and sets by lead entry date; issues, demos and sales by appointment date. Spend is the cost mapped to the sub-source and market; where none exists the spend status says why.",
            "narrative": "One row per source, sub-source and market: every lead entered, then sets, issues, demos and sales, the dollars sold and net, the spend that sub-source carried and the cost per raw contact, set, issued appointment and sale on the same line.",
            "sourceKey": "dm_source_chain", "rows": ["source", "subsource", "market", "spend_note"], "cols": [],
            "measures": ["raw_contacts", "sets", "issues", "demos", "sales", "close_rate", "sold", "net", "mapped_spend", "cost_per_raw_contact",
                         "mapped_cost_per_set", "mapped_cost_per_issue", "mapped_cost_per_sale"], "filters": [], "datePreset": "all",
            "presentation": "table", **st},
    }
    return templates, build_rebase_map(w)


def build_rebase_map(w: World) -> dict:
    company = {"scope_kind": "company", "scope": "ALL"}
    plat_g = {"scope_kind": "platform", "scope": "google_ads"}
    plat_m = {"scope_kind": "platform", "scope": "meta"}
    NA = lambda why: f"not applicable to this metric: {why}"
    sum_all = ["company", "market", "platform", "bucket", "source"]

    def entry(wm, kind, fmt, cs, applicable, na, withheld=None):
        return {"windows_metric": wm, "kind": kind, "format": fmt, "company_scope": cs, "applicable_scopes": applicable,
                "not_applicable": na, "withheld_reason": withheld}

    plat_na = NA("CRM counts carry a sub-source, not an ad platform; read the source panel")
    unit_na = {"platform": NA("a lead's platform is known only through its CRM sub-source, so a cost per unit by platform would double-count shared sub-sources; read the source panel")}
    diag_na = {"source": NA("a platform diagnostic has no CRM source detail")}
    m = {
        "spend": entry("spend", "sum", "dollars", company, sum_all, {}),
        "nsli": entry("nsli", "ratio", "dollars", company, ["company", "market"], {
            "platform": NA("revenue per issued appointment is a CRM figure, not a platform figure"),
            "bucket": NA("net issued appointments are not split by who runs the ad account"),
            "source": NA("revenue per issued appointment by source would divide dollars by appointments one source did not alone produce")}),
        "marketing_cost_pct": entry("marketing_cost_pct", "ratio", "pct", company, ["company", "market"], {
            "platform": NA("the cost percent divides every dollar of cost by net revenue, and a platform has spend but no revenue of its own"),
            "bucket": NA("the cost record is by market, not by who runs the account"),
            "source": NA("net revenue is not published per source; read cost per raw contact, set, issue and sale on the source chain")}),
    }
    for k in ("cost_per_lead", "cost_per_set", "cost_per_issue", "cost_per_sale"):
        m[k] = entry(k, "ratio", "dollars", company, ["company", "market", "bucket", "source"], unit_na)
    for k, fmt in (("raw_contacts", "count"), ("sets", "count"), ("issues", "count"), ("demos", "count"), ("sales", "count")):
        m[k] = entry(k, "sum", fmt, company, ["company", "market", "bucket", "source"], {"platform": plat_na})
    m["close_rate"] = entry("close_rate", "ratio", "pct", company, ["company", "market", "bucket", "source"],
                            {"platform": NA("sales and demos carry a sub-source, not an ad platform; read the source panel")})
    for k, fmt, cs in (("ctr", "pct", plat_g), ("cpc", "dollars", plat_g), ("conversion_rate", "pct", plat_g), ("is_lost_budget", "pct", plat_g),
                       ("is_lost_rank", "pct", plat_g), ("cpm", "dollars", plat_m)):
        m[k] = entry(k, "ratio", fmt, cs, ["company", "market", "platform", "bucket"], diag_na)
    m["meta_ctr"] = entry("ctr", "ratio", "pct", plat_m, ["company", "market", "platform", "bucket"], diag_na)
    m["frequency"] = entry("frequency", "ratio", "count", plat_m, ["company", "market", "platform", "bucket"], diag_na)
    m["hook_rate"] = entry("hook_rate", "ratio", "pct", plat_m, ["company", "market", "platform", "bucket"], diag_na)
    m["cost_per_set_d35"] = entry("cost_per_set_d35", "ratio", "dollars", plat_m, ["company", "market", "platform"], {
        "bucket": NA("the day thirty-five set cohort is defined for Meta in-house only, so there is no agency side to compare"),
        "source": NA("the cohort covers the Meta in-house source alone")})
    return {"_what": "For each metric on the Digital Marketing board's picker: which dm_windows metric it reads, which scope the company comparison row reads, which scopes it re-bases to, and the plain-English reason for every scope it does not apply to.",
            "version": 1, "authored_by": "GTM OS demo build", "scopes": ["company", "market", "platform", "bucket", "source"], "metrics": m}


def write_views(w: World) -> list[str]:
    views = build_views(w)
    boards = build_boards(w)
    write_json(OUT_VIEWS / "index.json", [v["id"] for v in views])
    write_json(OUT_VIEWS / "boards-index.json", [b["id"] for b in boards])
    for v in views:
        write_json(OUT_VIEWS / f"{v['id']}.json", v)
    for b in boards:
        write_json(OUT_VIEWS / f"{b['id']}.json", b)
    templates, rmap = build_digital(w)
    write_json(OUT_VIEWS / "digital" / "index.json", list(templates), indent=None)
    write_json(OUT_VIEWS / "digital" / "rebase_map.json", rmap)
    for k, t in templates.items():
        write_json(OUT_VIEWS / "digital" / f"{k}.json", t)
    return [v["id"] for v in views]
