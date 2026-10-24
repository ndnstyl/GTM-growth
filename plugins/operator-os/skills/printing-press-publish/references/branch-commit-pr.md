<!-- contents:start -->
## Contents

- [Step 8: Branch, Commit, and PR](#step-8-branch-commit-and-pr)
  - [Create branch](#create-branch)
  - [Commit and push](#commit-and-push)
  - [Capture the pushed commit SHA](#capture-the-pushed-commit-sha)
  - [Create or update PR](#create-or-update-pr)
<!-- contents:end -->

> Loaded by SKILL.md for Step 8. Uses $EXISTING_PR_NUMBER (from Step 7) and $API_SLUG to create or update the branch, commit, and PR.
>
> **What to gather before filling the PR template:** the manifest fields and category (Step 2-3), `help_output` and validation results (Step 4), the live-gate result and $SKIP_LIVE_TEST_REASON (Step 4.5), `novel_features` from the packaged manifest (Step 6), and the collision/publication-path outcome, new print, update, reprint/replace, or alongside (Step 7).

## Step 8: Branch, Commit, and PR

### Create branch

**If `EXISTING_PR_NUMBER` is set** (updating an existing PR):

Fetch and inspect the current PR branch before replacing it. The latest
`origin/main` plus the newly packaged `library/<category>/<api-slug>/` tree is
the proposed update. The remote PR branch may also contain accepted review
fixes from the drive-to-green loop. Those branch-only edits must not be erased
silently.

```bash
UPDATE_BRANCH="feat/<api-slug>"
UPDATE_BASE_REF="refs/printing-press-update-base/<api-slug>"

git fetch origin "+main:refs/remotes/origin/main" "+$UPDATE_BRANCH:$UPDATE_BASE_REF"

# Show the scoped change from the current PR head to the new packaged working
# tree. This is informational for clean updates and mandatory context for holds.
git diff --stat "$UPDATE_BASE_REF" -- "library/<category>/<api-slug>/"

# Branch-only paths are files that exist on the current PR branch but are absent
# from the new packaged working tree. These are always a hold because a
# force-push would delete them.
WORKTREE_PATHS=$(find "library/<category>/<api-slug>" -type f -print 2>/dev/null | sort)
BRANCH_ONLY_PATHS=$(comm -23 \
  <(git ls-tree -r --name-only "$UPDATE_BASE_REF" -- "library/<category>/<api-slug>/" | sort) \
  <([ -n "$WORKTREE_PATHS" ] && printf '%s\n' "$WORKTREE_PATHS" || true))

# Modified paths need human review only when a branch patch relative to
# origin/main is not present in the new packaged working tree. A strict superset
# passes: if the branch patch can be reverse-applied from the working tree, the
# fix is still there even if the file also has fresh generated changes.
BRANCH_ONLY_EDITS=$(git diff --name-only origin/main "$UPDATE_BASE_REF" -- "library/<category>/<api-slug>/" | while read -r path; do
  [ -n "$path" ] || continue
  if git diff origin/main "$UPDATE_BASE_REF" -- "$path" | git apply --check --reverse >/dev/null 2>&1; then
    continue
  else
    printf '%s\n' "$path"
  fi
done | sort -u)

if [ -n "$BRANCH_ONLY_PATHS$BRANCH_ONLY_EDITS" ]; then
  echo "HOLD: updating PR #$EXISTING_PR_NUMBER would overwrite branch-only changes."
  if [ -n "$BRANCH_ONLY_PATHS" ]; then
    echo "Files present on the PR branch but missing from the new package:"
    printf '%s\n' "$BRANCH_ONLY_PATHS" | sed 's/^/- /'
  fi
  if [ -n "$BRANCH_ONLY_EDITS" ]; then
    echo "Files edited on the PR branch and changed again by the new package:"
    printf '%s\n' "$BRANCH_ONLY_EDITS" | sed 's/^/- /'
  fi
  echo "Do not push yet. Reconcile by restoring the branch-only fixes onto the new tree, or ask the user for explicit overwrite confirmation after showing the paths above."
  exit 1
fi
```

If the guard exits, offer the user two choices via `AskUserQuestion`:

- **Reconcile first**, restore the named branch-only files or edits onto the
  new packaged tree, keep or add matching `.printing-press-patches/<id>.json`
  records for code-level fixes, rerun Step 6 verification, then rerun this
  divergence guard.
- **Overwrite intentionally**, only after the user confirms the listed paths
  are obsolete, continue and include a PR-body note naming the overwritten
  branch-only paths.

If the guard finds no branch-only paths or edits, overwrite the local branch:

```bash
git checkout -B feat/<api-slug>
```

**If `EXISTING_PR_NUMBER` is empty and `BRANCH_MERGED` is true** (previous PR was merged):

Auto-create a timestamped branch, do not reuse the merged branch name:

```bash
git checkout -b feat/<api-slug>-$(date +%Y%m%d)
```

**If `EXISTING_PR_NUMBER` is empty and `BRANCH_MERGED` is not set** (no open or merged PR):

Check for stale branches and competing PRs:

```bash
# Check local and remote branches
LOCAL_BRANCH=$(git branch --list "feat/<api-slug>" | head -1)
REMOTE_BRANCH=$(git ls-remote --heads origin "feat/<api-slug>" 2>/dev/null | head -1)

# If a remote branch exists, check who owns it
if [ -n "$REMOTE_BRANCH" ]; then
  # Check for ANY open PR on this branch (not just ours)
  OTHER_PR=$(gh pr list --repo mvanhorn/printing-press-library --head "feat/<api-slug>" --state open --json number,author --jq '.[0]' 2>/dev/null)
fi
```

**If another user's open PR exists on this branch** (`OTHER_PR` is non-empty and author is not `@me`):
> "Someone else has an open PR for `<api-slug>` (PR #N by @author). Creating a timestamped branch to avoid conflicts."

Auto-create a timestamped branch: `feat/<api-slug>-YYYYMMDD`. Do NOT offer to overwrite, that would stomp their work.

**If the branch exists but no competing PR** (stale branch from a previously closed/merged PR):

Ask via AskUserQuestion:
> "Found a stale branch `feat/<api-slug>` (likely from a previous publish). Overwrite it?"

- "Overwrite existing branch", reuse the branch name
- "Create timestamped variant (feat/<api-slug>-YYYYMMDD)"

**If no branch exists:** Create normally.

```bash
# New branch:
git checkout -b feat/<api-slug>

# Overwrite existing:
git checkout -B feat/<api-slug>
```

### Commit and push

```bash
cd "$PUBLISH_REPO_DIR"
git add -A library/
# The staged package has already stripped local binaries and passed the
# mandatory secret/PII scans, so it is the source of truth for this publish.
# Force-add the whole CLI directory after the broad add: destination-repo or
# package-local .gitignore rules such as `*-pp-cli`, `*-pp-mcp`,
# `/.manuscripts/`, or report filenames must not silently suppress required
# publish artifacts under cmd/, .manuscripts/, or metadata files.
git add -f "library/<category>/<api-slug>/"

# Pre-commit scope guard: only this CLI's replacement plus any pre-existing
# merged paths for the same slug may be staged. This catches stale untracked
# fragments from previous publish branches before they leak into the wrong PR.
EXPECTED_STAGE_PREFIXES=$(printf '%s\n' "library/<category>/<api-slug>/" "$PREEXISTING_MERGED_PATHS" | sed '/^$/d; s#/*$#/#' | sort -u)
UNEXPECTED_STAGED=$(git diff --cached --name-only | awk -v prefixes="$EXPECTED_STAGE_PREFIXES" '
BEGIN {
  n = split(prefixes, p, "\n")
  while ((getline line) > 0) {
    matched = 0
    for (i = 1; i <= n; i++) {
      if (p[i] != "" && (line == p[i] || index(line, p[i]) == 1)) {
        matched = 1
        break
      }
    }
    if (!matched) print line
  }
}')
if [ -n "$UNEXPECTED_STAGED" ]; then
  echo "ERROR: publish staged paths outside the expected CLI scope:" >&2
  printf '%s\n' "$UNEXPECTED_STAGED" | sed 's/^/- /' >&2
  echo "Reset the managed clone and rerun publish package before committing." >&2
  exit 1
fi
git commit -m "feat(<api-slug>): add <api-slug>"
```

Push to origin (which is the fork for non-push users, or the upstream for push users):

**If updating an existing PR** (`EXISTING_PR_NUMBER` is set):

```bash
# Only run this after the update-path divergence guard above has passed, or
# after the user explicitly confirmed an intentional overwrite of the named
# branch-only paths.
git push --force-with-lease -u origin feat/<api-slug>
```

**If creating a new PR** and you chose "Overwrite existing branch" earlier:

```bash
git push --force-with-lease -u origin feat/<api-slug>
```

**Otherwise** (new branch, no conflicts):

```bash
git push -u origin feat/<api-slug>
```

### Capture the pushed commit SHA

After pushing, capture the head commit SHA. This is used to build durable manuscript links in the PR body (see "Build the PR description" below).

```bash
HEAD_SHA=$(git rev-parse HEAD)
```

The SHA stays resolvable on `mvanhorn/printing-press-library` for the life of the PR (GitHub mirrors fork-PR head commits to `refs/pull/<N>/head` on the upstream), and remains valid after the PR is merged and the branch is deleted. Each invocation of this skill captures a fresh `HEAD_SHA` after its push and rewrites the body, so links stay current across updates the skill performs. If the branch is force-pushed outside this skill, re-run `/printing-press-publish` to refresh the body, the prior links will still resolve, but they'll point at the manuscript contents from before the out-of-band push.

### Create or update PR

Read `access` and `gh_user` from `$PUBLISH_CONFIG`. These determine how `gh pr create` is called.

**For fork-based PRs** (`access` is `fork`): use `--head <gh_user>:feat/<api-slug>` so GitHub creates a cross-repo PR from the fork to the upstream. Without `--head`, `gh pr create` would try to find the branch on the upstream repo (where the user can't push) and fail.

**For push-access PRs** (`access` is `push`): use `--head feat/<api-slug>` so GitHub creates the PR from the branch this flow just pushed, even when the managed clone or shell session has other branches checked out.

Build the PR description from:
- The manifest (`description`, `api_name`, `category`, `printing_press_version`, `spec_url`)
- The manifest's `novel_features` array from the packaged CLI after Step 6
- The `help_output` captured in Step 4
- The CLI's README (first 2-3 paragraphs, or note that README is missing)
- Links to every file under `.manuscripts/<run-id>/research/` and `.manuscripts/<run-id>/proofs/`. Each link must be a full `https://github.com/mvanhorn/printing-press-library/blob/<HEAD_SHA>/library/<category>/<api-slug>/.manuscripts/<run-id>/<subdir>/<filename>` URL, never a relative path (GitHub resolves those against `…/pull/`, producing broken `…/pull/library/…` URLs) and never a directory (the blob view requires a file). Enumerate the actual files; do not invent or skip them.
- The validation results from Step 4
- The publish live gate result from Step 4.5, including any explicit
  `--skip-live-test` reason
- A Gaps section listing any missing manifest fields

Read `novel_features` from
`$PUBLISH_REPO_DIR/library/<category>/<api-slug>/.printing-press.json` after
packaging. Preserve the manifest order. Do not derive
this section from README prose, SKILL prose, root help, or memory of the run:
those surfaces may be summarized or hand-edited, while the packaged manifest is
the publish-time source of truth. For each entry, include the command, name, and
description. If the array is empty, write `No novel commands recorded in
.printing-press.json.` and include the missing field in **Gaps**; do not omit the
section.

Also include a publication-path line so new prints, reprints, PR updates, and
collision renames are distinguishable:
- `New print`, no merged CLI and no existing PR matched this slug.
- `Update existing PR #<N>`, this publish refreshes an open PR.
- `Reprint/replace`, a merged library CLI existed before this publish and the
  selected path replaces it. This must be based on
  `PREEXISTING_MERGED_COLLISION=true`, not on the post-package tree.
- `Alongside print`, this publish renamed the API slug to avoid a collision;
  include the original slug.
If `/printing-press-reprint` handed off a degraded reprint with no prior
public-library source, use `New print` and add the degraded-reprint note only if
that context is available from the handoff.

**MANDATORY: Before constructing the PR body, scrub all workspace PII.** The library
repo is public. Scan any live test results, acceptance data, or manuscript excerpts
for organization names, team member names, and email addresses. Replace with generic
descriptions ("the workspace", "5 team members", "12 users"). Team keys (e.g., "ESP")
are OK but org names (e.g., "Acme Corp") are not. See `references/secret-protection.md`
in the printing-press skill for the full policy.

Write the constructed PR body to a temporary Markdown file and pass it with
`--body-file`. Do this for both PR creation and PR updates. Do not inline the
body in a shell argument; large fenced help output, Markdown tables, and
backticks are too easy to mangle.


**PR description template:** see `../templates/pr-description.md`, build the body from that template and pass it with `--body-file` (never inline).

**If updating an existing PR** (`EXISTING_PR_NUMBER` is set):

```bash
cd "$PUBLISH_REPO_DIR"
PR_BODY_FILE="$(mktemp)"
# Write the constructed PR body Markdown to "$PR_BODY_FILE".
gh pr edit "$EXISTING_PR_NUMBER" \
  --repo mvanhorn/printing-press-library \
  --body-file "$PR_BODY_FILE"
rm -f "$PR_BODY_FILE"
```

Display the full PR URL: "Updated PR: <EXISTING_PR_URL>" (use the full `https://` URL, not shorthand).

**If creating a new PR:**

```bash
cd "$PUBLISH_REPO_DIR"

# Read access mode from config
ACCESS=$(jq -r .access "$PUBLISH_CONFIG")
GH_USER=$(jq -r .gh_user "$PUBLISH_CONFIG")

if [ "$ACCESS" = "fork" ]; then
  PR_HEAD_REF="$GH_USER:feat/<api-slug>"
else
  PR_HEAD_REF="feat/<api-slug>"
fi

PR_BODY_FILE="$(mktemp)"
# Write the constructed PR body Markdown to "$PR_BODY_FILE".

gh pr create \
  --repo mvanhorn/printing-press-library \
  --head "$PR_HEAD_REF" \
  --base main \
  --title "feat(<api-slug>): add <api-slug>" \
  --body-file "$PR_BODY_FILE"

rm -f "$PR_BODY_FILE"
```

Display the full PR URL (e.g., `https://github.com/mvanhorn/printing-press-library/pull/10`), not the shorthand `org/repo#N` format. The full URL is clickable in all terminals and contexts.
