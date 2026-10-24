# api_governor: one gate in front of every vendor API

A vendor API has a documented limit and a bill. This governor gives every vendor a budget per window, a minimum spacing, a per-run cap and a shared cooldown, and refuses loudly when a call would break one. It ships with an EMPTY registry: add your vendors.

## Use

1. Add a row to `registry.json` per vendor. Start in `"mode": "observe"`: it counts and records but never refuses.
2. Route every call through `Governor().acquire("vendor", lane="what-is-calling", run_id=...)`. After a 429 or quota error call `report_limit_hit("vendor", retry_after_s)` so every other process backs off too.
3. After a few days, read `.operator/api_governor/incidents.jsonl` and the counters (`python3 governor.py`), set `ceiling` below the vendor's documented limit, fill `source_url` and `checked`, and flip to `"enforce"`.
4. An unregistered vendor is refused in enforce mode. That is the point: no registry row, no call.

## Row fields

| Field | Meaning |
|---|---|
| `mode` | `observe` or `enforce` |
| `limit_window` | `daily`, `hourly` or `monthly`; `reset_tz` sets the zone the vendor resets in |
| `ceiling` | the budget per window you ratified (required to enforce) |
| `documented_limit`, `source_url`, `checked` | where the vendor documents its limit and when you read it (required to enforce) |
| `min_spacing_s` | minimum seconds between calls |
| `max_per_run` | cap for one run id |

## Rule that goes with it

A feature that fires a vendor call per user action (page load, click, filter) needs a named registry row and a ratified ceiling before it ships. Viewer surfaces read centrally rendered artifacts, never vendors.

## Test

`python3 -m unittest -v test_governor` from this folder.
