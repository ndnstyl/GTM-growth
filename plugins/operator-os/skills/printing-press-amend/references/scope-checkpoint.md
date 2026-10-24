# Phase 3, Scope Confirmation Checkpoint (User-in-Loop #1) for `/printing-press-amend`

This reference is loaded after Phase 2's guards run and before Phase 4's autonomous execution. This is the first of two user checkpoints. Everything until now has been read-only discovery; this checkpoint commits scope.

**Cross-cutting thread:** `scope_tier` is set here and read downstream by Phase 6 (PR title prefix, priority label), see `pr-draft-checkpoint.md`.

## Tier the surviving findings

Group findings into three tiers:

- **Tier 1, Bugs**, every finding with `classification: bug`. CLI behavior is wrong; fixes restore correctness.
- **Tier 2, Missing features that solve immediate session pain**, `classification: feature` findings tied to a hand-rolled workaround the user actually built during the session (i.e. the user clearly needed it now, not theoretically).
- **Tier 3, Polish / architecture**, remaining `classification: feature` findings that are nice-to-have or architectural improvements without an immediate workaround in the session.

Display the tiered list inline before the question:

```
Friction found for <slug>-pp-cli (12 signals, 2 suppressed as duplicates):

Tier 1, Bugs (4)
  F1  drafts list returns 400 silently
  F4  messages query returns data: null
  F7  refresh-token expiry not surfaced in errors
  F11 ai --query returns code 500

Tier 2, Missing features that solve session pain (4)
  F2  no `drafts new` command (user hand-rolled writeMessage payload)
  F5  no `--type sent` for threads list (user worked around with messages query)
  F8  no `--remind-in <duration>` flag for send (user manually re-flagged drafts)
  F10 no `bootstrap` to local SQLite (user did 50+ thread API calls)

Tier 3, Polish / architecture (2)
  F12 `auth status` doesn't link to `auth login` when refresh expired
  F13 doctor doesn't surface stale-binary warning vs. published version
```

## Pick scope via AskUserQuestion

```
Which scope should this patch cover?
  1. Bugs only (Tier 1), 4 findings
  2. Bugs + immediate features (Tier 1 + Tier 2), 8 findings
  3. All tiers (Tier 1 + Tier 2 + Tier 3), 10 findings
  4. Custom selection, pick individual findings
```

The `AskUserQuestion` options must be self-contained (each label must convey what it does without relying on description text, some harnesses hide the description).

For the **custom selection** path: present a multi-select with each finding's id + category + one-line rationale; confirm the user-checked subset before proceeding.

## Persist the excluded findings

For every finding NOT in the confirmed scope, append to a deferred-list markdown file at:

```
$PRESS_MANUSCRIPTS/<api-slug>/<run-id>/proofs/<timestamp>-amend-<cli-name>-deferred.md
```

The `<run-id>` is a fresh timestamped id for this amend run (e.g. `amend-2026-05-15T1432`). Format the deferred file as a YAML preamble + a finding-per-section markdown body so a future `/printing-press-amend` run on the same CLI can re-surface the items.

```yaml
---
date: 2026-05-15
target_cli: superhuman-pp-cli
amend_run_id: amend-2026-05-15T1432
deferred_count: 2
---
```

Then one section per deferred finding with: id, category, classification, rationale, evidence, reason-deferred (e.g. "user picked Tier 1 only"), and `still_relevant: unknown`.

On a subsequent `/printing-press-amend` run, Phase 3 should look in `$PRESS_MANUSCRIPTS/<api-slug>/` for the most-recent `*-deferred.md` and offer the user the option to include any items still relevant in this run's scope. (Implementation note: this re-surfacing logic ships in v0.1; do not silently re-add, always present and confirm.)

## Edge case: nothing to do

If Phase 2 suppressed every finding (everything was a duplicate), Phase 3 reports cleanly and exits without opening the menu:

> "All findings from this session were addressed by existing PRs. No novel patches found."

## Output

Phase 3 emits to Phase 4:

```yaml
published_status: published
scope_tier: bugs+features            # or bugs|all|custom
findings_active: [...]               # the user-confirmed subset
findings_deferred_path: <path>       # where the deferred file landed
```
