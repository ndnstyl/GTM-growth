#!/usr/bin/env bash
# Pre-commit hook: block commits containing common secret patterns.
# Install: ln -sf <plugin>/hooks/pre-commit-secret-scan.sh .git/hooks/pre-commit
# Or copy it into your project's hooks folder and set: git config core.hooksPath <that folder>
#
# Reads the shared secret-patterns.txt beside this file (also read by governance-egress-guard.sh and
# scrub-transcripts.py) plus a few format-specific patterns, then optionally runs gitleaks when the
# project pins one (scripts/ops/secret-scan/GITLEAKS_VERSION + .gitleaks.toml); otherwise it prints
# a single "not configured" line for that stage.

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
if [ -z "$STAGED" ]; then
  exit 0
fi

FINDINGS=""
check() {
  local pattern="$1"
  local label="$2"
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    # Skip binary, examples, templates, hooks themselves
    case "$file" in
      *.env.example|*.env.template|*/hooks/*) continue ;;
    esac
    if ! [ -f "$file" ]; then continue; fi
    # Binary check: skip
    if file "$file" 2>/dev/null | grep -q 'binary\|image\|pdf\|archive\|executable'; then  # loud-failure-exempt: a failed `file` call reads as "not binary" and the line still runs through the scanner below; worst case an extra harmless scan of a binary, never a skipped text file that could hold a secret
      continue
    fi
    # Mask embedded image data-URI base64 payloads before scanning: a PNG/WEBP/JPEG/GIF/SVG data URI
    # is multiple KB of high-entropy base64, and short literal-prefix patterns turn up inside that
    # run by chance. Scoped to the declared image mime type only: an arbitrary base64 blob elsewhere,
    # or a real credential on the same line as one of these data URIs, is still scanned and caught.
    if ! _scan_text="$(sed -E 's#(data:image/(png|jpe?g|gif|webp|svg\+xml);base64,)[A-Za-z0-9+/=]+#\1[IMAGE_DATA_MASKED_FOR_SECRET_SCAN]#g' "$file")"; then
      # loud-failure-exempt: a failed mask pass falls back to the raw file so the scan still runs;
      # the worst case is the base64 false positive this stage exists to remove reappearing, never
      # a file going unscanned.
      _scan_text="$(<"$file")"
    fi
    if matches=$(printf '%s\n' "$_scan_text" | grep -nE -e "$pattern"); then
      FINDINGS="${FINDINGS}
${label} in $file:
$matches"
    fi
  done <<< "$STAGED"
}

# Patterns not carried by the shared list (org-specific / format-specific).
check 'ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}' 'GitHub PAT'
check 'xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}' 'Slack bot token'
check 'xoxp-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{10,}' 'Slack user token'
check 'pat[A-Za-z0-9]{14}\.[a-f0-9]{64}' 'Airtable PAT'
check 'serpapi.com/search.*api_key=[a-f0-9]{32,}' 'SerpApi key (URL)'

# Shared list, read from secret-patterns.txt. Same file governance-egress-guard.sh reads.
# Resolve the REAL script location: .git/hooks/pre-commit is a symlink to this
# file, and dirname of the symlink is .git/hooks (the pattern file is not there).
_HOOK_REAL="$(python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}" 2>/dev/null || readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"  # loud-failure-exempt: each `||` is a named fallback resolver ending in the unresolved path literal; a path this cannot resolve still reaches the next block's file-exists check and refuses loud there
PATTERNS_FILE="$(dirname "$_HOOK_REAL")/secret-patterns.txt"
[ -f "$PATTERNS_FILE" ] || PATTERNS_FILE="${CLAUDE_PLUGIN_ROOT:-.}/hooks/secret-patterns.txt"  # loud-failure-exempt: outside a repo this falls back to the known checkout path; if neither location has the file the next block refuses loud and names the missing path
if [ -f "$PATTERNS_FILE" ]; then
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in \#*) continue ;; esac
    check "$p" 'secret pattern'
  done < "$PATTERNS_FILE"
else
  # A missing patterns file would silently disable the whole shared-pattern half of this scan.
  # A blocking scan that goes quiet is worse than one that fails loud: refuse the commit and say
  # why, rather than let it through unscanned.
  echo "==============================================================" >&2
  echo " SECRET SCAN DISABLED, $PATTERNS_FILE is missing; commit BLOCKED" >&2
  echo "==============================================================" >&2
  echo "The shared pattern list (AIza/sk-/sk-ant-/private-key/JWT/etc.) could" >&2
  echo "not be read, so this scan cannot certify the commit is clean. Restore" >&2
  echo "hooks/secret-patterns.txt (in the operator-os plugin), or override only if you have" >&2
  echo "verified the staged diff by hand:  git commit --no-verify" >&2
  exit 1
fi

# SerpApi keys in isolation (64 hex), only flag if context mentions serpapi
for file in $STAGED; do
  [ -f "$file" ] || continue
  if file "$file" 2>/dev/null | grep -q 'binary\|image\|pdf\|archive\|executable'; then continue; fi  # loud-failure-exempt: a failed `file` call reads as "not binary" and the line still runs through the two scans below; worst case an extra harmless scan, never a skipped text file
  if grep -qi 'serpapi' "$file" 2>/dev/null && grep -qE '\b[a-f0-9]{64}\b' "$file" 2>/dev/null; then  # loud-failure-exempt: a read error on either side of the && reads as "no match" for this narrow SerpApi-context check only; the checks above already scanned this same file and still gate the commit
    FINDINGS="${FINDINGS}
SerpApi-context 64-hex token in $file"
  fi
done

if [ -n "$FINDINGS" ]; then
  echo "==============================================================" >&2
  echo " SECRET DETECTED IN STAGED CHANGES, commit BLOCKED" >&2
  echo "==============================================================" >&2
  echo "$FINDINGS" >&2
  echo "" >&2
  echo "Fix: move the secret to ~/.claude/.mcp.json or a .gitignored .env" >&2
  echo "     and read via env var. Then re-stage." >&2
  echo "" >&2
  echo "Override (emergency, not recommended):  git commit --no-verify" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Stage 2: run the same scanner CI runs (gitleaks) on the staged diff, when the project pins it.
# Loud failure, deliberately: a missing or mismatched gitleaks REFUSES the commit once the project
# has pinned a version. A project with no pin gets one "not configured" line.
# ---------------------------------------------------------------------------
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"  # loud-failure-exempt: outside a repo this falls back to the current directory
GL_VERSION_FILE="$REPO_ROOT/scripts/ops/secret-scan/GITLEAKS_VERSION"
GL_CONFIG="$REPO_ROOT/.gitleaks.toml"

if [ -f "$GL_VERSION_FILE" ] && [ -f "$GL_CONFIG" ]; then
  GL_WANT="$(tr -d ' \r\n' < "$GL_VERSION_FILE")"
  # Resolve the binary ourselves rather than trusting PATH: a gate that depends on each
  # machine's shell profile is a gate that breaks per machine.
  GL_BIN="$(command -v gitleaks 2>/dev/null || true)"  # loud-failure-exempt: a failed lookup leaves GL_BIN empty, which the next block checks for and refuses loud by name ("GITLEAKS NOT INSTALLED"), never a silent pass
  if [ -z "$GL_BIN" ]; then
    for _c in "$HOME/.local/bin/gitleaks" /usr/local/bin/gitleaks /opt/homebrew/bin/gitleaks; do
      [ -x "$_c" ] && { GL_BIN="$_c"; break; }
    done
  fi
  if [ -z "$GL_BIN" ]; then  # loud-failure-exempt: this branch IS the named, visible refusal for a missing gitleaks binary (the echo block below plus exit 1), not a silent path
    echo "==============================================================" >&2
    echo " GITLEAKS NOT INSTALLED, commit BLOCKED" >&2
    echo "==============================================================" >&2
    echo "CI runs gitleaks $GL_WANT on every push. Without it here, a finding" >&2
    echo "it makes cannot be seen until CI goes red and emails you." >&2
    echo "" >&2
    echo "Fix:  install gitleaks $GL_WANT (https://github.com/gitleaks/gitleaks)" >&2
    echo "" >&2
    echo "Override (emergency, not recommended):  git commit --no-verify" >&2
    exit 1
  fi
  GL_HAVE="$("$GL_BIN" version 2>/dev/null | tr -d ' \r\n' || true)"  # loud-failure-exempt: a failed version read leaves GL_HAVE empty, which the very next check compares against GL_WANT and refuses loud on a mismatch (empty never equals the pinned version), never a silent pass
  if [ "$GL_HAVE" != "$GL_WANT" ]; then
    echo "==============================================================" >&2
    echo " GITLEAKS VERSION MISMATCH, commit BLOCKED" >&2
    echo "==============================================================" >&2
    echo "installed: ${GL_HAVE:-unknown}   CI pin: $GL_WANT" >&2
    echo "Different versions means this gate and CI can disagree, which is the" >&2
    echo "exact drift this pin exists to prevent." >&2
    echo "" >&2
    echo "Fix:  install gitleaks $GL_WANT (https://github.com/gitleaks/gitleaks)" >&2
    exit 1
  fi

  GL_OUT="$(mktemp)"
  if ! "$GL_BIN" git --staged --no-banner --redact --config "$GL_CONFIG" "$REPO_ROOT" >"$GL_OUT" 2>&1; then
    echo "==============================================================" >&2
    echo " GITLEAKS FLAGGED THE STAGED DIFF, commit BLOCKED" >&2
    echo "==============================================================" >&2
    cat "$GL_OUT" >&2
    echo "" >&2
    echo "This is the same check CI runs. Handle it HERE, not after the push:" >&2
    echo "  - a real credential: take it out, move it to the Keychain or a" >&2
    echo "    gitignored env file, re-stage." >&2
    echo "  - a false positive: the operator rules the allowlist entry in .gitleaks.toml," >&2
    echo "    with the evidence written beside it. An agent does not make that call." >&2
    echo "" >&2
    echo "Override (emergency, not recommended):  git commit --no-verify" >&2
    rm -f "$GL_OUT"
    exit 1
  fi
  rm -f "$GL_OUT"
else
  echo "operator-os: gitleaks stage not configured (no scripts/ops/secret-scan/GITLEAKS_VERSION + .gitleaks.toml); pattern scan only" >&2
fi

exit 0
