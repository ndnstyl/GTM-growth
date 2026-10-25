# Phase 1: Baseline Diagnostics

<!-- contents:start -->
## Contents

- [Phase 1: Baseline diagnostics](#phase-1-baseline-diagnostics)
  - [Phase 4.85, Agentic output review (Wave B)](#phase-485--agentic-output-review-wave-b)
<!-- contents:end -->

> **STANDALONE_MODE** reminder: true only for slash-command invocations or an explicit `--standalone` Skill-tool call; false for mid-pipeline polish invoked from the main printing-press flow. It gates whether `publish validate` runs in this phase.

## Phase 1: Baseline diagnostics

```bash
cd "$CLI_DIR"

# Build
go build -o "$CLI_NAME" ./cmd/"$CLI_NAME" 2>&1

# Diagnostics. SPEC_FLAG and RESEARCH_ARGS are set in the "Find spec
# and research dir" step above. RESEARCH_ARGS enables dogfood to
# verify novel features and sync them into .printing-press.json
# (required for publish-validate's transcendence gate).
"$PRINTING_PRESS_BIN" dogfood --dir "$CLI_DIR" $SPEC_FLAG "${RESEARCH_ARGS[@]}" 2>&1
"$PRINTING_PRESS_BIN" verify --dir "$CLI_DIR" $SPEC_FLAG --json 2>&1
"$PRINTING_PRESS_BIN" workflow-verify --dir "$CLI_DIR" --json > /tmp/polish-workflow-verify.json 2>&1 || true
"$PRINTING_PRESS_BIN" verify-skill --dir "$CLI_DIR" --json > /tmp/polish-verify-skill.json 2>&1 || true
# publish-validate is a publish-readiness gate, not a CLI-readiness gate.
# Mid-pipeline polish runs before the main SKILL's promote step and before
# the publish skill packages tools-manifest.json, so its prerequisites
# (manifest.printer from git config github.user, packaged tools manifest,
# phase5 acceptance proof relocated under $CLI_DIR/.manuscripts/<run>/proofs/)
# are not yet satisfied. Running publish-validate here would cascade
# parent-pipeline-owned failures into the polish ship_recommendation,
# which the main SKILL's Phase 5.5 verdict-override then turns into a
# CLI-level hold. Only run publish-validate when polish is the publish
# entry point (slash-command invocation or explicit --standalone).
if [ "$STANDALONE_MODE" = "true" ]; then
  "$PRINTING_PRESS_BIN" publish validate --dir "$CLI_DIR" --json > /tmp/polish-publish-validate.json 2>&1 || true
fi
# --live-check samples novel-feature outputs and populates
# live_check.features[].warnings (Wave B entity detection), required for
# the "Output entity warnings" row below to have data to read.
# RESEARCH_ARGS points scorecard at the run's research.json when the
# CLI lives under $PRESS_RUNSTATE/runs/<id>/working/<cli> (mid-pipeline
# polish). Without it, scorecard looks adjacent to the binary, doesn't
# find research.json, and reports `unable: true`.
"$PRINTING_PRESS_BIN" scorecard --dir "$CLI_DIR" $SPEC_FLAG "${RESEARCH_ARGS[@]}" --live-check --json > /tmp/polish-scorecard.json 2>&1 || true
"$PRINTING_PRESS_BIN" scorecard --dir "$CLI_DIR" $SPEC_FLAG 2>&1
"$PRINTING_PRESS_BIN" tools-audit "$CLI_DIR" --json > /tmp/polish-tools-audit-before.json 2>&1 || true
"$PRINTING_PRESS_BIN" pii-audit "$CLI_DIR" "${PII_ARGS[@]}" --json > /tmp/polish-pii-audit-before.json 2>&1 || true
go vet ./... 2>&1
if command -v gosec >/dev/null 2>&1; then
  gosec -fmt=json -out=/tmp/polish-gosec-before.json ./... 2>&1 || true
else
  go run github.com/securego/gosec/v2/cmd/gosec@v2.26.1 -fmt=json -out=/tmp/polish-gosec-before.json ./... 2>&1 || true
fi
```

verify-skill and workflow-verify run alongside dogfood/verify/scorecard so polish catches the same class of failures the public-library CI catches. `publish-validate` runs only when `STANDALONE_MODE=true` (slash-command or `--standalone` Skill-tool invocation). The publish-validate leg is a hard ship-gate **for standalone polish**: in that mode polish cannot recommend `ship` or `ship-with-gaps` while `"$PRINTING_PRESS_BIN" publish validate` reports `passed: false`. Mid-pipeline polish (`STANDALONE_MODE=false`) skips publish-validate entirely, its prerequisites (manifest.printer from `git config github.user`, packaged `tools-manifest.json`, phase5 acceptance proof relocated under `$CLI_DIR/.manuscripts/<run>/proofs/`) are parent-pipeline-owned and not yet satisfied at this point; the main SKILL's Phase 6 publish flow gates on publish-validate at the correct time. See `references/ship-logic.md` for how this affects ship_recommendation.

**Live matrix qualifier.** After each `scorecard --live-check --json` run, read `/tmp/polish-scorecard.json` and record whether `live_check` actually exercised live samples. Treat it as `exercised` only when `live_check.unable` is false and at least one feature was evaluated (`passed + failed > 0`, or equivalent feature statuses). Treat `live_check.unable: true`, no `live_check`, no evaluated features, or missing credentials/token as `not_exercised`. A clean mock dogfood/verify run is still useful, but it is **not** a live matrix pass.

`gosec` runs as the off-the-shelf security static-analysis leg for hand-written Go. Prefer an installed `gosec` binary when present; otherwise use the pinned `go run github.com/securego/gosec/v2/cmd/gosec@v2.26.1` fallback so a clean machine still gets a reproducible check without a separate setup step. Read `/tmp/polish-gosec-before.json` for the baseline finding count and issue details. If the command fails before writing JSON, treat the missing scan as a polish failure: add it to `remaining_issues`, set `ship_recommendation: hold`, and include the stderr summary so the next run can distinguish network/tooling failure from CLI defects. Prioritize findings in hand-authored files: whole files under `internal/cli/`, `internal/syncer/`, and `internal/store/` whose first 20 lines lack the `Generated by CLI Printing Press` header are polish-owned novel-feature code. Findings in generator-emitted files are Printing Press retro candidates unless they can be fixed durably by changing the spec and regenerating; do not hand-edit generated files just to silence gosec.

**If Phase 1 baseline reveals the underlying CLI needs re-discovery**, broken HTML/SSR extraction, sparse capture (fewer than 5 unique endpoints in the source manuscript), wrong endpoint shapes, missing GraphQL operation hashes, or any signal that the CLI was generated from incomplete capture, polish does not normally do browser capture itself, but the shared playbook at `skills/printing-press/references/browser-sniff-capture.md` covers all available capture backends including the Claude chrome-MCP (`mcp__claude-in-chrome__*`) and computer-use (`mcp__computer-use__*`) when the runtime exposes them. Read Step 1 (tool detection), Step 2c.5 (failure-recovery menu), and Step 2e (chrome-MCP capture playbook) of that reference before improvising. Re-discovery from polish is rare but real; when it happens, use the shared backends, do not invent a new capture flow.

Parse findings into categories:

| Category | Source | What to look for |
|----------|--------|------------------|
| Verify failures | verify --json | Commands with score < 3 |
| SKILL static-check failures | verify-skill --json | Any `findings[]` with `severity=error` (flag-names, flag-commands, positional-args, unknown-command, canonical-sections). Hard ship-gate: ship cannot fire while these exist. |
| Workflow gaps | workflow-verify --json | Verdict `workflow-fail`. Soft gate: surface in `remaining_issues` and downgrade to `hold` when the workflow is the CLI's primary value. |
| Publish validation failures | publish validate --json | `passed: false`. **Standalone polish only** (runs only when `STANDALONE_MODE=true`); skipped in mid-pipeline polish where publish prerequisites aren't yet satisfied. When it runs, it's a hard ship-gate: ship cannot fire while publish validate fails. If the only failing check is missing phase5 acceptance, report `phase5 acceptance required` with the next-step command: authenticate, then run `"$PRINTING_PRESS_BIN" dogfood --dir "$CLI_DIR" $SPEC_FLAG --live --level quick --write-acceptance <proofs-dir>/phase5-acceptance.json`. Use the proofs directory from the validate error when present. |
| Security static-analysis failures | gosec JSON | Any `Issues[]` entry, especially G201/G202 SQL construction, G101 credential literals, or unsafe file/command execution. Hard ship-gate when the finding is in hand-authored novel-feature Go. |
| Dead code | dogfood | Dead functions, dead flags |
| Stale files | dogfood | Unregistered commands |
| Description issues | dogfood | Boilerplate root Short |
| README gaps | scorecard | README score < 8 |
| Example gaps | dogfood | Commands missing examples |
| Go vet issues | go vet | Any output |
| Output entity warnings | scorecard JSON | `live_check.features[].warnings`, raw HTML entities in human output |
| Output plausibility | Phase 4.85 | Findings from the agentic output review |
| MCP tool quality | tools-audit | Empty Short, thin Short, missing read-only annotations, thin MCP descriptions |
| Customer PII | pii-audit | Card last-4, email, phone, ZIP+4, postal-address shapes in high-risk files (manuscripts, fixtures, README) |

**Environmental failures vs. CLI defects.** Some Phase 1 outputs surface failures that aren't real CLI bugs and should not block ship:

- `scorecard --live-check` reporting `SQLITE_BUSY`, network timeouts, `401` from a mock or expired token, or HTTP errors that depend on the test workspace's permissions/state, these are test-environment issues, not CLI defects.
- `verify` mock-harness flakes on commands with binary output (e.g., `qr` returning a PNG that the substring matcher can't validate) or commands with optional positional args where dry-run output legitimately doesn't contain the verify probe string.
- Learn-loop commands: the dogfood/verify matrix now covers the default-on learn surface (`teach`, `recall`, `learnings`, `playbook`). `teach` and `teach-playbook` intentionally exit 2 when invoked bare, declared via `pp:typed-exit-codes`, so verify scores that as pass; do not "fix" the exit code. `learnings stats` on a fresh print legitimately reports zeros and empty sections; that is an empty local store, not a defect.

Classify these as environmental in `skipped_findings` with the specific reason; do not spend Phase 2 cycles trying to "fix" them. The polish skill's ship logic already excludes live-check failures from gating, but the agent should still annotate them so reviewers can see they were considered and dismissed deliberately.

### Phase 4.85, Agentic output review (Wave B)

After the mechanical diagnostics above complete, invoke the `printing-press-output-review` sub-skill via the Skill tool. The sub-skill carries `context: fork` and owns the dispatch prompt, gate logic, and known blind spots, single source of truth shared with the main printing-press skill.

```
Skill(
  skill: "cli-printing-press:printing-press-output-review",
  args: "$CLI_DIR"
)
```

Parse the returned `---OUTPUT-REVIEW-RESULT---` block. `status: WARN` findings flow into the diagnostic categories above so Phase 2 fixes address both rule-based and plausibility issues. `status: SKIP` is informational, record but don't block.

Wave B gating applies: all findings are warnings, never blockers. Fix if obvious and cheap; document with a short comment if deferred.

Record baseline scores: scorecard total, verify pass rate, dogfood verdict, live matrix qualifier (`exercised` / `not_exercised`), go vet issue count, gosec finding count, output-review finding count.

