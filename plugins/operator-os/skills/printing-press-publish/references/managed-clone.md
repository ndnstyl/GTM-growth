<!-- contents:start -->
## Contents

- [Step 5: Managed Clone](#step-5-managed-clone)
  - [First-time setup](#first-time-setup)
  - [Subsequent publishes](#subsequent-publishes)
  - [Interrupted state recovery](#interrupted-state-recovery)
  - [Pre-package publication-state snapshot](#pre-package-publication-state-snapshot)
<!-- contents:end -->

> Loaded by SKILL.md for Step 5. Establishes the skill-managed clone at $PUBLISH_REPO_DIR (first-time setup, subsequent-publish refresh, interrupted-state recovery), then takes the pre-package snapshot Step 7 relies on for $PREEXISTING_MERGED_COLLISION / $PREEXISTING_MERGED_PATHS.

## Step 5: Managed Clone

The publish skill manages its own clone of the library repo at `$PUBLISH_REPO_DIR`.

### First-time setup

If `$PUBLISH_REPO_DIR` does not exist:

1. **Detect push access:**
   ```bash
   GH_USER=$(gh api user --jq '.login')
   HAS_PUSH=$(gh api repos/mvanhorn/printing-press-library --jq '.permissions.push' 2>/dev/null || echo "false")
   ```

2. **Detect git protocol:**
   ```bash
   USE_SSH=false
   if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
     USE_SSH=true
   fi
   ```

3. **Clone based on access:**

   **Push access** (`HAS_PUSH` is `true`):
   ```bash
   # Clone directly, origin IS the upstream
   if [ "$USE_SSH" = "true" ]; then
     REPO_URL="git@github.com:mvanhorn/printing-press-library.git"
   else
     REPO_URL="https://github.com/mvanhorn/printing-press-library.git"
   fi
   # Lightweight clone: blobless + shallow + sparse. The publish flow only
   # touches the target CLI's own directory, it no longer regenerates the
   # cli-skills/registry mirror (see Step 6), so materializing every other
   # CLI's source is wasted bandwidth and disk (a full clone is multiple GB;
   # this is tens of MB). The cone keeps `tools`, `cli-skills`, and the target
   # `library/<category>` so the in-category find/rm/copy operations below work
   # on a real working tree. Cross-category collision checks use `git ls-tree`
   # (which reads the full tree from the blobless clone) instead of `ls`.
   git clone --filter=blob:none --depth 1 --sparse "$REPO_URL" "$PUBLISH_REPO_DIR"
   # Skill-managed clones are owned by this flow; force LF checkout behavior so
   # Windows core.autocrlf defaults do not create CRLF-only mirror diffs.
   git -C "$PUBLISH_REPO_DIR" config core.autocrlf false
   git -C "$PUBLISH_REPO_DIR" sparse-checkout set tools cli-skills library/<category>
   ```

   **No push access** (`HAS_PUSH` is `false`):
   ```bash
   # Fork first, fail explicitly if forking is blocked
   if ! gh repo fork mvanhorn/printing-press-library --clone=false 2>&1; then
     echo "ERROR: Could not fork mvanhorn/printing-press-library."
     echo "The repo may restrict forking, or you may already have a fork with a different name."
     echo "Fork manually at https://github.com/mvanhorn/printing-press-library/fork"
     exit 1
   fi
   FORK="$GH_USER/printing-press-library"

   # Build URLs based on protocol preference
   if [ "$USE_SSH" = "true" ]; then
     FORK_URL="git@github.com:$FORK.git"
     UPSTREAM_URL="git@github.com:mvanhorn/printing-press-library.git"
   else
     FORK_URL="https://github.com/$FORK.git"
     UPSTREAM_URL="https://github.com/mvanhorn/printing-press-library.git"
   fi

   # Lightweight clone (blobless + shallow + sparse), see the push-access
   # branch above for the rationale and cone contents.
   git clone --filter=blob:none --depth 1 --sparse "$FORK_URL" "$PUBLISH_REPO_DIR"
   # Skill-managed clones are owned by this flow; force LF checkout behavior so
   # Windows core.autocrlf defaults do not create CRLF-only mirror diffs.
   git -C "$PUBLISH_REPO_DIR" config core.autocrlf false
   cd "$PUBLISH_REPO_DIR"
   git sparse-checkout set tools cli-skills library/<category>
   git remote add upstream "$UPSTREAM_URL"
   git fetch --filter=blob:none --depth 1 upstream
   ```

4. **Cache the config:**
   ```json
   {
     "managed_by": "printing-press-publish",
     "repo_url": "https://github.com/mvanhorn/printing-press-library",
     "access": "push or fork",
     "gh_user": "<gh username>",
     "protocol": "ssh or https",
     "clone_path": "<expanded $PUBLISH_REPO_DIR>",
     "scope_dir": "<absolute source worktree path>",
     "module_path_base": "github.com/mvanhorn/printing-press-library/library"
   }
   ```
   Write to `$PUBLISH_CONFIG`. The `access` field determines the flow for all subsequent steps. The `gh_user` field is used for cross-repo PR heads. The `module_path_base` always references the upstream repo (PRs land there).

### Subsequent publishes

Read `$PUBLISH_CONFIG`, then re-check access in case it changed (user was granted push access, or access was revoked):

```bash
CURRENT_ACCESS=$(gh api repos/mvanhorn/printing-press-library --jq '.permissions.push' 2>/dev/null || echo "false")
CACHED_ACCESS=$(jq -r .access "$PUBLISH_CONFIG")

if [ "$CURRENT_ACCESS" = "true" ] && [ "$CACHED_ACCESS" = "fork" ]; then
  echo "Access upgraded to push. Reconfiguring clone..."
  rm -rf "$PUBLISH_REPO_DIR"
  # Re-run first-time setup with push access
fi
if [ "$CURRENT_ACCESS" = "false" ] && [ "$CACHED_ACCESS" = "push" ]; then
  echo "Push access revoked. Reconfiguring clone with fork..."
  rm -rf "$PUBLISH_REPO_DIR"
  # Re-run first-time setup with fork access
fi
```

If the clone was removed due to an access change, re-run first-time setup above. Otherwise, freshen the clone to match the canonical upstream:

```bash
cd "$PUBLISH_REPO_DIR"
git config core.autocrlf false

if [ "$(jq -r .access $PUBLISH_CONFIG)" = "push" ]; then
  # Push access: origin IS the upstream
  git fetch --filter=blob:none --depth 1 origin
  git checkout main
  git reset --hard origin/main
  # Remove stale untracked library fragments from prior publish branches before
  # copying this CLI. Ignored files hidden by a branch-local .gitignore can
  # become ordinary untracked files after checkout, and a later broad library
  # add must not sweep another CLI's leftovers into this PR.
  git clean -fdq library/
else
  # Fork: origin is the fork, upstream is canonical
  git fetch --filter=blob:none --depth 1 upstream
  git checkout main
  git reset --hard upstream/main
  # Remove stale untracked library fragments from prior publish branches before
  # copying this CLI. Ignored files hidden by a branch-local .gitignore can
  # become ordinary untracked files after checkout, and a later broad library
  # add must not sweep another CLI's leftovers into this PR.
  git clean -fdq library/
  # Also sync origin (fork) so git push works cleanly
  git push origin main --force-with-lease 2>/dev/null || true
fi

# Existing managed clones may already be sparse for a different publish
# category. Refresh the cone for the current target category before Step 6 uses
# filesystem-based removal and copy operations.
if git -C "$PUBLISH_REPO_DIR" config --bool core.sparseCheckout | grep -qx true; then
  git -C "$PUBLISH_REPO_DIR" sparse-checkout set tools cli-skills library/<category>
fi
```

Verify the clone is healthy:

```bash
git rev-parse --is-inside-work-tree
test "$(git rev-parse --abbrev-ref HEAD)" = "main"
```

If this fails, the clone is corrupt. Remove `$PUBLISH_REPO_DIR` and re-run first-time setup.

### Interrupted state recovery

Before creating a new branch, check for uncommitted changes:

```bash
cd "$PUBLISH_REPO_DIR"
git status --porcelain
```

If there are uncommitted changes, ask the user via AskUserQuestion:
- "Reset and start fresh"
- "Continue with existing changes"

If reset, run `git checkout -- . && git clean -fd`.

### Pre-package publication-state snapshot

Before Step 6 mutates the managed clone, record whether this API slug already
exists in the public library tree. Step 6 removes and replaces
`library/*/<api-slug>`, so any collision or publication-path decision made
after packaging must use this pre-package snapshot, not a fresh `ls`.

```bash
# Read from the git tree, not the working dir: the sparse checkout only
# materializes the target category, but a slug can collide in any category.
PREEXISTING_MERGED_PATHS=$(git -C "$PUBLISH_REPO_DIR" ls-tree -r --name-only HEAD \
  | sed -n 's#^\(library/[^/]*/<api-slug>\)/.*#\1#p' | sort -u || true)
PREEXISTING_MERGED_COLLISION=false
if [ -n "$PREEXISTING_MERGED_PATHS" ]; then
  PREEXISTING_MERGED_COLLISION=true
  # If this is a category-change reprint, materialize the existing category path
  # before Step 6 runs filesystem-based ledger preservation and removal.
  if git -C "$PUBLISH_REPO_DIR" config --bool core.sparseCheckout | grep -qx true; then
    while IFS= read -r EXISTING_MERGED_PATH; do
      [ -n "$EXISTING_MERGED_PATH" ] || continue
      if [ "$EXISTING_MERGED_PATH" != "library/<category>/<api-slug>" ]; then
        git -C "$PUBLISH_REPO_DIR" sparse-checkout add "$EXISTING_MERGED_PATH"
      fi
    done <<EOF
$PREEXISTING_MERGED_PATHS
EOF
  fi
fi
```
