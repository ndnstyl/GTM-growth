#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# Shared helpers for the deny-pattern hooks in this folder. Source, don't execute.
# Every caller must set INPUT=$(cat) itself BEFORE sourcing (stdin can only be
# read once), then use these:
#   tool_name         -> .tool_name // .tool
#   tool_command      -> .tool_input.command // .input.command // .command
#   tool_file_path    -> .tool_input.file_path // .input.file_path // .file_path
#   deny REASON [PREFIX]  -> stderr line + PreToolUse deny JSON + exit 2
#
# One source of truth for deny() and the three-way jq payload readers.
# audit-log.sh only runs PostToolUse, so a PreToolUse denial (the thing it exists to make
# visible) would never reach the trail: deny() writes its own audit line before exiting,
# using the same log file/shape audit-log.sh uses.
#   operator_vault        -> the vault directory (OPERATOR_VAULT or the per-project memory folder)
#   operator_plugin_root  -> the plugin directory

deny() {
  local reason="$1"
  local prefix="${2:-BLOCKED}"
  echo "$prefix: $reason" >&2
  local log_dir="$HOME/.claude/session-logs"
  mkdir -p "$log_dir" 2>/dev/null
  local log_file="$log_dir/tool-calls-$(date +%Y-%m-%d).jsonl"
  local tname session ts
  tname=$(tool_name 2>/dev/null)
  session=$(printf '%s' "${INPUT:-}" | jq -r '.session_id // empty' 2>/dev/null)
  ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  jq -cn --arg ts "$ts" --arg tool "${tname:-unknown}" --arg session "$session" \
    --arg reason "$reason" --arg hook "$(basename "${BASH_SOURCE[1]:-unknown}")" \
    '{timestamp:$ts, tool:$tool, event:"PreToolUse", session_id:$session, denied_by:$hook, reason:$reason}' \
    >> "$log_file" 2>/dev/null
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
    "${reason//\"/\\\"}"
  exit 2
}

# operator_vault: print the vault directory. OPERATOR_VAULT wins; otherwise the Claude Code
# per-project memory folder for $CLAUDE_PROJECT_DIR (non-alphanumerics become "-").
operator_vault() {
  if [ -n "${OPERATOR_VAULT:-}" ]; then printf '%s' "$OPERATOR_VAULT"; return; fi
  local slug
  slug=$(printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}" | sed 's/[^A-Za-z0-9]/-/g')
  printf '%s' "$HOME/.claude/projects/$slug/memory"
}

# operator_plugin_root: the plugin directory (CLAUDE_PLUGIN_ROOT, else this file's parent).
operator_plugin_root() {
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then printf '%s' "$CLAUDE_PLUGIN_ROOT"; return; fi
  (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
}

tool_name() {
  printf '%s' "$INPUT" | jq -r '.tool_name // .tool // empty' 2>/dev/null
}

tool_command() {
  printf '%s' "$INPUT" | jq -r '.tool_input.command // .input.command // .command // empty' 2>/dev/null
}

tool_file_path() {
  printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .input.file_path // .file_path // empty' 2>/dev/null
}
