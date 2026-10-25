## Phase A, Resolve and reconcile presence

Resolve the user's argument the same way `/printing-press-import` does:
fetch the public library `registry.json` once, then exact → normalized →
fuzzy match. The argument can be an API slug (`notion`), a brand name
(`cal.com`), an old `<api>-pp-cli` form, or close enough.

Capture from the matched registry entry: `API_SLUG` (from `.name`) and
`LIB_PATH` (from `.path`, e.g., `library/productivity/cal-com`). Phase B
uses `$LIB_PATH` for the public patches fetch. For the "present | absent"
never-published row, `$LIB_PATH` stays empty, Phase B's fetch
short-circuits on that.

Then check what exists locally and reconcile against the public library by
reading both provenance manifests' `run_id` and `generated_at`:

| Local | Public registry | Action |
|-------|-----------------|--------|
| absent | absent | STOP, nothing to reprint; suggest `/printing-press <api>` for a fresh print |
| absent | present | invoke `/printing-press-import <api>`, then continue |
| present | absent | continue, never-published local CLI; skip import |
| present, same `run_id` | present | continue without import |
| present, public newer `generated_at` | present | offer import via `AskUserQuestion`; user decides |
| present, local newer `generated_at` | present | STOP, local has unpublished work; tell user to publish or discard first |

When invoking `/printing-press-import`, let it own backup, overwrite,
build-verify, and module-path-rewrite. Wait for it to return clean before
continuing.
