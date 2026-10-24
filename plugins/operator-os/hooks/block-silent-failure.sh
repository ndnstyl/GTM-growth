#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PreToolUse hook for Write|Edit: refuse a NEW silent-failure site in code.
# Exit 0 = allow, Exit 2 = block.
#
# THE RULE: loud failure is implemented in anything that can break (transfer, lookup, call,
# tool use, handoff, skill load, dismount, credential need). Nothing fails silently.
# Rule: rules/loud-failure.md in this plugin.
#
# SCANNER: if the project ships its own register scanner at scripts/ops/loudfail/audit.py this hook
# uses it (`--scan-stdin <lang> <path>`); otherwise it uses the plugin's built-in scanner
# (loudfail_scan.py: bare except, swallowed exception, `|| true`, exemption without a reason).
# An in-line `# loud-failure-exempt: <reason>` on the offending line passes; the same marker with
# no reason is ITSELF a violation and still blocks.
#
# WHAT IT ALLOWS: vendor trees (.venv, node_modules, vendor/), documentation (.md/.txt/.rst),
# non-code file types.

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }

FILE_PATH=$(tool_file_path)
[ -z "$FILE_PATH" ] && exit 0

# Only Python and shell are in scan scope.
SCAN_LANG=""
case "$FILE_PATH" in
  *.py) SCAN_LANG="py" ;;
  *.sh) SCAN_LANG="sh" ;;
  *) exit 0 ;;
esac

# Vendor / generated trees are never in scope.
case "$FILE_PATH" in
  */.venv/*|*/node_modules/*|*/vendor/*|*/__pycache__/*) exit 0 ;;
esac

HOOKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
AUDIT="$PROJ/scripts/ops/loudfail/audit.py"
SCAN=("$HOOKDIR/loudfail_scan.py" "$SCAN_LANG")
if [ -f "$AUDIT" ]; then SCAN=("$AUDIT" --scan-stdin "$SCAN_LANG"); fi
PYBIN="python3"
if ! command -v python3 >/dev/null 2>&1; then
  echo "operator-os: block-silent-failure not configured: python3 not found, hook skipped" >&2
  exit 0
fi

# Scan the file as it WILL BE, not the fragment being pasted in (see loudfail_merge.py).
MERGE="$HOOKDIR/loudfail_merge.py"
CONTENT=$(printf '%s' "$INPUT" | "$PYBIN" "$MERGE" "$FILE_PATH") || deny "loud-failure hook could not merge the edit for $FILE_PATH; refusing rather than waving it through"
[ -z "$CONTENT" ] && exit 0

REL_PATH="$FILE_PATH"
case "$REL_PATH" in
  "$PROJ"/*) REL_PATH="${REL_PATH#"$PROJ"/}" ;;
esac

RC=0
FINDINGS=$(printf '%s' "$CONTENT" | "$PYBIN" "${SCAN[@]}" "$REL_PATH") || RC=$?

if [ "$RC" -eq 2 ]; then
  # The scanner itself could not run (bad args, broken interpreter). A gate
  # that cannot evaluate is not a pass; refuse loud rather than wave it
  # through, per this same rule.
  deny "Loud-failure hook could not run its scanner against $REL_PATH (the scanner exited 2). Fix the scanner or its interpreter before this write proceeds; it does not get waved through silently."
fi

if [ "$RC" -eq 1 ]; then
  SUMMARY=$(printf '%s' "$FINDINGS" | jq -r '[.[] | "\(.line): \(.pattern), \(.detail)"] | join(" | ")' 2>/dev/null)
  [ -z "$SUMMARY" ] && SUMMARY="$FINDINGS"
  deny "Loud-Failure Law: nothing should fail silently. This write introduces a new silent-failure site in $REL_PATH: $SUMMARY. Fix it: raise a named error, write a visible refused/held state, or emit an alert-sink row, never a swallowed exception, a default on a required value, '|| true', a discarded stderr, or an unbounded wait. If this is a ruled, documented exception, mark the exact line \`# loud-failure-exempt: <reason>\` (a marker with no reason is itself a violation). Rule: rules/loud-failure.md in the operator-os plugin."
fi

exit 0
