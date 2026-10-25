#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PostToolUse (Write|Edit), the vault index byte cap, checked at WRITE time.
#
# WHY THIS EXISTS
#   MEMORY.md is loaded into the main session prompt whole. Past the cap the harness truncates it,
#   and a truncated index fails SILENTLY: recall simply stops surfacing the tail, and nothing in a
#   session says so. A weekly lint over a file an automated writer grows means days of truncated
#   recall before anyone hears about it. This closes that window to one tool call.
#   The warning band exists because an over-cap test alone fires only after the damage is done:
#   the actionable moment is the write BEFORE the one that overflows.
#
# CONTRACT
#   exit 0, not the index, or the index has comfortable headroom
#   exit 2, over cap, OR inside the warning band: PostToolUse treats stderr as feedback to the
#             model, so the state is named in the same turn as the write.
#   Never blocks, never edits, never deletes. Detection only.
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

CAP="${OPERATOR_MEMORY_CAP:-24400}"
# Headroom below which a write is told to prune first. ~3 index lines.
WARN="${OPERATOR_MEMORY_WARN_BYTES:-500}"
INDEX="${OPERATOR_MEMORY_INDEX:-$(operator_vault)/MEMORY.md}"

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .input.file_path // .file_path // empty' 2>/dev/null)
[ -z "$FILE_PATH" ] && exit 0

# Compare by basename+realpath so a symlinked or relative path still matches.
case "$FILE_PATH" in
  */MEMORY.md|MEMORY.md) : ;;
  *) exit 0 ;;
esac
[ "$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd)/$(basename "$FILE_PATH")" = "$INDEX" ] || exit 0
[ -f "$INDEX" ] || exit 0

BYTES=$(wc -c < "$INDEX" | tr -d ' ')

# The three longest hooks, so the warning is a worklist and not a nag. Byte
# length, not character count, because the cap is in bytes.
longest() {
  awk '{ printf "%d\t%s\n", length($0) + 1, $0 }' "$INDEX" \
    | sort -rn | head -3 \
    | while IFS=$(printf '\t') read -r n line; do
        printf '  %5s B  %s\n' "$n" "$(printf '%s' "$line" | cut -c1-72)"
      done
}

if [ "$BYTES" -gt "$CAP" ]; then
  OVER=$((BYTES - CAP))
  cat >&2 <<EOF
MEMORY.md IS OVER ITS BYTE CAP, the index is truncating on load.

  size  ${BYTES} B
  cap   ${CAP} B
  over  ${OVER} B

Everything past the cap is dropped from every session's context, silently.
Prune hooks now, in this turn: the index holds one line per memory, and a hook
over ~160 chars is the thing to shorten. Detail belongs in the linked note and
in the \`_map.md\` files, never here.

Longest lines, the place to start:
$(longest)

Re-check: wc -c "${INDEX}"
EOF
  exit 2
fi

HEAD=$((CAP - BYTES))
if [ "$HEAD" -le "$WARN" ]; then
  cat >&2 <<EOF
MEMORY.md IS ${HEAD} B FROM TRUNCATING, prune before the next line goes in.

  size     ${BYTES} B
  cap      ${CAP} B
  headroom ${HEAD} B

Past the cap everything below the line is dropped from every session's context,
silently, and no session says so. This fires BEFORE that happens, which is the
only moment it is cheap to fix: the index holds one line per memory, and a hook
over ~160 chars is the thing to shorten. Detail belongs in the linked note and
in the \`_map.md\` files, never here.

Longest lines, the place to start:
$(longest)

Re-check: wc -c "${INDEX}"
EOF
  exit 2
fi
exit 0
