---
name: printing-press-amend
description: >
  Amend a published CLI from one of two input sources: (1) dogfood mode mines
  the active Claude Code session transcript for friction (missing flags, hand-
  rolled API payloads, silent-null returns); (2) direct-input mode accepts
  user-supplied asks (rename a command, add commands or feeds, fix a named bug,
  optionally sniff the source site for new endpoints). Confirms scope with the
  user, plans + executes the fix autonomously, scrubs PII, and opens a PR
  against mvanhorn/printing-press-library. Two user-in-loop checkpoints: scope
  after capture, PR draft before open.
  Trigger phrases: "amend the CLI", "submit a patch", "fix what I just
  dogfooded", "open a PR for this CLI", "patch this CLI", "add features to my
  CLI", "rename this command", "add these feeds to <cli>", "sniff for new APIs
  in <cli>", "amend with these ideas", "use printing-press-amend",
  "run printing-press-amend".
version: 0.2.0
min-binary-version: "4.0.0"
context: fork
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

# /printing-press-amend

Turn a dogfood session into a PR for a printed CLI in the public library.

```bash
/printing-press-amend                 # auto-detect target CLI from session
/printing-press-amend superhuman      # explicit short name
/printing-press-amend superhuman-pp-cli
/printing-press-amend "$PRESS_LIBRARY/superhuman"
```

This skill lives in this repo (the machine) and acts on a printed CLI in the public library. It is sibling to `/printing-press-publish` (adds a new CLI), `/printing-press-polish` (improves a CLI pre-publish), and `/printing-press-retro` (reflects on the machine itself). None of those cover post-publish CLI amendments driven by real-session friction.

The artifact this skill produces is semantically a "patch" (in the git/PR sense), tracked by the public library's `.printing-press-patches/` directory (one file per patch). Inline `// PATCH(...)` source comments are optional navigation aids when they make a customized site easier to grep. The slash-skill name is `amend` to disambiguate from the existing `cli-printing-press patch` binary subcommand (which AST-injects pre-defined features, different mechanism, different intent).

## Setup, run this before anything else

Read `references/setup-contract.md` and run its bash preflight now, in full, before starting Phase 0. It resolves the `cli-printing-press` binary to an absolute path, checks the Go toolchain, computes this run's scoped workspace paths (`PRESS_HOME`, `PRESS_RUNSTATE`, `PRESS_LIBRARY`, `PRESS_MANUSCRIPTS`), and gates on the published currency floor. This is not an optional link, every phase below depends on state it creates.

Capture `PRINTING_PRESS_BIN=<abs-path>` from its output and substitute that literal path into every later `cli-printing-press ...` invocation in this skill (Phases 2, 4, 7), a fresh Bash call cannot see the `export PATH` the setup script ran under.

## Cross-cutting state

Four variables are threaded across phase boundaries. Each is set once and read by name in every downstream reference file, check these first if a phase's behavior looks wrong:

- **`PRINTING_PRESS_BIN`**, captured in Setup. Reused verbatim in Phase 2 (`gh`/stale-binary check), Phase 4 (`publish validate`), and Phase 7 (PR plumbing).
- **`MODE`** (`dogfood` \| `direct` \| `both`), set in Phase 0. Reshapes which Phase 1 sub-section runs, Phase 4's `dogfood_status` output field, and Phase 8's final RESULT block.
- **`published_status`** (`published` \| `local-only`), set during Phase 1 (in `references/transcript-parsing.md` / `references/direct-input-parsing.md`). Read by Phase 2b's stale-binary check and by Phase 4 Step 1's managed-clone routing.
- **`scope_tier`** (`bugs` \| `bugs+features` \| `all` \| `custom`), set at the Phase 3 checkpoint. Read by Phase 6 to pick the PR title prefix (`fix(...)` vs `feat(...)`) and the `priority:P*` label.

A fifth thread runs through the artifacts rather than a variable: Phase 4's patch-file JSON (`$CLI_DIR/.printing-press-patches/<id>.json`) is the same file Phase 6's PR-body "Evidence" section links to at the PR's HEAD SHA, keep the two in sync if the schema ever changes.

## Phases

Run in this order. Phases marked "inline" are short enough to stay here; everything else is a `references/` file loaded at that point.

| Phase | What it does | Where |
|---|---|---|
| 0, Input Mode Detection | Classify the invocation into `MODE=dogfood\|direct\|both` from the slash-command prompt; ask if ambiguous. | `references/mode-detection.md` |
| 1, Capture | Produce the typed finding list (`id`, `kind`, `category`, `classification`, `evidence`, `target_cli`, `rationale`, `provenance`) that every later phase consumes verbatim. See dispatcher below (inline). | inline dispatcher + `references/transcript-parsing.md`, `references/direct-input-parsing.md`, `references/sniff-subroutine.md` |
| 2, Pre-Checkpoint Guards | Suppress findings that duplicate an open/merged library PR; abort if the dogfooded binary is stale vs. published. | `references/pre-checkpoint-guards.md` |
| 3, Scope Checkpoint (User-in-Loop #1) | Tier findings (bugs / immediate-pain features / polish), let the user pick scope, persist deferred findings. | `references/scope-checkpoint.md` |
| 4, Plan + Execute + Validate | Autonomous: set up the managed clone, write the plan doc, edit code + write patch JSON, run `publish validate` with up to 3 retry iterations, check the patch manifest and doc-update checkpoint. | `references/plan-execute-validate.md` |
| 5, PII Scrub | Three-layer scrub (credentials, stop-listed entities, first-mention defense) on staging copies of everything that will leave the machine. See pointer below (inline). | inline pointer + `references/pii-scrubbing.md` |
| 6, PR Draft Checkpoint (User-in-Loop #2) | Assemble title/body/labels/diff, show the full draft, let the user open / edit / hold / abort. | `references/pr-draft-checkpoint.md` |
| 7, PR Open | Autonomous: commit, link/open the upstream issue, push, `gh pr create`, apply labels. See pointer below (inline). | inline pointer + `references/library-pr-plumbing.md` |
| 8, Output | Emit the `---PATCH-RESULT---` block; this skill's own self-verification command. | `references/output-schema.md` |

### Phase 1 dispatcher (inline)

When `MODE=dogfood`, run only dogfood capture. When `MODE=direct`, run only direct-input capture. When `MODE=both`, run dogfood first, then direct-input, and merge the two finding lists with non-colliding IDs (direct-input continues numbering where dogfood left off).

- **Dogfood mode**, read `references/transcript-parsing.md`. Resolves the active session transcript, walks it for friction signals, classifies each as bug/feature, auto-detects the target CLI, and resolves `published_status`. Findings carry `provenance: transcript`.
- **Direct-input mode**, read `references/direct-input-parsing.md`. Reads the slash-command prompt's verbatim asks, resolves the target CLI, and parses each ask into a typed finding (`rename`, `add-command`, `add-feed`, `add-endpoint`, `fix-bug`, `sniff`). Findings carry `provenance: user-ask`. A `kind: sniff` ask routes to `references/sniff-subroutine.md` (opt-in, never invoked unless the user named it), which appends `provenance: sniff` findings.

### Phase 5 pointer (inline)

Read `references/pii-scrubbing.md` for the full procedure. Runs on temp staging copies only, never the user's original session transcript or the in-progress managed-clone source. Targets, in priority order: PR title/body draft, per-run plan doc, deferred-findings list, any new test fixtures. A defense-in-depth pass also walks every `*.go` file in `$CLI_DIR` for stop-list matches and blocks Phase 6 if any are found.

### Phase 7 pointer (inline)

If the user picked open or edit-then-open at Phase 6, run `references/library-pr-plumbing.md` Steps 5-7: commit inside `$CLI_DIR` with the findings list, link or open a matching upstream issue, then push and `gh pr create` (fork-vs-push access mode and branch-collision handling are documented there, do not inline those patterns here). After the PR opens, surface the URL and the Greptile inline-review note to the user.

## Verification of this skill itself

```bash
<PRINTING_PRESS_BIN> verify-internal-skill --dir skills/printing-press-amend
```

Full detail (the setup-contract parity Go test, etc.) is in `references/output-schema.md`.
