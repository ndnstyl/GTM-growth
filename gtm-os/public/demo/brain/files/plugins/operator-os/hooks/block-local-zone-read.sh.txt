#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PreToolUse, WALL for the local-only zone (default folder name: .local-only; override with
# OPERATOR_LOCAL_ZONE, a regex fragment).
# HARD BLOCK: Claude's cloud context must never read raw contents of the zone. Denies Read/Grep on the
# zone and common Bash read verbs that target it. The sanctioned reader is the on-device local lane
# (a local-model script such as governance/local-ask.sh, or the handoff skill), which is exempt ONLY
# when the whole command is that one tool invocation.
# No zone folder in the project = the hook matches nothing and is inert.
#
# Read/Grep are scoped to tool_input.file_path / tool_input.path only.
# Exit 0 = allow. Exit 2 + deny JSON = block.
set -euo pipefail

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
if [ ! -f "$LIB" ]; then
  echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'
  exit 2
fi
# shellcheck disable=SC1090
source "$LIB"
TOOL=$(tool_name)
[ -z "$TOOL" ] && exit 0

ZONE_NAME="${OPERATOR_LOCAL_ZONE:-\.local-only}"
ZONE_RE="${ZONE_NAME}(/|\$|[\"' ])"

REDIRECT="Path is inside the local-only zone. Claude may not read its contents. Route through the on-device local lane instead: governance/local-ask.sh -f <file> \"task\" --out .local-only/<result>  (or the handoff skill). You may reference the path and tier, never the bytes. If you have no local lane configured, this content stays unread."

EXEMPT_TOOL_RE='(^|/)local-ask\.sh$|handoff\.sh$|governance/handoff'
LOCAL_ASK_RE='(^|/)local-ask\.sh$'
CD_PRE_RE='^cd[[:space:]]+[^[:space:];&|]+[[:space:]]*(&&|;)[[:space:]]*(.*)$'
ASSIGN_RE="^[A-Za-z_][A-Za-z0-9_]*=(\"[^\"]*\"|'[^']*'|[^[:space:]]*)[[:space:]]+(.*)\$"
QSTR_RE="^([^'\"]*)('[^']*'|\"[^\"]*\")(.*)\$"
OUT_RE="(^|[[:space:]])--out(=|[[:space:]]+)['\"]?([^[:space:]'\"]+)"

# is_exempt_invocation S: 0 = valid sanctioned call, 1 = not a sanctioned tool, 2 = tool named but not valid.
is_exempt_invocation() {
  local s="$1" flat w rest P
  while :; do # loud-failure-exempt: each pass consumes a prefix of a finite string, so it ends
    s="${s#"${s%%[![:space:]]*}"}"
    if [[ $s =~ $CD_PRE_RE ]]; then s="${BASH_REMATCH[2]}"; continue; fi
    if [[ $s =~ $ASSIGN_RE ]]; then s="${BASH_REMATCH[2]}"; continue; fi
    break
  done
  w="${s%%[[:space:]]*}"; rest="${s#"$w"}"
  case "${w##*/}" in
    bash|sh|zsh|python|python[0-9]*|node)
      rest="${rest#"${rest%%[![:space:]]*}"}"
      while [[ $rest == -* ]]; do
        rest="${rest#*[[:space:]]}"; rest="${rest#"${rest%%[![:space:]]*}"}"
      done
      w="${rest%%[[:space:]]*}"; rest="${rest#"$w"}"
      ;;
  esac
  [[ $w =~ $EXEMPT_TOOL_RE ]] || return 1
  [[ $s == *'$('* || $s == *'`'* || $s == *'<('* || $s == *'>('* || $s == *$'\n'* ]] && return 2
  flat="$s"
  while [[ $flat =~ $QSTR_RE ]]; do flat="${BASH_REMATCH[1]}${BASH_REMATCH[3]}"; done
  flat="${flat//>&[0-9]/}"; flat="${flat//&>/}"
  [[ $flat == *'&'* || $flat == *'|'* || $flat == *';'* ]] && return 2
  if [[ $w =~ $LOCAL_ASK_RE ]]; then
    [[ $rest =~ $OUT_RE ]] || return 2
    P="${BASH_REMATCH[3]}"
    [[ $P == *..* ]] && return 2
    case "$P" in .local-only/*|*/.local-only/*) ;; *) return 2 ;; esac
  fi
  return 0
}

case "$TOOL" in
  Read|Grep)
    FP=$(tool_file_path)
    PP=$(printf '%s' "$INPUT" | jq -r '.tool_input.path // .input.path // empty')
    if grep -Eq "$ZONE_RE" <<<"$FP $PP"; then
      deny "$REDIRECT" "BLOCKED (local-only wall)"
    fi
    ;;
  Bash)
    CMD=$(tool_command)
    # The sanctioned local-lane tools are SUPPOSED to read the zone and emit only sanitized output
    # (local-ask/handoff = on-device model).
    # Exempt only a command that is that ONE tool invocation. A command that merely names a tool,
    # chains another command after it, or runs local-ask.sh without --out under .local-only is not exempt.
    EX=0
    is_exempt_invocation "$CMD" || EX=$?
    if [ "$EX" = 0 ]; then
      exit 0
    fi
    if [ "$EX" = 2 ] && grep -Eq "$ZONE_RE" <<<"$CMD"; then
      deny "$REDIRECT" "BLOCKED (local-only wall)"
    fi
    # Block direct read/exfil verbs that target the zone.
    if grep -Eq "$ZONE_RE" <<<"$CMD" \
       && grep -Eqw '(cat|head|tail|less|more|bat|xxd|od|strings|nl|tac|grep|egrep|fgrep|rg|ag|awk|sed|cut|python|python3|node|ruby|perl|jq|base64|cp|scp|rsync|open|pbcopy|sort|uniq|diff|comm|paste|tee|file|stat|hexdump|shasum|sqlite3|duckdb|vim|nano)' <<<"$CMD"; then # loud-failure-exempt: reader-verb deny list for the wall, no transfer is run
      deny "$REDIRECT" "BLOCKED (local-only wall)"
    fi
    ;;
esac

exit 0
