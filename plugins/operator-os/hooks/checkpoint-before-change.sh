#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PreToolUse hook (Write | Edit | Bash): the LOCAL half of a blocker gate.
#
# THE RULE: a blocker that is local only (code, config, local data, scheduled jobs on this machine,
# the vault, receipts) is closed without asking, but "stage a version control, make the change, and
# log it." Enforced: before any Write/Edit lands on a GOVERNED path, the current bytes are copied to
# .operator/checkpoints/<YYYY-MM-DD>/<sha8>__<basename> and a line goes to .operator/change_log.jsonl
# with the sha256 before the change. For Bash, scheduler installs and in-place edits of governed
# files (launchctl bootstrap/bootout/kickstart, cp into ~/Library/LaunchAgents, sed -i,
# plutil -replace) are logged the same way.
#
# Override the governed set with OPERATOR_GOVERNED_REGEX (an extended regex over the project-relative path).
# This hook never blocks a change. It DENIES only when the checkpoint itself cannot be written, because a
# change with no revert path is the one thing the rule forbids. Exit 0 = allow, exit 2 = deny.

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }
BRAIN="${CLAUDE_PROJECT_DIR:-$PWD}"
CK_ROOT="$BRAIN/.operator/checkpoints/$(date -u +%Y-%m-%d)"
LOG="$BRAIN/.operator/change_log.jsonl"
mkdir -p "$CK_ROOT" "$(dirname "$LOG")" 2>/dev/null || deny "checkpoint dir cannot be created at $CK_ROOT; a change with no revert path is refused"

# Governed prefixes (relative to the project, or absolute for the LaunchAgents dir). Anything else is not checkpointed.
GOVERNED="${OPERATOR_GOVERNED_REGEX:-^(\.claude/(agents|rules|hooks|settings|skills)|scripts/hooks|\.operator/config|specs/[0-9]+-[^/]+/(spec|plan|tasks)\.md)|/Library/LaunchAgents/|\.plist$}"

TOOL=$(tool_name)
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

is_governed() {  # path -> 0/1
  local p="$1" rel
  rel="${p#$BRAIN/}"
  printf '%s\n%s\n' "$rel" "$p" | grep -Eq -- "$GOVERNED"
}

checkpoint() {  # path via -> writes copy + log line; returns 1 if the copy failed
  local p="$1" via="$2" sha base dest
  if [ -f "$p" ]; then
    sha=$(shasum -a 256 "$p" | cut -c1-64)
    base=$(basename "$p")
    dest="$CK_ROOT/${sha:0:8}__$base"
    [ -f "$dest" ] || cp -p "$p" "$dest" 2>/dev/null || return 1
  else
    sha="(new file)"; dest=""
  fi
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg path "$p" --arg sha "$sha" --arg ck "$dest" \
    --arg via "$via" --arg tool "$TOOL" --arg session "$SESSION" \
    '{ts:$ts,event:"checkpoint",path:$path,sha256_before:$sha,checkpoint:$ck,via:$via,tool:$tool,session_id:$session}' >> "$LOG" 2>/dev/null
  return 0
}

case "$TOOL" in
  Write|Edit)
    P=$(tool_file_path)
    [ -z "$P" ] && exit 0
    case "$P" in /*) : ;; *) P="$BRAIN/$P" ;; esac
    is_governed "$P" || exit 0
    checkpoint "$P" "$TOOL" || deny "checkpoint failed for $P (copy into $CK_ROOT did not succeed); refusing a governed change with no revert path"
    exit 0 ;;
  Bash)
    CMD=$(tool_command)
    [ -z "$CMD" ] && exit 0
    if printf '%s' "$CMD" | grep -Eq 'launchctl +(bootstrap|bootout|kickstart|load|unload)|cp +[^;&|]*LaunchAgents|sed +-i|plutil +-(replace|insert|remove)'; then
      # checkpoint any existing governed file the command names (plists in LaunchAgents, sed -i targets)
      for tok in $CMD; do
        t="${tok//\~/$HOME}"
        case "$t" in /*|./*|*/*) : ;; *) continue ;; esac
        case "$t" in /*) : ;; *) t="$BRAIN/${t#./}" ;; esac
        if [ -f "$t" ] && is_governed "$t"; then
          checkpoint "$t" "Bash:$(printf '%s' "$CMD" | cut -c1-80)" || deny "checkpoint failed for $t before an in-place change; refusing"
        fi
      done
      jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg cmd "${CMD:0:400}" --arg session "$SESSION" \
        '{ts:$ts,event:"governed-bash",command:$cmd,session_id:$session}' >> "$LOG" 2>/dev/null
    fi
    exit 0 ;;
esac
exit 0
