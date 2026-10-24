#!/bin/bash
set -euo pipefail
# PreToolUse hook for Write|Edit|Bash: refuse the write that mints a public name nobody has ruled.
# Exit 0 = allow, exit 2 = block (via deny() in _lib.sh).
#
# The registry (ingress-registry.json) lists every hostname, hosting project, worker and tunnel you are
# allowed to have, plus the domains it governs. It SHIPS EMPTY: with no governed domains this hook allows
# everything and says so once. Fill in `governed_domains` and `hostnames` per docs/ingress-registry.md.
#   registry: $OPERATOR_INGRESS_REGISTRY, else $CLAUDE_PROJECT_DIR/.operator/ingress-registry.json,
#             else the empty example beside this file.
#
#   Write/Edit  refuses content that introduces a governed name that is NEW relative to the file already
#               on disk and NOT in the registry. Rewriting a file that already names a host passes.
#   Bash        refuses commands that create a hosting project, database, tunnel or public funnel, and a
#               shell write (>, tee, sed -i) that puts an unregistered governed name into a file.
# The hook is the early tripwire. The enforcement that survives this file being edited off is a daily
# census of your hosting accounts and public DNS against the registry (see the ingress rule).

INPUT=$(cat)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_lib.sh"
PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
REG="${OPERATOR_INGRESS_REGISTRY:-$PROJ/.operator/ingress-registry.json}"
[ -f "$REG" ] || REG="$HERE/ingress-registry.json"
[ -f "$REG" ] || deny "ingress registry missing at $REG; refusing until it is restored"
jq -e '.governed_domains | type == "array"' "$REG" >/dev/null 2>&1 || deny "ingress registry at $REG is not parseable JSON with a governed_domains array"

TOOL=$(tool_name)
[ -n "$TOOL" ] || exit 0

DOMAINS=$(jq -r '[.governed_domains[] | gsub("\\."; "\\.")] | join("|")' "$REG")
if [ -z "$DOMAINS" ]; then
  STATE="$PROJ/.operator"
  if [ ! -f "$STATE/.ingress-empty-notice" ]; then
    mkdir -p "$STATE"
    printf 'operator-os: ingress guard not configured (no governed domains in the registry); new hostnames are NOT checked. See docs/ingress-registry.md.\n' >&2
    : > "$STATE/.ingress-empty-notice"
  fi
  exit 0
fi
NAME_RE="[A-Za-z0-9][A-Za-z0-9.-]*\.($DOMAINS)"
RULE="Ingress rule: a public name is the operator's to rule; present candidates with facts and stop. Registry: $REG"

names_in() { # governed names in TEXT, lowercased and unique; empty when none (grep rc 1 is that answer, rc>1 is a fault)
  local raw rc=0
  raw=$(printf '%s' "$1" | grep -oE "$NAME_RE") || rc=$?
  if [ "$rc" -gt 1 ]; then echo "block-ingress-drift: grep failed rc=$rc while scanning for governed names" >&2; return 2; fi
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" | tr 'A-Z' 'a-z' | sort -u
}

registered_names() { # the bare governed domains are always allowed (they appear in every email and URL)
  jq -r '.governed_domains[]' "$REG"
  jq -r '[(.hostnames // [])[].name, (.tunnels // [])[].name,
          ((.pages_projects // [])[].name | . + ".pages.dev"),
          ((.workers // [])[].name | . + ".workers.dev")] | .[] | ascii_downcase' "$REG"
}

unregistered_new() { # names in $1 not in $2
  comm -23 <(printf '%s\n' "$1" | sed '/^$/d' | sort -u) <(printf '%s\n' "$2" | sed '/^$/d' | sort -u)
}

case "$TOOL" in
  Write|Edit)
    FILE=$(tool_file_path)
    [ -n "$FILE" ] || exit 0
    if printf '%s' "$FILE" | grep -Eq 'ingress-registry\.json$|block-ingress-drift\.sh$'; then exit 0; fi
    NEW=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // .input.content // .input.new_string // empty')
    [ -n "$NEW" ] || exit 0
    NEW_NAMES=$(names_in "$NEW")
    [ -n "$NEW_NAMES" ] || exit 0
    DISK_NAMES=""
    if [ -f "$FILE" ]; then DISK_NAMES=$(names_in "$(cat "$FILE")"); fi
    KNOWN=$(printf '%s\n%s\n' "$(registered_names)" "$DISK_NAMES")
    BAD=$(unregistered_new "$NEW_NAMES" "$KNOWN")
    if [ -n "$BAD" ]; then
      deny "INGRESS DRIFT: this $TOOL to $FILE introduces a public name not in the registry: $(printf '%s' "$BAD" | tr '\n' ' '). $RULE"
    fi
    exit 0
    ;;
  Bash)
    CMD=$(tool_command)
    [ -n "$CMD" ] || exit 0
    if printf '%s' "$CMD" | grep -Eiq 'wrangler +pages +project +create|wrangler +d1 +create|cloudflared +tunnel +create|tailscale +funnel'; then
      deny "INGRESS DRIFT: this command creates a hosting project, database, tunnel or public funnel. $RULE"
    fi
    if printf '%s' "$CMD" | grep -Eq '(^|[^0-9])>[^&]|\btee\b|sed +-i'; then
      CMD_NAMES=$(names_in "$CMD")
      if [ -n "$CMD_NAMES" ]; then
        BAD=$(unregistered_new "$CMD_NAMES" "$(registered_names)")
        if [ -n "$BAD" ]; then
          deny "INGRESS DRIFT: this shell write puts an unregistered public name into a file: $(printf '%s' "$BAD" | tr '\n' ' '). $RULE"
        fi
      fi
    fi
    exit 0
    ;;
esac
exit 0
