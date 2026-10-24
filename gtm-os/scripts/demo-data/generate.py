#!/usr/bin/env python3
"""GTM OS demo data generator (Northbeam Home Services, fictional, synthetic).

Writes every data file the app reads:
  public/data/*.json                cockpit feeds
  public/data/reports/*.parquet     report feeds (+ _manifest, _trust, _health, _feed_health, _job_health, spine_*.json)
  public/data-views/                canon views and boards
  public/demo/                      micro-app fixtures (chat, ring, run panel, research, studio, qr, recall)

Deterministic: the same --seed and --end always produce byte-identical files. Nothing reads the clock except the
default for --end (yesterday); pass --end to pin it.

Run (from app/, $PY = python 3.12 with pyarrow, numpy and duckdb):  $PY scripts/demo-data/generate.py [--end YYYY-MM-DD] [--seed N]
Then: $PY scripts/demo-data/check.py
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cockpit  # noqa: E402
import feeds_ai  # noqa: E402
import feeds_core  # noqa: E402
import feeds_lens  # noqa: E402
import feeds_money  # noqa: E402
import feeds_web  # noqa: E402
import fixtures  # noqa: E402
import reportdocs  # noqa: E402
import views  # noqa: E402
from common import OUT_DATA, OUT_DEMO, OUT_REPORTS, OUT_VIEWS, add_months, clean_dir_files, first_of_month  # noqa: E402
from feedio import FeedWriter  # noqa: E402
from world import simulate  # noqa: E402

log = logging.getLogger("demo-data")
DEFAULT_SEED = 20261024


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--end", help="the anchor day: the build day and the last day every daily feed carries, YYYY-MM-DD (default: today)")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    end = date.fromisoformat(args.end) if args.end else date.today()
    pub_start = add_months(first_of_month(end), -12)  # twelve full months plus the current month to date
    sim_start = add_months(first_of_month(end), -24)  # one more year behind it, for year-over-year and the trailing twelve months
    log.info("end=%s published window=%s..%s history from %s seed=%d", end, pub_start, end, sim_start, args.seed)
    t0 = time.time()

    for d, suf in ((OUT_REPORTS, (".parquet", ".json")), (OUT_VIEWS, (".json",)), (OUT_DEMO, (".json", ".svg", ".mp4"))):
        clean_dir_files(d, suf)
    # only the top-level feeds this generator writes: public/data/compass.json is built by the app's own build step and is not ours
    ours = [OUT_DATA / f"{n}.json" for n in ("meta", "board", "kpi", "routines", "initiatives", "consent_ops")]
    for f in ours + sorted((OUT_DATA / "snapshots").glob("*.json")) + sorted((OUT_DATA / "content").glob("*.json")):
        if f.exists():
            f.unlink()

    wf = simulate(args.seed, sim_start, end)
    w = wf.slice_from(pub_start)
    mof = feeds_money.Money(wf)
    mo = feeds_money.Money(w)
    log.info("simulated %d days (%d published) in %.1fs; ticket scale %.3f", wf.D, w.D, time.time() - t0, wf.ticket_scale)

    fw = FeedWriter()
    asof = feeds_money.asof_str(w)
    from datetime import datetime
    asof_ts = datetime.fromisoformat(asof)

    feeds_core.write_dims(fw, w, asof_ts)
    feeds_core.write_spend(fw, w, asof_ts)
    feeds_core.write_allocation(fw, w, asof_ts)
    feeds_core.write_geo(fw, w, asof_ts)
    feeds_core.write_conversion_actions(fw, w, asof_ts)
    zips, classes = feeds_core.build_zips(w.seed)
    feeds_core.write_zips(fw, zips, asof_ts)
    feeds_core.write_lead_zip(fw, w, classes, asof_ts)
    feeds_core.write_funnel(fw, w, asof_ts)
    log.info("core contract feeds done (%.1fs)", time.time() - t0)

    feeds_web.write_ga4(fw, w)
    feeds_web.write_gsc(fw, w)
    callfloor = feeds_web.write_callfloor(fw, w)

    golden = feeds_money.write_golden(fw, wf, mof, w, mo)
    feeds_money.write_dm_spend(fw, w)
    feeds_money.write_dm_chain(fw, w)
    feeds_money.write_dm_misc(fw, w, mo, golden)
    feeds_money.write_dm_windows(fw, w, golden)
    feeds_money.write_dm_pacing(fw, w, mo)
    feeds_money.write_dm_diag(fw, w)
    spine = feeds_money.write_spine(fw, wf, mof)
    feeds_lens.write_lens(fw, wf, w)
    meter = feeds_ai.write_meter(fw, w)
    acc = feeds_ai.write_accuracy(fw, w)
    feeds_ai.write_work(fw, w)
    log.info("report feeds done (%.1fs)", time.time() - t0)

    fw.write_manifest(end)
    head = cockpit.Headline(w, mo)
    cockpit.write_meta(w)
    cockpit.write_kpi(w, mo, head)
    cockpit.write_board(w)
    cockpit.write_routines(w)
    cockpit.write_initiatives(w)
    cockpit.write_consent(w)
    from stats import Stats
    S = Stats(end)
    cockpit.write_snapshots(w, mo, head, S)
    reportdocs.write_library(w)
    reportdocs.write_trust(w, fw)
    reportdocs.write_health(w, fw)
    reportdocs.write_job_health(w)
    reportdocs.write_spine_docs(w, wf, mof, fw, spine)

    views.write_views(w)
    fixtures.write_fixtures(w, S)

    n_parquet = len(fw.files)
    total = sum(f.stat().st_size for f in (OUT_DATA).rglob("*") if f.is_file()) + sum(
        f.stat().st_size for f in OUT_VIEWS.rglob("*") if f.is_file()) + sum(f.stat().st_size for f in OUT_DEMO.rglob("*") if f.is_file())
    n_files = sum(1 for f in OUT_DATA.rglob("*") if f.is_file()) + sum(1 for f in OUT_VIEWS.rglob("*") if f.is_file()) + sum(
        1 for f in OUT_DEMO.rglob("*") if f.is_file())
    log.info("wrote %d files (%d parquet), %.1f MB, in %.1fs", n_files, n_parquet, total / 1e6, time.time() - t0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
