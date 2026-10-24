<!-- contents:start -->
## Contents

- [Step 7: Collision Detection & Resolution](#step-7-collision-detection--resolution)
  - [Detection](#detection)
  - [No collision](#no-collision)
  - [Collision detected, display info](#collision-detected--display-info)
  - [Resolution paths](#resolution-paths)
    - [Update path (own PR)](#update-path-own-pr)
    - [Replace path](#replace-path)
    - [Alongside path (rename)](#alongside-path-rename)
    - [Bail path](#bail-path)
<!-- contents:end -->

> Loaded by SKILL.md for Step 7. Uses $PREEXISTING_MERGED_COLLISION / $PREEXISTING_MERGED_PATHS from Step 5's pre-package snapshot to detect merged-CLI and open-PR collisions, and sets $EXISTING_PR_NUMBER for Step 8.

## Step 7: Collision Detection & Resolution

After the managed clone is freshened, check for name collisions before creating a branch or PR. This replaces the previous "Check for Existing PR" step.

### Detection

Run these checks in sequence:

**1. Check merged CLIs in managed clone:**

```bash
MERGED_COLLISION="$PREEXISTING_MERGED_COLLISION"
MERGED_PATHS="$PREEXISTING_MERGED_PATHS"
```

Use the pre-package snapshot from Step 5. Do not re-run `ls
"$PUBLISH_REPO_DIR/library"/*/"<api-slug>"` here: Step 6 has already copied the
new package into that path, so a fresh `ls` would make every new print look like
a merged collision. If `MERGED_COLLISION=true`, note the category path from
`MERGED_PATHS`.

**2. Check all open PRs (any author):**

```bash
gh pr list --repo mvanhorn/printing-press-library --head "feat/<api-slug>" --state open --json number,title,url,author
```

If the list is non-empty, record `PR_COLLISION=true`. For each PR, note the PR number, URL, and author login.

**3. Identify own PRs:**

Filter the PR list from step 2 by `--author @me`:

For fork-based PRs, the head includes the username prefix:

```bash
ACCESS=$(jq -r .access "$PUBLISH_CONFIG")
GH_USER=$(jq -r .gh_user "$PUBLISH_CONFIG")

if [ "$ACCESS" = "fork" ]; then
  HEAD_REF="$GH_USER:feat/<api-slug>"
else
  HEAD_REF="feat/<api-slug>"
fi

gh pr list --repo mvanhorn/printing-press-library --head "$HEAD_REF" --state open --author @me --json number,title,url
```

If found, record `OWN_PR=true`, store `EXISTING_PR_NUMBER` and `EXISTING_PR_URL`.

**If no open PR was found**, also check for a previously merged PR on the same branch, by ANY author, not just yours:

```bash
MERGED_PR=$(gh pr list --repo mvanhorn/printing-press-library --head "$HEAD_REF" --state merged --json number --jq '.[0].number' 2>/dev/null)
```

If `MERGED_PR` is non-empty, the branch name was already used and merged. Set `BRANCH_MERGED=true` so Step 8 creates a new branch name (e.g., `feat/<api-slug>-YYYYMMDD`) instead of reusing the merged branch. Do NOT force-push onto a merged branch, `gh pr edit` would silently update a closed PR nobody is watching.

The author-agnostic lookup also catches **squash-zombie branches**: GitHub squash-merge leaves the source branch behind on the remote, with pre-squash commit refs that look "ahead of main" but are content-equivalent to the squash commit. Without this check, the skill misclassifies the zombie as fresh-publish, then `git push -u` fails because the remote branch already exists. Timestamping sidesteps the issue entirely.

### No collision

If no merged CLI exists and no open PRs match (other than your own), set `EXISTING_PR_NUMBER` from the own-PR check (or empty if none) and proceed to Step 8 normally.

If an existing open PR of yours was found, inform the user:
> "Found your open PR #N for `<api-slug>`. Will update it with the new version."

### Collision detected, display info

Show the user what was found:

```
⚠️  Name collision detected for <api-slug>

  Merged: <category>/<api-slug> exists in the library
  Open PR: #<number> by <author>, <url>
```

Show all applicable lines. If `OWN_PR=true`, tag the PR as "(yours)".

### Resolution paths

Present three options via AskUserQuestion:

**If `OWN_PR=true` (your own open PR exists):**
- **Update**, Update your existing PR with the new version (default, preserves current behavior)
- **Alongside**, Rename yours with a qualifier and publish next to the existing one
- **Bail**, Cancel the publish

**If PR collision exists but is another user's, or merged collision only:**
- **Replace**, Intentionally overwrite the existing CLI
- **Alongside**, Rename yours with a qualifier and publish next to the existing one
- **Bail**, Cancel the publish and view the existing CLI/PR

#### Update path (own PR)

This is the existing update flow with a divergence guard. Set
`EXISTING_PR_NUMBER` from the detection step and proceed to Step 8, which
fetches the current PR branch head, checks for branch-only fixes that the new
package would revert, and only then handles force-push and PR description
update.

#### Replace path

**For merged CLIs or your own PR:** Standard confirmation:
> "This will replace the existing `<api-slug>`. Continue?"

**For another user's PR:** Stronger confirmation naming the other author:
> "⚠️  This will replace `<author>`'s `<api-slug>` (PR #N). Are you sure?"

If confirmed:
- The PR description must include: `⚠️ **Replaces existing \`<api-slug>\`**, <reason provided by user or "newer version">`
- Set `EXISTING_PR_NUMBER=""` (create a new PR, don't update theirs)
- Proceed to Step 8 normally

#### Alongside path (rename)

**1. Extract the original API slug** from the manifest's `api_name` field:

```bash
# Read from .printing-press.json in the publish repo's staged CLI
ORIGINAL_API_SLUG=$(cat "$PUBLISH_REPO_DIR/library/<category>/<api-slug>/.printing-press.json" | jq -r '.api_name')
```

**2. Generate rename suggestions** using slug format. Derive the new CLI name from the chosen slug:

- Numeric: `<api-slug>-2` (if that collides, try `-3`, `-4`, etc.)
- Non-numeric: `<api-slug>-alt`
- Custom: prompt the user for a qualifier word

After the user chooses a slug, compute:

```bash
NEW_API_SLUG="<chosen-slug>"
NEW_CLI_NAME="${NEW_API_SLUG}-pp-cli"
```

Present the format to the user:
> "Rename format: `<api-slug>-<qualifier>`. Pick a qualifier:"
>
> 1. `2` → `<api-slug>-2`
> 2. `alt` → `<api-slug>-alt`
> 3. Enter custom qualifier

**3. Verify each suggestion is non-colliding** before presenting:

```bash
# Check merged (read the git tree, not the sparse working dir)
git -C "$PUBLISH_REPO_DIR" ls-tree -r --name-only HEAD \
  | sed -n 's#^\(library/[^/]*/<suggestion>\)/.*#\1#p' | sort -u
# Check open PRs
gh pr list --repo mvanhorn/printing-press-library --head "feat/<suggestion>" --state open --json number
```

If a suggestion collides, skip it or increment the numeric suffix.

**4. Rename the CLI in the publish repo:**

Since Step 6 copied the staged CLI into `$PUBLISH_REPO_DIR`, the rename operates on that directory. Note: `--old-name`/`--new-name` still use CLI-name format (e.g., `dub-pp-cli`) because `RenameCLI` does content replacement, bare slugs would cause collateral damage. The `--dir` path uses the slug-keyed directory.

```bash
cli-printing-press publish rename \
  --dir "$PUBLISH_REPO_DIR/library/<category>/<api-slug>" \
  --old-name <old-cli-name> \
  --new-name "$NEW_CLI_NAME" \
  --json
```

Parse the JSON result. Verify `"success": true`. Note that `new_dir` should now be `$PUBLISH_REPO_DIR/library/<category>/$NEW_API_SLUG`.

**5. Update all downstream references for Step 8:**

- Branch name: `feat/$NEW_API_SLUG` (not the old slug)
- PR title: `feat($NEW_API_SLUG): add $NEW_API_SLUG`
- Commit message: `feat($NEW_API_SLUG): add $NEW_API_SLUG`
- Registry.json entry: `name` → `$NEW_API_SLUG`
- Set `EXISTING_PR_NUMBER=""` (always a new PR for a renamed CLI)

Proceed to Step 8 with the new name.

#### Bail path

Show links to what exists:
- If merged: "Existing CLI at `library/<category>/<api-slug>/`"
- If open PR: "Open PR: <url>"

Exit the publish flow. If Step 6 already wrote files into `$PUBLISH_REPO_DIR`, clean up with `git checkout -- . && git clean -fd` in the managed clone.
