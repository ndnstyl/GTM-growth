# Result Block (the ---POLISH-RESULT--- Schema)

> **STANDALONE_MODE** reminder: true only for slash-command invocations or an explicit `--standalone` Skill-tool call; false for mid-pipeline polish. It decides whether `publish_validate_*` below is `PASS`/`FAIL` or the literal `skipped (mid-pipeline)`.

## Display delta and emit result block

Display the delta to the user, then emit the structured `---POLISH-RESULT---` block. The block lets calling skills (e.g., main printing-press SKILL.md Phase 5.5) parse the recommendation and scores reliably; the human-readable table above is for the user.

```
Polish Results for <CLI_NAME>:

                    Before    After     Delta
  Scorecard:        XX/100    XX/100    +N
  Verify:           XX%       XX%       +N%
  Live matrix:      exercised/not_exercised -> exercised/not_exercised
  Tools-audit:      XX        XX        -N pending findings

Fixes applied:
  - <one-line description of each fix>

Skipped findings:
  - <finding>: <why you chose not to fix it>

Remaining issues:
  - <one-line description of each issue you tried to fix but couldn't>

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

The three lists serve different purposes:
- **fixes_applied**: what changed, the caller displays these
- **skipped_findings**: issues you found but deliberately did not fix, with reasoning (e.g., "verify classifies `stale` as read, scorer bug, not a CLI problem", "thin-short on `version` accepted as-is, accurate and brief"). The caller surfaces these so the user can decide whether to address them manually.
- **remaining_issues**: issues you tried to fix but couldn't resolve.

**`publish_validate_*` values.** Emit `PASS` or `FAIL` when polish ran publish-validate (standalone mode). Emit the literal string `skipped (mid-pipeline)` when polish skipped it (mid-pipeline invocation, `STANDALONE_MODE=false`). The skipped value is informational only: callers must not treat it as a failure when deciding whether to cascade polish's `ship_recommendation` into a CLI-level hold.

**`dogfood_live_matrix_*` values.** Emit `exercised` only when live-check evaluated at least one real sample. Emit `not_exercised` for mock-only/no-token/no-research/no-evaluated-sample runs. When `dogfood_after: PASS` but `dogfood_live_matrix_after: not_exercised`, the human summary must say `dogfood PASS (mock only; live matrix not exercised, run the live gate before publish)`, and `ship_recommendation` must be `hold` unless the parent caller explicitly owns a later live gate.

**`gosec_*` values.** Emit the post-triage count of gosec findings that are
still relevant to this printed CLI after generated-file triage. These values
are intentionally not the raw `Issues[]` length from `/tmp/polish-gosec-*.json`:
do not count generator-emitted findings that were routed to `skipped_findings`
as retro candidates, but do count unresolved hand-authored findings that force
`hold`.

### Picking `further_polish_recommended`

Your judgment, not a count of `remaining_issues`. Set `yes` when another polish invocation has a real chance of closing what's left:

- `remaining_issues` includes verify or dogfood failures you ran out of time on and a fresh pass with more attention per failure could plausibly resolve.
- The fixes you did land may have unblocked dependent issues you couldn't reach this pass.
- A SKILL/CLI mismatch needs a second look after this pass changed the source tree.

Set `no` when another invocation would re-tread the same ground:

- `remaining_issues` are decisions only the user can make (rename a flagship command, choose a default behavior, accept a structural trade-off).
- You already attempted the fix in two different ways this pass and both failed for the same reason.
- The blocker is external (API changed shape, rate-limited, missing credential) and not something a fresh polish run sees differently.
- `remaining_issues` is empty AND `skipped_findings` are all environmental or structural, there is nothing left for polish to do.

`further_polish_reasoning` is one sentence the caller surfaces verbatim. Make it specific ("verify failures on `analytics export` and `report show` looked closable but I gave up too early") rather than generic ("more polish might help"). Callers use this signal to decide whether to offer "Polish again" in their next prompt; a vague reason makes their prompt vague.

