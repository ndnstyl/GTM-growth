---
name: printing-press-publish
description: Publish a generated CLI to the printing-press-library repo
version: 0.1.0
min-binary-version: "4.0.0"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
created_by: user
---

# /printing-press publish

Publish a generated CLI from your local library to the [printing-press-library](https://github.com/mvanhorn/printing-press-library) repo as a pull request.

```bash
/printing-press publish notion-pp-cli
/printing-press publish notion
/printing-press publish notion --from-polish
/printing-press publish notion --skip-live-test=auth-unavailable
/printing-press publish notion --blocked-api-journal notion
/printing-press publish
```

## PR shape guard

This skill opens only a generated CLI publish PR or, with
`--blocked-api-journal`, a `blocked-apis.json` journal PR. It never opens a
docs-only, plan, proposal, or spec PR as a substitute for a CLI that is not
ready to publish. If generation, validation, or live testing is blocked, report
the exact blocker and stop.

## Direct User Invocation Required

Publishing can fork `mvanhorn/printing-press-library`, push a branch, and open or
update a PR. Before setup or validation, check the invocation context. If this
skill was invoked as a chained continuation from `printing-press-polish`'s
Publish Offer, including an `AskUserQuestion` answer or auto-resolved polish
recommendation, stop immediately and tell the user to send
`/printing-press-publish <cli-name> --from-polish` in a fresh message. A fresh
user-authored request that explicitly asks to publish is sufficient; do not add
another confirmation prompt on top of a direct publish request.

If the fresh user-authored request includes `--from-polish`, record
`POLISH_HANDOFF=true` for the terminal-state step and ignore that marker when
resolving the CLI name. The marker is not a second confirmation and is not
passed to `cli-printing-press`; it only preserves standalone polish's old
post-publish retro offer after the fresh-turn publish completes.

If the request includes `--blocked-api-journal`, enter **Blocked API Journal
Mode** below instead of the normal printed-CLI publish flow. This mode may be
invoked from `/printing-press`'s hold-path menu after the user explicitly chose
"Add to blocked-API journal"; that parent menu choice is sufficient user
authorization for the public-library journal write. Do not require a second
fresh-turn invocation for this journal-only mode.

If the fresh user-authored request includes `--skip-live-test=<reason>`, record
the exact non-empty reason as `SKIP_LIVE_TEST_REASON` and remove the flag before
resolving the CLI name. This is the only supported escape valve for the
publish-time live test gate. Use it only for auth-unavailable, known upstream
outage, LAN-unreachable hardware APIs, or similarly concrete operator-approved
cases; never infer a skip from ordinary latency or from the presence of an
older Phase 5 marker.

## Step 3.5, Greptile review contract

Every PR into the public library gets an automated Greptile review plus a
policy-gate CI job. Read the contract once, before opening the PR, from
[`references/greptile-review-loop.md`](references/greptile-review-loop.md), the same file Step 8's "drive to stable green" loop uses after the PR opens.

## Routing table

Work through these in order. Each file is self-contained for its step(s); the
state variables below are what carries across the boundaries.

| Step(s) | Job | File |
|---|---|---|
|, | `--blocked-api-journal` mode (skips the rest of this table) | [`references/blocked-api-journal.md`](references/blocked-api-journal.md) |
| Setup + Config | Resolve `$PRINTING_PRESS_BIN`; establish `$PRESS_HOME`/`$PRESS_LIBRARY`/`$PRESS_MANUSCRIPTS`, `$PUBLISH_REPO_DIR`, `$PUBLISH_CONFIG`; scoped clone cleanup | [`references/setup-and-config.md`](references/setup-and-config.md) |
| 1-4 | Prerequisites (`gh auth status`); resolve `$API_SLUG`; determine category; `publish validate` | [`references/resolve-validate.md`](references/resolve-validate.md) |
| 3.5 | Greptile review contract (see above, read before opening the PR) | [`references/greptile-review-loop.md`](references/greptile-review-loop.md) |
| 4.5 | Live end-to-end gate; writes the Phase 5 acceptance/skip marker that Step 6 checks | [`references/live-gate.md`](references/live-gate.md) |
| 5 | Managed clone lifecycle (first-time setup, refresh, recovery); pre-package collision snapshot | [`references/managed-clone.md`](references/managed-clone.md) |
| 6 | `publish package`; copy staged CLI into `$PUBLISH_REPO_DIR`; build + govulncheck verification | [`references/package.md`](references/package.md) |
| 6.5-6.6 | Validate `.printing-press-patches/`; record contributor attribution | [`references/customizations-attribution.md`](references/customizations-attribution.md) |
| 7 | Collision detection & resolution against merged CLIs and open PRs | [`references/collision-resolution.md`](references/collision-resolution.md) |
| 8 | Branch, commit, push, create/update PR | [`references/branch-commit-pr.md`](references/branch-commit-pr.md) |
| 8 | PR description template | [`templates/pr-description.md`](templates/pr-description.md) |
|, | Secret & PII protection, run before the PR is created | [`references/secret-pii-protection.md`](references/secret-pii-protection.md) |
| After Step 8 | Drive the PR to stable green; terminal state and hand-back | [`references/greptile-review-loop.md`](references/greptile-review-loop.md) |
|, | Error handling for any step above | [`references/error-handling.md`](references/error-handling.md) |
|, | Generated-artifacts ownership policy (`registry.json`, `cli-skills/pp-*`, release ledger, never hand-edited) | [`references/generated-artifacts-policy.md`](references/generated-artifacts-policy.md) |

## Shared state, threaded end to end

- **`PRINTING_PRESS_BIN`**, absolute path to the binary, resolved in Setup. Every later `cli-printing-press` invocation must substitute this value (a bare `cli-printing-press` in a fresh shell can resolve to a stale global).
- **`PUBLISH_REPO_DIR`**, the skill-managed clone of the library, created in Setup/Config and populated in Step 5. Steps 6-8 all operate inside it.
- **`API_SLUG`**, resolved in Step 2; the canonical key for branch names, registry entries, collision detection, and path construction through every later step.
- **`PREEXISTING_MERGED_COLLISION` / `PREEXISTING_MERGED_PATHS`**, the pre-package snapshot Step 5 takes of the managed clone, before Step 6 overwrites `library/*/<api-slug>`. Step 7's collision detection reads these, not a fresh `ls`.
- **`EXISTING_PR_NUMBER`**, set by Step 7's collision resolution when an open PR of the user's already exists. Step 8 branches its create-vs-update logic on whether this is set.
- **`SKIP_LIVE_TEST_REASON`**, set from `--skip-live-test=<reason>` above. Step 4.5 checks it before deciding whether to run live dogfood or write a skip marker instead.
- **`POLISH_HANDOFF`**, set from `--from-polish` above. Consumed only at Step 8's terminal-state hand-back, to decide whether to offer the retro follow-up.
