---
name: printing-press-score
description: Score a generated CLI against the Steinberger bar, compare two CLIs side-by-side
version: 0.1.0
min-binary-version: "4.0.0"
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - AskUserQuestion
created_by: user
---

# /printing-press-score

Score generated CLIs against the Steinberger bar. Supports rescoring, scoring by name/path, and comparing two CLIs.

## Quick Start

```
/printing-press-score                              # rescore current CLI
/printing-press-score notion-pp-cli-4              # score by name
/printing-press-score ~/my-cli                     # score by path
/printing-press-score notion-pp-cli-4 vs notion-pp-cli-2  # compare two
```

## Prerequisites

- Go 1.26.6 or newer installed
- `cli-printing-press` binary on PATH (install with `go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@latest`)

## Step 0: Setup (run first, always)

Before any other step, run the setup contract in `references/setup-contract.sh` via the Bash tool to verify the `cli-printing-press` binary is on PATH and to initialize the scope variables (`PRESS_RUNSTATE`, `PRESS_LIBRARY`, `PRESS_MANUSCRIPTS`, `PRESS_CURRENT`) used by every later step.

After running it, capture the `PRINTING_PRESS_BIN=<abs-path>` line from stdout. **Every subsequent `cli-printing-press ...` invocation in this skill must use that absolute path** (substitute the value, not the literal `$PRINTING_PRESS_BIN` token), `export PATH` in the script only affects the single Bash tool call it runs in, so later calls open a fresh shell where bare `cli-printing-press` resolves against the user's default `PATH` and a stale global can shadow the local build.

After capturing the binary path, check binary version compatibility. Read the `min-binary-version` field from this skill's YAML frontmatter above. Run `<PRINTING_PRESS_BIN> version --json` and parse the version from the output. Compare it to `min-binary-version` using semver rules. If the installed binary is older than the minimum, stop immediately and tell the user: "cli-printing-press binary vX.Y.Z is older than the minimum required vA.B.C. Run `go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@latest` to update."

Current-run state is resolved from `$PRESS_RUNSTATE`. Published CLIs are resolved from `$PRESS_LIBRARY`. Archived manuscripts are resolved from `$PRESS_MANUSCRIPTS`.

## Step Router

| Step | File | Purpose |
|------|------|---------|
| 0. Setup | `references/setup-contract.sh` | Resolve binary path, verify version, init scope vars, run first |
| 1. Argument Parsing | `references/01-argument-parsing.md` | Strip noise words, count tokens, pick mode (rescore / single / compare) |
| 2. CLI Resolution | `references/02-cli-resolution.md` | Resolve name/path tokens to directories, 6 strategies, run in precedence order |
| 3. Spec Discovery | `references/03-spec-discovery.md` | Find the OpenAPI spec for Tier 2 scoring, or proceed without it |
| 4. Scorecard Runner | `references/04-scorecard-runner.md` | Run `scorecard` (single, or both CLIs in parallel for compare mode) |
| 5. Output Renderer | `references/05-output-renderer.md` | Render the single-score table or the side-by-side compare table |
| 6. Error Handling | `references/06-error-handling.md` | The 4 failure cases and what to tell the user |

Work through the steps in order: 0 always first, then 1 → 2 → 3 → 4 → 5, consulting step 6 whenever a failure case is hit.
