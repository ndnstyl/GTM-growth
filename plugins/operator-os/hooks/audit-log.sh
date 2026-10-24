#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PostToolUse hook: append every tool call to the local JSONL audit trail.
#
# Rationale: without a tool-call audit trail, autonomous actions are invisible to
# the operator. This hook writes one record per allowed PostToolUse event; PreToolUse
# denials are written directly by _lib.sh's deny(), since this hook
# only ever sees calls that were allowed through.
#
# Redaction only touches the value after a `=`/`:`-delimited key/token/secret/
# password/auth/bearer field, leaving the rest of the string intact.

set -u
INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // .event // "PostToolUse"' 2>/dev/null)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .tool // empty' 2>/dev/null)

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# Skip noisy read-only tools to keep the table small
case "$TOOL_NAME" in
  Read|Glob|Grep|ToolSearch|ScheduleWakeup|TaskCreate|TaskUpdate|TaskList|TaskGet|TaskOutput|Monitor)
    exit 0
    ;;
esac

# Build args preview (truncated)
ARGS_RAW=$(echo "$INPUT" | jq -c '.tool_input // .input // {}' 2>/dev/null)
ARGS_PREVIEW=$(echo "$ARGS_RAW" | head -c 1500)

# Redact only the VALUE after a key/token/secret/password/auth/bearer field
# delimiter (=, :, or plain whitespace as in an "Authorization: Bearer <tok>"
# header), not everything after the word.
ARGS_PREVIEW=$(echo "$ARGS_PREVIEW" | sed -E 's/(key|token|secret|password|auth|bearer)("?[[:space:]]*[:=][[:space:]]*"?|[[:space:]]+)[^,"[:space:]]+/\1\2[redacted]/gi')

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
CWD=$(pwd)
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Local JSONL audit trail (primary and only sink)
LOG_DIR="$HOME/.claude/session-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/tool-calls-$(date +%Y-%m-%d).jsonl"
jq -cn \
  --arg ts "$TS" \
  --arg tool "$TOOL_NAME" \
  --arg event "$EVENT" \
  --arg cwd "$CWD" \
  --arg branch "$BRANCH" \
  --arg session "$SESSION_ID" \
  --arg args "$ARGS_PREVIEW" \
  '{timestamp: $ts, tool: $tool, event: $event, cwd: $cwd, branch: $branch, session_id: $session, args_preview: $args}' \
  >> "$LOG_FILE" 2>/dev/null

exit 0
