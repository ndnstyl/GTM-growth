#!/bin/bash
set -euo pipefail
# PreToolUse hook for Write|Edit|Bash: refuse the write that gives a second spec directory a number
# another spec directory already holds (specs/NNN-name). Exit 0 = allow, exit 2 = block.
#
# Two specs should not have the same number. The check is self-contained: for a path under
# specs/NNN-<name>, any existing directory specs/NNN-* with a different name is a collision.
# Projects that do not use numbered specs are never affected (the hook only reads specs/NNN- paths).

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }  # loud-failure-exempt: the || branch denies with a named reason
PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"

TOOL=$(tool_name)
case "$TOOL" in
  Write|Edit) paths=$(tool_file_path) ;;
  Bash)
    cmd=$(tool_command)
    # only commands that can create a directory or file: mkdir, mv, cp, tee, touch, or a redirect
    # a redirect is a bare > that is not part of -> or =>, and not the close of an <email@address> or <tag>
    bare=$(printf '%s' "$cmd" | sed -E 's/<[^<>[:space:]]+>//g')
    if printf '%s' "$bare" | grep -qE '(^|[;&|[:space:]])(mkdir|mv|cp|tee|touch)[[:space:]]|(^|[^-=>])>'; then
      rc=0; paths=$(printf '%s' "$cmd" | grep -oE '(^|[^A-Za-z0-9_])specs/[0-9]{3}-[A-Za-z0-9][A-Za-z0-9._-]*' | sed -E 's#^[^s]*##') || rc=$?
      [ "$rc" -le 1 ] || deny "block-duplicate-spec-number: grep failed rc=$rc scanning the command"
    else
      exit 0
    fi ;;
  *) exit 0 ;;
esac
[ -n "${paths:-}" ] || exit 0

while IFS= read -r p; do
  [ -n "$p" ] || continue
  rel=$(printf '%s' "$p" | grep -oE 'specs/[0-9]{3}-[A-Za-z0-9][A-Za-z0-9._-]*' | head -1) || rel=""
  [ -n "$rel" ] || continue
  dirname_=${rel#specs/}
  num=${dirname_%%-*}
  for existing in "$PROJ"/specs/"$num"-*; do
    [ -d "$existing" ] || continue
    if [ "$(basename "$existing")" != "$dirname_" ]; then
      deny "spec number $num is already held by specs/$(basename "$existing"); $dirname_ would be a second spec with the same number. Pick the next free number."
    fi
  done
done <<< "$paths"
exit 0
