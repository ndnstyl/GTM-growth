> Loaded by SKILL.md for Step 6. Constructs $MODULE_PATH, runs `publish package`, and copies the staged CLI into $PUBLISH_REPO_DIR.
>
> **Cross-reference:** this step (via `publish package`) refuses to package when the Phase 5 acceptance/skip marker's source fingerprint does not match the current CLI tree, see `references/live-gate.md` (Step 4.5), which is what writes that marker. Re-run Step 4.5 after any source edit, before retrying this step.

## Step 6: Package

Read `$PUBLISH_CONFIG` to get `module_path_base`. Construct the full module path using the API slug (not the CLI name):

```
MODULE_PATH="<module_path_base>/<category>/<api-slug>"
```

For example: `github.com/mvanhorn/printing-press-library/library/productivity/notion`

**`--module-path` is required in `--dest` mode.** When packaging with `--dest`,
always pass `--module-path "$MODULE_PATH"`. Omitting it silently skips the
go.mod/import rewrite (`RewriteModulePath` is gated on the flag), so the
packaged CLI keeps `module <cli-name>` and the library CI rejects the PR with a
module-path mismatch. `publish package` verifies the staged tree's module path
after the rewrite and fails packaging when it is not library-canonical (whether
`--module-path` was omitted or set to a non-canonical value). Standalone
`publish validate` on a source tree surfaces the check as a warning, the bare
module name is expected there pre-rewrite; the authoritative failure is in the
package step.

Run `publish package` with `--target` to stage the CLI into a unique temporary
directory, then copy it into the publish repo:

```bash
PUBLISH_STAGING_ROOT="/tmp/printing-press/publish"
mkdir -p "$PUBLISH_STAGING_ROOT"
STAGING_PARENT="$(mktemp -d "$PUBLISH_STAGING_ROOT/<api-slug>-XXXXXX")"
STAGING_DIR="$STAGING_PARENT/package"

cli-printing-press publish package \
  --dir <cli-dir> \
  --category <category> \
  --target "$STAGING_DIR" \
  --module-path "$MODULE_PATH" \
  --json
```

Parse the JSON result. Note the `staged_dir`, `module_path`, `manuscripts_included`, and `run_id`. The `module_path` field confirms the Go module path that was set in the packaged CLI's `go.mod` and import paths.

`publish package` performs the mandatory vendor-prefix secret scan over the staged CLI, including copied manuscripts, before returning success. If it reports `vendor-prefix tokens detected`, stop and remove or redact the reported file:line findings before retrying. This is a hard gate and does not depend on `gitleaks`, `trufflehog`, or destination-repo push protection.

Then copy the staged CLI into the publish repo, replacing any existing version
while preserving the public library's release ledger files when this is a
reprint:

```bash
STAGED_CLI_DIR="$STAGING_DIR/library/<category>/<api-slug>"
DEST_CATEGORY_DIR="$PUBLISH_REPO_DIR/library/<category>"
DEST_CLI_DIR="$DEST_CATEGORY_DIR/<api-slug>"

if [ ! -d "$STAGED_CLI_DIR" ]; then
  echo "missing staged CLI directory: $STAGED_CLI_DIR" >&2
  exit 1
fi
mkdir -p "$DEST_CATEGORY_DIR"

# Preserve release-ledger files from the current public-library entry before
# removing it. New CLIs omit .printing-press-release.json until the library's
# post-merge workflow stamps a real release; reprints keep existing changelog
# history and release metadata until that workflow stamps the next release.
RELEASE_LEDGER_TMP="$(mktemp -d)"
PUBLISH_SWAP_DIR="$(mktemp -d "$DEST_CATEGORY_DIR/.<api-slug>.XXXXXX")"
trap 'rm -rf "$RELEASE_LEDGER_TMP" "$PUBLISH_SWAP_DIR"' EXIT
for LEDGER_FILE in CHANGELOG.md .printing-press-release.json; do
  EXISTING_LEDGER="$(find "$PUBLISH_REPO_DIR/library" -mindepth 3 -maxdepth 3 -path "*/<api-slug>/$LEDGER_FILE" -print -quit)"
  if [ -n "$EXISTING_LEDGER" ]; then
    cp "$EXISTING_LEDGER" "$RELEASE_LEDGER_TMP/$LEDGER_FILE"
  fi
done

# Copy staged CLI into a same-category swap dir before deleting the current
# public-library entry. This keeps a failed copy from leaving the publish repo
# with the old CLI removed.
cp -R "$STAGED_CLI_DIR/." "$PUBLISH_SWAP_DIR/"

for LEDGER_FILE in CHANGELOG.md .printing-press-release.json; do
  if [ -f "$RELEASE_LEDGER_TMP/$LEDGER_FILE" ]; then
    cp "$RELEASE_LEDGER_TMP/$LEDGER_FILE" "$PUBLISH_SWAP_DIR/$LEDGER_FILE"
  fi
done

# Remove existing version (handles category changes), then atomically install
# the prepared replacement within the destination category.
rm -rf "$PUBLISH_REPO_DIR/library"/*/"<api-slug>"
mv "$PUBLISH_SWAP_DIR" "$DEST_CLI_DIR"
rm -rf "$RELEASE_LEDGER_TMP"
trap - EXIT

# Reprints must preserve the base CLI's runtime version declaration layout as
# well as its ledger files. Fresh prints can move `var version = ...` between
# files, but the public library's release-ledger guard rejects those moves in a
# normal publish PR because the post-merge release workflow owns version stamps.
cd "$PUBLISH_REPO_DIR"
VERSION_DECL_BASE_REF=upstream/main
if ! git rev-parse --verify --quiet "$VERSION_DECL_BASE_REF" >/dev/null; then
  VERSION_DECL_BASE_REF=origin/main
fi
VERSION_DECL_DIFF="$(git diff --unified=0 "$VERSION_DECL_BASE_REF" -- \
  "library/*/<api-slug>/internal/cli/root.go" \
  "library/*/<api-slug>/internal/cli/version.go" \
  "library/*/<api-slug>/cmd/<api-slug>-pp-mcp/main.go")" || {
  echo "failed to compare runtime version declarations with ${VERSION_DECL_BASE_REF}" >&2
  exit 1
}
printf '%s\n' "$VERSION_DECL_DIFF" \
  | grep -E '^[+-][[:space:]]*var version[[:space:]]*=' || true

# If the command prints a change, reconcile the replacement to the base tree:
# - A root.go declaration stays in root.go with the exact stamped value; remove
#   only the duplicate declaration from version.go and keep its command code.
# - A version.go declaration stays in version.go with the exact stamped value;
#   remove any fresh declaration added elsewhere in the internal CLI package.
# - An MCP main declaration stays in MCP main with the exact stamped value. If
#   the base MCP main hardcodes the version instead, preserve that expression.
# - If the base has no declaration in one of these runtime surfaces, preserve
#   that no declaration layout and its existing literal/reference form. Do not
#   introduce the fresh print's 0.0.0-dev declaration.
# Re-run the diff command after editing. Do not continue until the command prints no matching lines.

# Remove root-level binaries (should not be committed). publish package
# already strips these before the copy; this rm -f is belt-and-suspenders
# for the agent path. Cover the names local build paths can drop: bare slug,
# CLI binary, live-dogfood probe binary, and MCP peer.
rm -f "$PUBLISH_REPO_DIR/library/<category>/<api-slug>/<api-slug>" \
      "$PUBLISH_REPO_DIR/library/<category>/<api-slug>/<cli-name>" \
      "$PUBLISH_REPO_DIR/library/<category>/<api-slug>/<cli-name>-dogfood" \
      "$PUBLISH_REPO_DIR/library/<category>/<api-slug>/<api-slug>-pp-mcp"

# Defense-in-depth: validate printer attribution before README and registry surfaces.
PRINTER=$(jq -r '.printer // ""' "$PUBLISH_REPO_DIR/library/<category>/<api-slug>/.printing-press.json")
PRINTER_NAME=$(jq -r '.printer_name // ""' "$PUBLISH_REPO_DIR/library/<category>/<api-slug>/.printing-press.json")
if [ -z "$PRINTER" ]; then
  echo "ERROR: manifest .printer is empty. Set 'git config --global github.user <your-handle>' and re-print before publishing."
  exit 1
fi
if [ "$PRINTER" = "USER" ] || [ "$PRINTER" = "user" ]; then
  echo "ERROR: manifest .printer is the literal sentinel \"$PRINTER\" (git config github.user was unset at print time). Set it and re-print before publishing."
  exit 1
fi
if [ -z "$PRINTER_NAME" ]; then
  echo "ERROR: manifest .printer_name is empty. Set 'git config --global user.name <your display name>' and re-print before publishing."
  exit 1
fi

# Do NOT regenerate or commit `cli-skills/pp-<api-slug>/SKILL.md` or
# `registry.json` here. Both are regenerated post-merge by the library's
# `generate-skills.yml` and `generate-registry.yml` workflows via
# `[skip ci]` bot commits. The library's `Fail on changes to generated
# artifacts` check in `verify-library-conventions.yml` hard-fails any PR
# whose diff against base touches these files, regardless of fork vs
# same-repo origin. The library no longer has an in-PR auto-fix path;
# do not re-introduce a mirror or registry regen here. Also do NOT hand-update
# CHANGELOG.md, .printing-press-release.json, or runtime version strings for
# release accounting; the library release-ledger workflow owns those post-merge.

# Verify this changed/new CLI builds and has no reachable Go vulnerabilities from the publish repo
cd "$PUBLISH_REPO_DIR/library/<category>/<api-slug>" \
  && go build ./... \
  && go run golang.org/x/vuln/cmd/govulncheck@v1.3.0 ./...
```

Keep vulnerability verification scoped to `library/<category>/<api-slug>` in
publish PRs. The public library is a historical collection and cannot be kept
fully current on every unrelated PR; whole-library govulncheck sweeps belong in
a scheduled/reporting workflow, while blocking CI should scan only added or
changed CLI modules.

After the publish repo copy and build verification are complete, remove the staging
directory:

```bash
rm -rf "$STAGING_PARENT"
```

Note: `staged_dir` is keyed by the API slug (e.g., `espn`), matching the publish repo's directory layout. The copy step is a same-name copy, not a rename.
