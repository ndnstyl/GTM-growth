---
name: printing-press-polish
description: >
  Polish a generated CLI to pass verification and become publish-ready. Runs
  diagnostics (dogfood, verify, scorecard, go vet, gosec), automatically fixes
  all issues (verify failures, static-analysis findings, dead code,
  descriptions, README, MCP tool quality), reports the before/after delta, and
  offers to publish. Use after any /printing-press run, or on any CLI in
  $PRESS_LIBRARY/. Trigger phrases: "polish", "improve the CLI", "fix verify",
  "make it publish-ready", "clean up the CLI", "get this ready to ship".
context: fork
min-binary-version: "4.0.0"
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Write
  - Edit
  - AskUserQuestion
created_by: user
---

# /printing-press-polish

Polish a generated CLI so it passes verification and is ready to publish.

The retro improves the Printing Press. Polish improves the generated CLI. This skill runs in a forked context (`context: fork`) so its diagnostic and fix loop doesn't pollute the caller, the diagnostic spam, fix iterations, and re-diagnose noise stay scoped to the polish session, and the caller receives a clean summary.

```bash
/printing-press-polish redfin
/printing-press-polish redfin-pp-cli
/printing-press-polish "$PRESS_LIBRARY/redfin"
```

## When to run

After any `/printing-press` generation, especially when:
- The shipcheck verdict is `ship-with-gaps`
- The verify pass rate is below 80%
- The scorecard is below 85
- You want the CLI publish-ready in one pass

Can also be run standalone on any CLI in `$PRESS_LIBRARY/`.

## How this file is organized

This skill runs as **one continuous shell session**, variables set in an
early step (`PRESS_HOME`, `PRINTING_PRESS_BIN`, `CLI_DIR`, `STANDALONE_MODE`,
`SPEC_FLAG`, `RESEARCH_ARGS`, `PII_ARGS`) are read by every later step. The
detail for each stage lives in `references/`; this file is the router and
the sequence. Run the stages in this exact order:

| Order | Stage | Reference file |
|---|---|---|
| 1 | Setup (binary/Go checks) + public-library hint | `references/setup.md` |
| 2 | Resolve CLI (incl. `STANDALONE_MODE`, Phase 3 gate bundle) | `references/resolve-cli.md` |
| 3 | Find spec and research dir | `references/research-dir-resolution.md` |
| 4 | Divergence check (public library vs. internal), **stop before Phase 1 if divergent** | `references/divergence-check.md` |
| 5 | Phase 1: baseline diagnostics | `references/phase1-diagnostics.md` |
| 6 | Phase 2: fix, priorities 0-8 (table below) | see per-priority files |
| 7 | Phase 3: re-diagnose | `references/phase2-mechanical-fixes.md` (appended) |
| 8 | Ship logic (verdict) | `references/ship-logic.md` |
| 9 | Display delta + emit `---POLISH-RESULT---` block | `references/result-block.md` |
| 10 | Publish Offer (standalone only) | `references/publish-offer.md` |

`STANDALONE_MODE` is set once, in stage 2, from caller mode (true for
slash-command invocations or an explicit `--standalone` in `args`; false for
mid-pipeline Skill-tool calls from the main printing-press flow). Stages 5,
6/7, 8, 9, and 10 all read it later to decide whether `publish validate` runs
and whether the Publish Offer fires, each of those reference files carries
its own one-line reminder of what the flag means at the point it's used.

## Fix in priority order (Phase 2)

Update the lock heartbeat (`"$PRINTING_PRESS_BIN" lock update --cli "$CLI_NAME" --phase polish 2>/dev/null`) after each priority level. Cross-cutting fix patterns (runtime-variant defaults, API-call instrumentation, novel-feature data routing) that apply across several priorities live in `references/fix-patterns.md`, read it once before starting Priority 0.

| Priority | Fix | Reference file |
|---|---|---|
| 0 | MCP surface migration (legacy CLIs) | `references/phase2-mechanical-fixes.md` |
| 1 | Security static-analysis failures (gosec) | `references/phase2-mechanical-fixes.md` |
| 2 | Verify failures | `references/phase2-mechanical-fixes.md` |
| 3 | Dead code | `references/phase2-mechanical-fixes.md` |
| 4 | CLI description and metadata | `references/phase2-mechanical-fixes.md` |
| 5 | README | `references/readme-standard.md` |
| 5.5 | SKILL static-check failures (verify-skill) | `references/skill-verify-fixes.md` |
| 6 | Remaining dogfood issues | `references/phase2-mechanical-fixes.md` |
| 7 | MCP tool quality | `references/tools-polish.md` |
| 8 | Customer-PII gate | `references/pii-polish.md` |

**Priority 7, MCP tool quality.** Stop and: run `"$PRINTING_PRESS_BIN" tools-audit "$CLI_DIR" --json`; read `references/tools-polish.md` and follow it to fix mechanical findings AND run the judgment pass over every command, flagged or not, Phase 1's mechanical gates don't catch description quality or borderline read/write classification. Accepting `thin-mcp-description`/`empty-mcp-description` findings requires the three pre-decision fields (`spec_source_material`, `target_description`, `gap_analysis`); bulk accepts are refused. Proceed only when tools-audit reads `no pending findings` with no `incomplete:` block. The findings you fix, skip, or leave open here feed the `fixes_applied`/`skipped_findings`/`remaining_issues` lists, schema in `references/result-block.md`.

**Priority 8, Customer-PII gate.** Stop and: run `"$PRINTING_PRESS_BIN" pii-audit "$CLI_DIR" "${PII_ARGS[@]}"` (or read Phase 1's baseline); read `references/pii-polish.md` and follow its per-finding decision tree, fix real values in source with non-matching placeholders, or accept with `category` + `evidence_context`. Missing fields, 6+ accepts sharing a rationale, or wholesale-accepting ≥10 findings without source fixes all fail the gate. Proceed only when pii-audit reads `no pending findings` with no `incomplete:` block.

After Priority 8, run "After all fixes" (`go build` + `gofmt -w .`) and Phase 3 re-diagnose, both in `references/phase2-mechanical-fixes.md`.

## Ship logic (summary)

Full gate detail and the `## Known Gaps` README requirement are in `references/ship-logic.md`. In brief:

- **`ship`**, verify ≥ 80%, scorecard ≥ 75, no critical failures, and verify-skill/workflow-verify/gosec/tools-audit/pii-audit all clean, and (standalone only) publish-validate passes.
- **`ship-with-gaps`**, verify ≥ 65%, scorecard ≥ 65, the same hard gates satisfied, non-critical gaps remain, and README carries a `## Known Gaps` block naming every user-facing gap.
- **`hold`**, below either floor, any hard gate unresolved, or the Phase 3 gate bundle names a prior sub-60 reprint with missing transcendence rows and no accepted override. Mid-pipeline polish never holds on publish-validate, that check doesn't run there.

Once the floor is cleared, push higher where the gap is real and mechanical (see `references/ship-logic.md` §"Push higher without gaming"); never add scaffolding just to move a number.

## Result block schema

Display the before/after delta table to the user, then emit this block verbatim (fields defined fully, with worked guidance for `further_polish_recommended`, in `references/result-block.md`) so calling skills (e.g. main printing-press SKILL.md Phase 5.5) can parse it:

```
---POLISH-RESULT---
scorecard_before: <N>
scorecard_after: <N>
verify_before: <N>
verify_after: <N>
dogfood_before: <PASS|FAIL>
dogfood_after: <PASS|FAIL>
dogfood_live_matrix_before: <exercised|not_exercised|unknown>
dogfood_live_matrix_after: <exercised|not_exercised|unknown>
govet_before: <N>
govet_after: <N>
gosec_before: <N>
gosec_after: <N>
tools_audit_before: <N pending>
tools_audit_after: <N pending>
publish_validate_before: <PASS|FAIL|skipped (mid-pipeline)>
publish_validate_after: <PASS|FAIL|skipped (mid-pipeline)>
fixes_applied:
- <one-line description of each fix>
skipped_findings:
- <finding>: <why you chose not to fix it>
remaining_issues:
- <one-line description of each issue you tried to fix but couldn't>
ship_recommendation: <ship|ship-with-gaps|hold>
further_polish_recommended: <yes|no>
further_polish_reasoning: <one sentence explaining the call>
---END-POLISH-RESULT---
```

The three lists serve different purposes: **fixes_applied** is what changed (the caller displays these); **skipped_findings** is issues found but deliberately not fixed, with reasoning, for the user to address manually; **remaining_issues** is issues attempted but not resolved. `publish_validate_*` is `skipped (mid-pipeline)`, not a failure, whenever `STANDALONE_MODE=false`.

## Publish Offer

Standalone runs only (`STANDALONE_MODE=true`), mid-pipeline polish returns after the result block. Full menu shapes, the recommendation matrix, and the turn-boundary rule are in `references/publish-offer.md`; the short version: offer **Publish separately** / **Polish again** (suppressed when `further_polish_recommended: no`) / **Done for now** via `AskUserQuestion`, and if the user picks Publish, print the `/printing-press-publish <cli-name> --from-polish` command and stop, do not invoke it in the same turn. Publishing opens or updates a `mvanhorn/printing-press-library` PR, which needs a fresh user-authored message; see `references/publish-turn-boundary.md` for why.

## Rules

- Fix everything. Do not ask for approval before fixing, polish is autonomous.
- Report results honestly. Show what improved and what didn't.
- Do not add new features. Polish fixes quality issues, not feature gaps.
- Do not re-run research or generation. Polish works with the CLI as-is.
- Do not modify the printing-press generator. That's `/printing-press-retro`.
- Do not modify any files outside `$CLI_DIR`.
- If polish adds or renames a Cobra command, the MCP surface updates automatically through the generated `internal/mcp/cobratree` runtime mirror. Update `novel_features` only when README/SKILL highlights or registry display should change; use `cmd.Annotations["mcp:hidden"] = "true"` for debug-only commands.
- Maximum 1 fix-and-rediagnose pass per polish invocation. The "Polish again" path runs additional invocations (max 3 total).
- Prefer mechanical fixes over creative decisions. When a creative decision is needed (like the CLI description), use the research brief from manuscripts if available.
