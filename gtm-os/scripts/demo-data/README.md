# GTM OS demo data

One seeded generator writes every data file the demo app reads. The company is fictional (Larkspur Home Services, six
fictional markets, two brands). Nothing here is, or is derived from, real data.

## Run it

`$PY` is python 3.12 with pyarrow, numpy and duckdb (the brain repo's `scripts/rag/.venv` interpreter), run from `app/`.

```
$PY scripts/demo-data/generate.py [--end YYYY-MM-DD] [--seed N]
$PY scripts/demo-data/check.py [--determinism]
```

`--end` is the anchor day: the build day, and the last day every daily feed carries (default: today). The same `--seed` and `--end` always write byte-identical files.
The data is anchored to `--end`; the report presets (yesterday, month to date, last 7 days) use the viewer's own date,
the app clock reads the anchor from meta.json, so nothing drifts.

## What it writes

| Path | Contents |
|---|---|
| `public/data/*.json` | cockpit feeds: meta, board, kpi, routines, initiatives, consent_ops, snapshots, content library |
| `public/data/reports/*.parquet` | report feeds, 13 months daily (24 months of monthly history), plus `_manifest`, `_trust`, health, exec and batch-state documents |
| `public/data-views/` | canon views, boards and the Digital Marketing board templates |
| `public/demo/` | stage cards, scripted chat, artifacts ring, run panel, research, studio, QR, recall |

`public/data/compass.json` is not written here: the app's build step makes it from `reports/compass.yaml`.

## How it is built

`world.py` runs one simulation (campaigns by day, then a day by market by source by brand funnel). Every feed is a
roll-up of it, so spend rows sum to the spend feed and the same lead is counted once everywhere. Money is integer cents.
`feeds_*.py` write the parquet, `cockpit.py` and `reportdocs.py` the JSON, `fixtures*.py` the micro-app files and
`views.py` the views. `stats.py` queries the written parquet so every number quoted in prose matches a chart.

## What the check proves

`check.py` reads the real `.ts` files (through `dump_contracts.ts` and `validate_views.ts`), rebuilds the contract views
the way the app does, and runs in DuckDB: every contract column, every workbench and pivot source (each dim, each
measure, the date expression, the drill reconcile), every SQL string the report tabs build, every view and board
through the app's validators, the shell contract's fixture shapes, cross-feed tie-outs, and a brand-string census.
A query that errors, a feed that is missing or a dead measure is a named failure and exit code 1.

## Hand-offs that live in the app code, not here

* `GSC_PRIMARY_SITE` in `lib/reports/sql/organic.sql.ts` names the Search Console site. The generator reads it, so the
  data always carries the site the code filters to; the check fails if the constant is not an `sc-domain:` literal.
* Content library records use `brand_scope` values `universal`, `lh-main`, `lh-pro`, `both-variants` and gate keys
  `RELEASE`, `PREREQ`, `OPSEC`, `SPEC`; `ContentLibrary.tsx` needs a label for each.
* Feed file and column names the code reads (`crm_spine__fact_funnel_daily`, `callfloor_connect_rate_crm_*`, `crm_*` columns
  in the spend and source-chain feeds) are kept because the SQL selects them by name.
