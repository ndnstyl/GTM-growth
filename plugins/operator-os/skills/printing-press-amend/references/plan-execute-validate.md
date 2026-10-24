# Phase 4, Plan + Execute + Validate (Autonomous) for `/printing-press-amend`

<!-- contents:start -->
## Contents

- [Step 1, Set up the managed clone](#step-1--set-up-the-managed-clone)
- [Step 2, Write the per-run plan doc](#step-2--write-the-per-run-plan-doc)
- [Step 3, Execute the plan (with the patch contract)](#step-3--execute-the-plan-with-the-patch-contract)
- [Step 4, Validate](#step-4--validate)
- [Step 5, Retry on failure (up to 3 iterations)](#step-5--retry-on-failure-up-to-3-iterations)
- [Step 6a, Check the patch manifest](#step-6a--check-the-patch-manifest)
- [Step 6b, Documentation update checkpoint](#step-6b--documentation-update-checkpoint)
- [Output](#output)
<!-- contents:end -->

This reference is loaded after Phase 3's scope checkpoint and before Phase 5's PII scrub. This phase runs unattended between checkpoints 1 and 2. The user does not see fix-by-fix details; they review the final diff at the Phase 6 PR-draft checkpoint.

**Cross-cutting threads:**
- `PRINTING_PRESS_BIN` (captured in `setup-contract.md`) is used again in Step 4's `publish validate` call.
- `MODE` (set in `mode-detection.md`) determines how `dogfood_status` is populated in this phase's output.
- `published_status` (set in Phase 1, see `references/transcript-parsing.md` / `references/direct-input-parsing.md`) is read at Step 1 to decide the managed-clone routing.
- The patch-file JSON schema written in Step 3 (`.printing-press-patches/<id>.json`) is the same file `pr-draft-checkpoint.md`'s Evidence section links to, keep the two in sync if the schema changes.

**Numbering note:** the source skill had two consecutive sub-sections both titled "Step 6" (patch-manifest check, then documentation-update checkpoint). This file labels them **Step 6a** and **Step 6b** for navigability only, the content and order are unchanged from the original.

## Step 1, Set up the managed clone

Per the Pre-Implementation Decision in the plan: this skill operates DIRECTLY on the managed clone of `mvanhorn/printing-press-library` rather than on `$PRESS_LIBRARY/<slug>/`. The managed clone is at:

```
$PRESS_HOME/.publish-repo-$PRESS_SCOPE
```

This is the same clone `/printing-press-publish` uses (Step 5 of that skill). Reuse it:

```bash
PUBLISH_REPO_DIR="$PRESS_HOME/.publish-repo-$PRESS_SCOPE"
PUBLISH_CONFIG="$PRESS_HOME/.publish-config-$PRESS_SCOPE.json"

if [ ! -d "$PUBLISH_REPO_DIR/.git" ]; then
  # First-time setup: see references/library-pr-plumbing.md for the full
  # detection (push-vs-fork access via gh api .../permissions.push,
  # SSH-vs-HTTPS protocol detection, scoped-clone cleanup loop).
  echo "Managed clone not present, bootstrapping..."
  # ... (see library-pr-plumbing.md)
else
  # Refresh from upstream. -f on checkout discards any local edits left behind
  # by a prior run that aborted between Phase 4's edits and Phase 7's commit, # without -f, those uncommitted changes block the checkout and the subsequent
  # reset --hard never runs.
  cd "$PUBLISH_REPO_DIR"
  git fetch upstream main
  git checkout -f main
  git reset --hard upstream/main
fi
```

The CLI's directory inside the managed clone is `$PUBLISH_REPO_DIR/library/<category>/<slug>/`. The category was resolved in Phase 1 (or look it up with `find "$PUBLISH_REPO_DIR/library" -maxdepth 2 -name "<slug>" -type d`).

```bash
CLI_DIR="$PUBLISH_REPO_DIR/library/<category>/<slug>"
```

All edits in this phase happen INSIDE `$CLI_DIR`. Never touch `$PRESS_LIBRARY/<slug>/`, that's a different working copy and editing it would not flow to the PR.

## Step 2, Write the per-run plan doc

Before editing code, materialize a plan markdown at:

```
$PRESS_MANUSCRIPTS/<slug>/<run-id>/proofs/<timestamp>-amend-<cli-name>.md
```

Mirror to `/tmp/printing-press/amend/` for quick reference. The plan doc carries:

- Frontmatter: `date`, `target_cli`, `amend_run_id`, `scope_tier`, `findings_count`
- One section per active finding: id, category, classification, rationale, target files (`$CLI_DIR/...` paths), expected behavior change, test scenarios for this finding
- Risks and dependencies between findings (if any)

The plan is decision-shape, not execution-shape, implementer-time sequencing happens during Step 3.

## Step 3, Execute the plan (with the patch contract)

For each finding in dependency order:

1. Edit the target files under `$CLI_DIR/`. Honor AGENTS.md anti-reimplementation rules (no hand-rolled response builders; novel commands must call the real endpoint or read from the local store via `// pp:client-call` / `// pp:novel-static-reference` opt-outs only when truly justified).

2. Optional: add a `// PATCH(<short reason>)` source comment at changed sites when it helps future agents find the customization quickly. Format examples:

   ```go
   // PATCH(amend-2026-05-15: surface refresh-token expiry to user), was silently retrying
   func (c *Client) Refresh(ctx context.Context) error {
       ...
   }
   ```

3. Create one patch file `$CLI_DIR/.printing-press-patches/<id>.json` (filename = the patch `id`). Each file is a single self-contained patch object, one file per patch, so concurrent amend PRs on the same CLI never conflict on patch metadata:

   ```json
   {
     "schema_version": 2,
     "id": "<api-slug>-refresh-token-expiry",
     "applied_at": "<YYYY-MM-DD>",
     "base_run_id": "<copy from .printing-press.json>",
     "base_printing_press_version": "<copy from .printing-press.json>",
     "summary": "fix(superhuman): surface refresh-token expiry; add drafts new + --type sent",
     "reason": "The generated CLI hid an expired refresh token and omitted a workflow flag needed by the live API.",
     "files": [
       "internal/auth/refresh.go",
       "internal/cli/drafts.go",
       "internal/cli/threads.go"
     ],
     "validated_outcome": "publish validate passed; focused drafts and refresh-token checks pass",
     "findings_addressed": ["F1", "F2", "F5", "F7"]
   }
   ```

   If the CLI still ships the legacy single-array `.printing-press-patches.json` (older print, not yet normalized), still write your entry as a new `.printing-press-patches/<id>.json` file, the public library's normalize-patches workflow merges the two post-merge. Do not append to the legacy array.

   If you add `// PATCH(...)` comments, you may also include a `patch_count`
   field for reviewer convenience. Do not add `patch_count` when no source
   comments were added.

   For a temporary patch with a future supersession path, include the upstream handoff fields in that same patch entry:

   ```json
   {
     "deferred_to_upstream": [
       {
         "feature": "Generator or upstream API capability this printed-CLI patch should eventually supersede",
         "reason": "Why the local patch is intentionally temporary or API-specific."
       }
     ],
     "upstream_issue": "https://github.com/mvanhorn/cli-printing-press/issues/<n>"
   }
   ```

   The `.printing-press-patches/<id>.json` patch file is mandatory for code-level customizations. Inline `// PATCH(...)` source comments are optional navigation aids; the public library verifier no longer enforces a marker/comment pairing. See `~/printing-press-library/AGENTS.md` for the authoritative spec.

   Use `deferred_to_upstream` only when the patch intentionally leaves a future supersession path: a public API endpoint is missing today, the command relies on an unofficial host or alternate auth source, a live response shape drifted from generator assumptions, or the fix would become unnecessary once the Printing Press learns the pattern. In those cases, search `mvanhorn/cli-printing-press` issues first; reuse a matching issue or open one before the library PR, then set `upstream_issue` to that URL. Do not leave a machine-level or API-publication dependency only in the PR body.

4. **Machine-vs-printed-CLI judgment** (per AGENTS.md): when a finding's fix would generalize to every printed CLI (e.g. "the generator should emit `--type sent` for any threads list command"), surface as a borderline case:

   > "Finding F5 (`--type sent` missing) looks like a machine-level fix, the generator template `internal/generator/templates/threads.go.tmpl` should emit it for every CLI with this endpoint shape, not just `<slug>-pp-cli`. Defer to a `/printing-press-retro` follow-up, or proceed CLI-specific?"

   When deferred, drop into the deferred-list with classification `machine-level`. When kept because the printed CLI needs a narrow fix now, and the patch still carries a future supersession path, create or reuse the upstream Printing Press issue before opening the library PR, add the issue URL to the patch's `.printing-press-patches/<id>.json`, and add a `deferred_to_upstream` item naming the machine-level or upstream-API condition that should supersede the local patch.

## Step 4, Validate

After all edits land, run the consolidated validator (replace `<PRINTING_PRESS_BIN>` with the absolute path captured at setup):

```bash
<PRINTING_PRESS_BIN> publish validate --dir "$CLI_DIR" --json > /tmp/amend-validate.json
exit_code=$?
```

`publish validate` runs manifest, phase5, govulncheck (scoped to this CLI's module), `go vet`, `go build`, `--help`, `--version`. Exit 0 = clean.

## Step 5, Retry on failure (up to 3 iterations)

If `publish validate` reports failures, parse the error categories from the JSON, attempt targeted fixes, re-run validate. Maximum 3 iterations total. After iteration 3:

```bash
# Save the in-progress plan + diff to a holding location
HELD_PATH="$PRESS_MANUSCRIPTS/<slug>/<run-id>/proofs/<timestamp>-amend-<cli-name>-INCOMPLETE.md"
git -C "$PUBLISH_REPO_DIR" diff > "${HELD_PATH%.md}.diff"
cp "$PLAN_PATH" "$HELD_PATH"
```

Surface the final error log to the user, do NOT auto-open the PR, exit. The user can resume by re-invoking the skill (Phase 1 detects the held plan and offers to resume).

## Step 6a, Check the patch manifest

This amend run must have recorded at least one patch, a `<id>.json` under
`.printing-press-patches/` (the directory layout), or, only for a CLI not yet
normalized, a non-empty `patches[]` in the legacy `.printing-press-patches.json`.

```bash
dir_count=0
if [ -d "$CLI_DIR/.printing-press-patches" ]; then
  dir_count=$(find "$CLI_DIR/.printing-press-patches" -maxdepth 1 -name '*.json' ! -name '_meta.json' | wc -l | tr -d ' ')
fi
legacy_count=0
if [ -f "$CLI_DIR/.printing-press-patches.json" ]; then
  legacy_count=$(jq '(.patches // []) | length' "$CLI_DIR/.printing-press-patches.json")
fi
if [ "$dir_count" -eq 0 ] && [ "$legacy_count" -eq 0 ]; then
  echo "ERROR: this amend run must record at least one patch under .printing-press-patches/ (or the legacy .printing-press-patches.json)."
  exit 1
fi
```

Missing or empty patch manifest → fix locally before continuing.

## Step 6b, Documentation update checkpoint

Before Phase 4 can emit a pass, inspect the confirmed findings and final diff
for every new, renamed, or changed user-facing command, flag, workflow, runtime
mode, or MCP-visible action. Each such change must ship documentation in the
same public-library PR:

- Add or update a cookbook recipe in both `SKILL.md` and `README.md`.
- Add or update the matching Unique Features / Unique Capabilities entry so the
  generated docs and agent-facing summary name the changed workflow.
- Keep examples honest: commands, flags, positional args, and output snippets
  must match the code that now exists in `$CLI_DIR`.
- Run `python3 .github/scripts/verify-skill/verify_skill.py --dir "$CLI_DIR"`
  from the public-library checkout when that path exists; otherwise run the
  packaged verifier equivalent available in the checkout and record the command.

If any required doc edit or verifier result is missing, stop with a blocking
checklist. The blocking checklist names the command and the missing
README/SKILL/Unique Features piece. Do not move to the PR-draft checkpoint until
the checklist is empty. If the amend only fixes internals with no user-facing
behavior change, record `documentation_checkpoint: no-user-facing-doc-change`
in the Phase 4 output.

## Output

Phase 4 emits to Phase 5:

```yaml
plan_doc_path: <path>
managed_clone_dir: <path>
cli_dir_in_clone: <path>
findings_addressed: [...]
build_status: PASS|FAIL
test_status: PASS|FAIL
dogfood_status: PASS|FAIL|N/A    # PASS|FAIL when MODE=dogfood (or "both"); always N/A when MODE=direct
validate_iterations: <n>
patch_entry_count: <n>
documentation_checkpoint: PASS|no-user-facing-doc-change
```

**`dogfood_status` per mode.** When `MODE=dogfood`, the value reflects the result of the dogfood validation step that consumed the transcript-derived findings (PASS if the run produced a clean fix, FAIL if it surfaced a regression). When `MODE=direct`, there is no transcript to dogfood against, set `dogfood_status=N/A`. When `MODE=both`, dogfood validation still runs against the transcript half of the findings; set PASS/FAIL accordingly. This default must be set at the latest by the end of Phase 4 so Phase 7's PR body and Phase 8's RESULT block never emit an empty value.
