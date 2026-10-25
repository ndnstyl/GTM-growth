#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PreToolUse hook: block SILENTLY-BLIND recursive greps.
# Exit 0 = allow, Exit 2 = block (with JSON permissionDecision payload)
#
# WHY
#   In some Claude Code shells `grep` is a shadowed ugrep that is GITIGNORE-AWARE. A repo-root
#   `grep -r` then goes blind to anything .gitignore excludes (embedded git repos, build output,
#   vendored trees). It returns EXIT 0 WITH NO ERROR, so it fails silently and in the direction that
#   MANUFACTURES FALSE NOVELTY ("this identifier appears nowhere in our records" when it does).
#   `rg` and the Grep tool are NOT affected. Only the Bash `grep` is.
#
# THE CONTRACT: any recursive grep must declare its scope choice explicitly, either by disabling
# ignore-awareness or by using an unwrapped binary.

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }
COMMAND=$(tool_command)

[ -z "$COMMAND" ] && exit 0

# Already safe? Any of these makes the scope explicit.
#   /usr/bin/grep  = unwrapped BSD grep, never ignore-aware
#   --no-ignore-files = ugrep flag that disables .gitignore handling
#   rg / ripgrep   = different engine, not affected
if echo "$COMMAND" | /usr/bin/grep -Eq '(/usr/bin/grep|--no-ignore-files|\brg\b|ripgrep)'; then
  exit 0
fi

# Detect a RECURSIVE grep: `grep` followed by a flag cluster containing r or R.
# Matches -r, -R, -rl, -rn, -ril, -rIl, --recursive. Ignores non-recursive greps
# (the common `| grep foo` pipe case), which are unaffected by this defect.
if echo "$COMMAND" | /usr/bin/grep -Eq '(^|[|;&[:space:]])grep[[:space:]]+(-[A-Za-z]*[rR][A-Za-z]*|--recursive)([[:space:]]|$)'; then
  deny "Blind recursive grep. The harness shell grep can be gitignore-aware and CANNOT see gitignored trees (embedded repos, build output). It returns 0 hits with exit 0 and no error, so a zero result is NOT evidence of absence. Re-run one of: (1) /usr/bin/grep -r '<pattern>' .  [unwrapped, sees everything], (2) grep -r --no-ignore-files '<pattern>' .  [keeps ugrep, disables ignore], or (3) rg / the Grep tool. Never conclude 'appears nowhere' from a bare recursive grep."
fi

exit 0
