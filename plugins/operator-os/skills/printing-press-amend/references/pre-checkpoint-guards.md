# Phase 2, Pre-Checkpoint Guards for `/printing-press-amend`

This reference is loaded after Phase 1 produces its finding list and before Phase 3's scope checkpoint. Two guards run before the user sees the scope menu. Either can suppress findings or abort the run.

**Cross-cutting threads:** this phase reuses `PRINTING_PRESS_BIN` is NOT needed here (this phase uses `gh`, not the press binary), but it reads `published_status`, which was set in `references/transcript-parsing.md` / `references/direct-input-parsing.md` during Phase 1, to decide whether the stale-binary check (2b) applies at all.

## 2a. PR cross-reference (suppress duplicate proposals)

For each finding from Phase 1, search open + recently-merged PRs in `mvanhorn/printing-press-library` for matches. The duplicate-detection criteria (in priority order): (1) the target CLI's directory path overlaps the PR's changed-file list, (2) keywords from the finding's category + rationale match the PR title or body.

```bash
# Replace <PRINTING_PRESS_BIN> use with the absolute path captured at setup.
# This phase uses gh, not the press binary.

# Open PRs touching this CLI
gh pr list --repo mvanhorn/printing-press-library \
  --search "in:title,body <slug>" --state open --limit 20 \
  --json number,title,state,headRefName,files

# Recently merged PRs (last 90 days) touching this CLI.
# Compute "90 days ago" portably, `date -v-90d` is BSD/macOS only, `date -d`
# is GNU/Linux only. Try GNU first, fall back to BSD, then to python3. If
# every form fails, abort with an explicit error rather than letting the
# dedup guard silently drop out with an empty `merged:>` qualifier.
ninety_days_ago=$(date -u -d '90 days ago' +%Y-%m-%d 2>/dev/null \
  || date -u -v-90d +%Y-%m-%d 2>/dev/null \
  || python3 -c 'import datetime; print((datetime.datetime.now(datetime.UTC).date() - datetime.timedelta(days=90)).isoformat())' 2>/dev/null)
if [ -z "$ninety_days_ago" ]; then
  echo "ERROR: cannot compute 90-days-ago date, no GNU date, BSD date, or python3 available."
  exit 1
fi

gh pr list --repo mvanhorn/printing-press-library \
  --search "in:title,body <slug> merged:>$ninety_days_ago" \
  --state merged --limit 20 \
  --json number,title,state,mergedAt,headRefName,files
```

For each finding with a possible-duplicate match, present inline:

> "Finding `F<n>` (`<category>`) may already be addressed by PR #<num>, `<title>` (<state>, <date>). Skip this finding?"

User options: skip (drops to deferred), keep, or "show me PR #<num>" (opens `gh pr view <num> --repo mvanhorn/printing-press-library --web`). The default for clearly-merged matches is "skip"; for open PRs, default is "keep" (the user may want to add to the in-flight PR rather than open a new one).

This guard catches the canonical failure mode from the 2026-05-15 dogfood: proposing auto-refresh for a Printing Press CLI when a similar PR had already shipped on a sibling CLI a few hours earlier. The cost of a false skip is low (the user can re-add via custom selection at U4); the cost of a false-negative duplicate is a rejected PR + reviewer time.

## 2b. Stale-binary check (abort if the dogfooded binary lags published)

Read the public library's `.printing-press.json` for the target CLI to find the published version. Compare to what the local printed CLI binary reports.

```bash
# Read published version (managed clone if available, else gh api)
if [ -f "$HOME/printing-press-library/library/<category>/<slug>/.printing-press.json" ]; then
  published=$(jq -r '.version // empty' "$HOME/printing-press-library/library/<category>/<slug>/.printing-press.json")
else
  published=$(gh api repos/mvanhorn/printing-press-library/contents/library/<category>/<slug>/.printing-press.json \
    --jq '.content' | base64 -d | jq -r '.version // empty')
fi

# Read local binary version (if installed; the user dogfooded with this binary)
local_ver=$(<slug>-pp-cli version --json 2>/dev/null | jq -r '.version // empty' || echo "")
```

If `local_ver` is older than `published` (semver comparison), abort cleanly:

> "The `<slug>-pp-cli` binary you dogfooded is v`<local_ver>`, but the published library version is v`<published>`. The friction you hit may already be fixed in the published version. Run:
>
>     go install github.com/mvanhorn/<slug>-pp-cli@latest
>
> ...then re-run `/printing-press-amend` after re-dogfooding. Aborting this run."

Edge cases: if `.printing-press.json` is missing or has no `version` field, skip the stale check with a note. If the CLI is local-only (not yet published), skip the check.

## Output

Phase 2 emits the (possibly trimmed) finding list to Phase 3:

```yaml
findings_kept:
  - <finding from Phase 1>
findings_suppressed:
  - id: F3
    reason: "Duplicate of PR #571 (merged 2026-05-13)"
target_binary_check: { local: "1.0.0", published: "1.0.0", status: "current" }
published_status: published
```
