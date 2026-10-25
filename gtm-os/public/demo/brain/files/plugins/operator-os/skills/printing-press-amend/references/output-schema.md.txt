# Phase 8, Output for `/printing-press-amend`

This reference is loaded after Phase 7's PR open completes. It defines the structured result block the skill emits on completion, plus this SKILL.md's own self-verification command.

**Cross-cutting thread:** `MODE` (set in `mode-detection.md`) determines the value of `dogfood_status` below, mirrors the same field Phase 4 populates (see `plan-execute-validate.md`).

## Output

Emit the structured `---PATCH-RESULT---` block on completion. Format:

```
---PATCH-RESULT---
pr_url: <url>
pr_number: <n>
branch_name: <name>
api_slug: <slug>
scope_tier: <bugs|bugs+features|all|custom>
files_changed:
- <file>
build_status: <PASS|FAIL>
test_status: <PASS|FAIL>
dogfood_status: <PASS|FAIL|N/A>
pii_scrub_summary: <N tokens replaced across M artifacts>
findings_addressed:
- <one-line-summary>
findings_deferred:
- <one-line-summary>
deferred_list_path: <path>
plan_doc_path: <path>
---END-PATCH-RESULT---
```

## Verification of this skill itself

The static lint pass for this SKILL.md runs via:

```bash
<PRINTING_PRESS_BIN> verify-internal-skill --dir skills/printing-press-amend
```

(See `internal/cli/verify_internal_skill.go` and the matching test file. The setup-contract parity check runs as a Go test in `internal/pipeline/contracts_test.go`, `TestSkillSetupBlocksMatchWorkspaceContract`.)
