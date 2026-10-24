<!-- contents:start -->
## Contents

- [Setup](#setup)
- [Configuration](#configuration)
  - [Publish config](#publish-config)
  - [Scoped clone cleanup](#scoped-clone-cleanup)
<!-- contents:end -->

> Loaded by SKILL.md before Step 1. Establishes $PRINTING_PRESS_BIN, $PRESS_HOME, $PRESS_LIBRARY, $PRESS_MANUSCRIPTS, $PUBLISH_REPO_DIR, $PUBLISH_REPO_URL, $PUBLISH_CONFIG for every later step.

## Setup

Before doing anything else:

<!-- PRESS_SETUP_CONTRACT_START -->
```bash
# min-binary-version: 4.0.0

# Derive scope first, needed for local build detection
_scope_dir="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
_scope_dir="$(cd "$_scope_dir" && pwd -P)"

# Prefer local build when running from inside the printing-press repo.
_press_repo=false
if [ -x "$_scope_dir/cli-printing-press" ] && [ -d "$_scope_dir/cmd/cli-printing-press" ]; then
  _press_repo=true
  export PATH="$_scope_dir:$PATH"
  echo "Using local build: $_scope_dir/cli-printing-press"
elif ! command -v cli-printing-press >/dev/null 2>&1; then
  if [ -x "$HOME/go/bin/cli-printing-press" ]; then
    echo "cli-printing-press found at ~/go/bin/cli-printing-press but not on PATH."
    echo "Add GOPATH/bin to your PATH:  export PATH=\"\$HOME/go/bin:\$PATH\""
  else
    echo "cli-printing-press binary not found."
    echo "Install with:  go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@latest"
  fi
  return 1 2>/dev/null || exit 1
fi

# Resolve and emit the absolute path the agent must use for every later
# `cli-printing-press` invocation. `export PATH` above only affects this one
# Bash tool call; subsequent calls open a fresh shell and resolve bare
# `cli-printing-press` against the user's default PATH, where a stale global
# can silently shadow the local build. The agent captures this marker and
# substitutes the absolute path into every later invocation.
if [ "$_press_repo" = "true" ]; then
  PRINTING_PRESS_BIN="$_scope_dir/cli-printing-press"
else
  PRINTING_PRESS_BIN="$(command -v cli-printing-press 2>/dev/null || true)"
fi
if ! command -v go >/dev/null 2>&1; then
  echo ""
  echo "[setup-error] Go toolchain not found."
  echo ""
  echo "This Printing Press flow runs Go-based build or validation commands."
  echo "Install Go 1.26.6 or newer from https://go.dev/dl/, then verify with:"
  echo "  go version"
  echo "Then re-run this skill."
  echo ""
  return 1 2>/dev/null || exit 1
fi
echo "PRINTING_PRESS_BIN=$PRINTING_PRESS_BIN"

_pp_semver_lt() {
  if [ -z "${PP_SEMVER_A:-}" ] || [ -z "${PP_SEMVER_B:-}" ]; then
    echo "[setup-error] semver comparison inputs are missing." >&2
    return 2
  fi
  awk -v a="${PP_SEMVER_A:-}" -v b="${PP_SEMVER_B:-}" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) {
      if ((x[i] + 0) < (y[i] + 0)) exit 0
      if ((x[i] + 0) > (y[i] + 0)) exit 1
    }
    exit 1
  }'
}

_pp_go_version_norm() {
  printf '%s\n' "${PP_GO_VERSION_INPUT:-}" | sed -nE 's/.*go([0-9]+)\.([0-9]+)(\.([0-9]+))?.*/\1.\2.\4/p' | sed -E 's/\.$/.0/'
}

_pp_check_go_currency() {
  _pp_go_installed="$(PP_GO_VERSION_INPUT="$(go env GOVERSION 2>/dev/null)" _pp_go_version_norm)"
  _pp_go_required="$(PP_GO_VERSION_INPUT="$(go version "$PRINTING_PRESS_BIN" 2>/dev/null)" _pp_go_version_norm)"
  PP_SEMVER_A="$_pp_go_installed"
  PP_SEMVER_B="$_pp_go_required"
  if [ -z "$_pp_go_installed" ] || [ -z "$_pp_go_required" ] || ! _pp_semver_lt; then
    return 0
  fi

  echo ""
  if [ "${GOTOOLCHAIN:-auto}" = "local" ]; then
    echo "[setup-error] Go $_pp_go_required or newer is required by this cli-printing-press binary (installed: $_pp_go_installed)."
    echo "GOTOOLCHAIN=local disables automatic toolchain downloads, so later Go quality gates would fail."
    echo "Install Go $_pp_go_required or newer from https://go.dev/dl/, or unset GOTOOLCHAIN."
    echo ""
    return 1
  fi

  echo "[go-toolchain-old] Go $_pp_go_required or newer is required by this cli-printing-press binary (installed: $_pp_go_installed)."
  echo "PRESS_GO_INSTALLED=$_pp_go_installed"
  echo "PRESS_GO_REQUIRED=$_pp_go_required"
  echo "Default GOTOOLCHAIN behavior may download the required toolchain during Go commands."
  echo ""
  return 0
}
_pp_check_go_currency || { return 1 2>/dev/null || exit 1; }

PRESS_BASE="$(basename "$_scope_dir" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]/-/g; s/^-+//; s/-+$//')"
if [ -z "$PRESS_BASE" ]; then
  PRESS_BASE="workspace"
fi

PRESS_SCOPE="$PRESS_BASE-$(printf '%s' "$_scope_dir" | shasum -a 256 | cut -c1-8)"
PRESS_HOME="${PRINTING_PRESS_HOME:-$HOME/printing-press}"
PRESS_RUNSTATE="$PRESS_HOME/.runstate/$PRESS_SCOPE"
PRESS_LIBRARY="$PRESS_HOME/library"
PRESS_MANUSCRIPTS="$PRESS_HOME/manuscripts"
PRESS_CURRENT="$PRESS_RUNSTATE/current"

_pp_check_disk_space() {
  _pp_disk_warn_kb="${PRINTING_PRESS_DISK_WARN_KB:-3145728}"
  _pp_disk_fail_kb="${PRINTING_PRESS_DISK_FAIL_KB:-524288}"
  case "$_pp_disk_warn_kb$_pp_disk_fail_kb" in
    ""|*[!0-9]*) return 0 ;;
  esac

  _pp_disk_path="$PRESS_HOME"
  while [ ! -e "$_pp_disk_path" ] && [ "$_pp_disk_path" != "/" ]; do
    _pp_disk_path="$(dirname "$_pp_disk_path")"
  done

  _pp_disk_avail_kb="$(df -Pk "$_pp_disk_path" 2>/dev/null | awk 'BEGIN {
    if ((getline header) <= 0 || (getline record) <= 0) exit
    field_count = split(record, fields)
    if (field_count >= 4) print fields[4]
  }')"
  case "$_pp_disk_avail_kb" in
    ""|*[!0-9]*) return 0 ;;
  esac

  if [ "$_pp_disk_avail_kb" -lt "$_pp_disk_fail_kb" ]; then
    echo ""
    echo "[setup-error] Critically low disk space on the Printing Press workspace volume."
    echo "PRESS_DISK_PATH=$_pp_disk_path"
    echo "PRESS_DISK_AVAIL_KB=$_pp_disk_avail_kb"
    echo "PRESS_DISK_FAIL_KB=$_pp_disk_fail_kb"
    echo "Free disk space or set PRINTING_PRESS_HOME to a volume with more room, then re-run this skill."
    echo ""
    return 1
  fi

  if [ "$_pp_disk_avail_kb" -lt "$_pp_disk_warn_kb" ]; then
    echo ""
    echo "[low-disk] Printing Press workspace volume is low on free space."
    echo "PRESS_DISK_PATH=$_pp_disk_path"
    echo "PRESS_DISK_AVAIL_KB=$_pp_disk_avail_kb"
    echo "PRESS_DISK_WARN_KB=$_pp_disk_warn_kb"
    echo "This flow may need several GiB for generated files, Go build cache, module downloads, or repository clones."
    echo ""
  fi
}
_pp_check_disk_space || { return 1 2>/dev/null || exit 1; }

mkdir -p "$PRESS_RUNSTATE" "$PRESS_LIBRARY" "$PRESS_MANUSCRIPTS" "$PRESS_CURRENT"
```
<!-- PRESS_SETUP_CONTRACT_END -->

After running the setup contract, capture the `PRINTING_PRESS_BIN=<abs-path>` line from stdout. **Every subsequent `cli-printing-press ...` invocation in this skill must use that absolute path** (substitute the value, not the literal `$PRINTING_PRESS_BIN` token), `export PATH` above only affects the single Bash tool call it runs in, so later calls open a fresh shell where bare `cli-printing-press` resolves against the user's default `PATH` and a stale global can shadow the local build.

If setup emitted `[go-toolchain-old]` or `[low-disk]`, surface the advisory to the user and continue unless setup also emitted `[setup-error]`. `[go-toolchain-old]` means later Go commands may download the required toolchain or fail when downloads are blocked; `[low-disk]` means this run may need several GiB for generated files, Go build cache, module downloads, or repository clones.

After capturing the binary path, check binary version compatibility. Read the `min-binary-version` field from this skill's YAML frontmatter. Run `<PRINTING_PRESS_BIN> version --json` and parse the version from the output. Compare it to `min-binary-version` using semver rules. If the installed binary is older than the minimum, stop immediately and tell the user: "cli-printing-press binary vX.Y.Z is older than the minimum required vA.B.C. Run `go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@latest` to update."

## Configuration

```
PUBLISH_REPO_URL="https://github.com/mvanhorn/printing-press-library"
PUBLISH_REPO_DIR="$PRESS_HOME/.publish-repo-$PRESS_SCOPE"
PUBLISH_CONFIG="$PRESS_HOME/.publish-config-$PRESS_SCOPE.json"
```

### Publish config

`$PUBLISH_CONFIG` stores persistent publish settings as JSON. On first publish, create it with defaults. The user can edit it to change the library repo or module path base.

```json
{
  "managed_by": "printing-press-publish",
  "repo_url": "https://github.com/mvanhorn/printing-press-library",
  "access": "push",
  "protocol": "ssh",
  "clone_path": "<home>/printing-press/.publish-repo-<scope>",
  "scope_dir": "/absolute/path/to/source/worktree",
  "module_path_base": "github.com/mvanhorn/printing-press-library/library"
}
```

The `module_path_base` field sets the Go module path prefix for published CLIs. During packaging, the full module path is constructed as `<module_path_base>/<category>/<api-slug>`. If the user wants CLIs published to a different repo or path, they edit this field.
Store expanded absolute paths for `clone_path` and `scope_dir` so cleanup can
check them without relying on shell-specific `~` expansion. The `managed_by`
field is required before cleanup may delete anything.

### Scoped clone cleanup

Before creating or reusing `$PUBLISH_REPO_DIR`, prune scoped publish clones whose
source worktree no longer exists. This keeps concurrent worktrees isolated
without accumulating one library clone forever per short-lived worktree.

```bash
find "$PRESS_HOME" -maxdepth 1 -name '.publish-config-*.json' -type f | while read -r cfg; do
  [ "$cfg" = "$PUBLISH_CONFIG" ] && continue
  managed_by=$(jq -r '.managed_by // empty' "$cfg" 2>/dev/null || true)
  scope_dir=$(jq -r '.scope_dir // empty' "$cfg" 2>/dev/null || true)
  clone_path=$(jq -r '.clone_path // empty' "$cfg" 2>/dev/null || true)
  [ "$managed_by" = "printing-press-publish" ] || continue
  [ -z "$scope_dir" ] && continue
  [ -e "$scope_dir" ] && continue
  [ -d "$clone_path/.git" ] || continue
  case "$clone_path" in "$PRESS_HOME"/.publish-repo-*) ;; *) continue ;; esac
  origin=$(git -C "$clone_path" remote get-url origin 2>/dev/null || true)
  case "$origin" in *mvanhorn/printing-press-library*|*/*/printing-press-library*) ;; *) continue ;; esac
  [ -z "$(git -C "$clone_path" status --porcelain)" ] || continue
  [ "$(git -C "$clone_path" rev-parse --abbrev-ref HEAD 2>/dev/null || true)" = "main" ] || continue
  rm -rf "$clone_path" "$cfg"
done
```
