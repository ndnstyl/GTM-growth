#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# SubagentStop hook: capture one outcome record per subagent run.
# Reads JSON payload from stdin (provided by Claude Code SubagentStop event).
# Appends one JSON line to ~/.claude/agent-outcomes/{agent_type}.jsonl.
#
# Outcome record schema:
#   timestamp        ISO8601 UTC
#   agent_type       researcher | implementer | reviewer | orchestrator | <other>
#   agent_id         Claude-assigned subagent id
#   session_id       parent session id
#   project          repo basename (cwd)
#   branch           current git branch
#   task_type        parsed from `[task_type=X]` prefix in user prompt; else "untagged"
#   status           pass | fail | pending_lead_score | skipped | unknown
#   signal_source    exit_code | regex_critical | regex_keywords | manual | none
#   confidence       high | medium | low | n/a
#   summary          first 200 chars of last_assistant_message
#   transcript_path  absolute path to subagent JSONL
#
# Failure mode: NEVER block subagent completion. Always exit 0.
# Silent-failure rule: write a stderr line AND log the failure so it surfaces in the error log.
#
# The agent name comes from the payload's `.subagent_type` (plugin agents arrive as
# "operator-os:<name>"; the prefix is stripped), falling back to a known-name scan of the transcript's
# first user message.
#
# Cost: pure bash + jq; no external API call here.

set -u

OUT_DIR="$HOME/.claude/agent-outcomes"
ERR_DIR="$HOME/.claude/agent-outcomes/_errors"
mkdir -p "$OUT_DIR" "$ERR_DIR"

# ---------- read stdin payload ----------
PAYLOAD=$(cat 2>/dev/null)
if [ -z "$PAYLOAD" ]; then
  echo "outcome-capture: empty stdin (not a SubagentStop event?)" >&2
  echo "$(date -u +%FT%TZ) empty_stdin" >> "$ERR_DIR/capture-errors.log"
  exit 0
fi

# ---------- extract canonical fields ----------
AGENT_ID=$(echo "$PAYLOAD" | jq -r '.agent_id // ""' 2>/dev/null)
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // ""' 2>/dev/null)
LAST_MSG=$(echo "$PAYLOAD" | jq -r '.last_assistant_message // ""' 2>/dev/null)
TRANSCRIPT=$(echo "$PAYLOAD" | jq -r '.agent_transcript_path // .transcript_path // ""' 2>/dev/null)
CWD=$(echo "$PAYLOAD" | jq -r '.cwd // empty' 2>/dev/null)
[ -z "$CWD" ] && CWD="${CLAUDE_PROJECT_DIR:-$PWD}"

# ---------- agent name: subagent_type first, then a transcript scan ----------
KNOWN_AGENTS='researcher|implementer|reviewer|orchestrator|opsec|ui-ux-engineer|web-designer|corpus-pruner'
AGENT_TYPE=$(echo "$PAYLOAD" | jq -r '.subagent_type // .agent_type // empty' 2>/dev/null)
if [ -z "$AGENT_TYPE" ] || [ "$AGENT_TYPE" = "workflow-subagent" ] || [ "$AGENT_TYPE" = "unknown" ]; then
  AGENT_TYPE=""
  if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
    FIRST_USER_TEXT=$(head -1 "$TRANSCRIPT" 2>/dev/null | jq -r '.message.content // empty' 2>/dev/null)
    AGENT_TYPE=$(echo "$FIRST_USER_TEXT" | grep -ioE "\\b($KNOWN_AGENTS)\\b" | head -1 | tr '[:upper:]' '[:lower:]')
  fi
  [ -z "$AGENT_TYPE" ] && AGENT_TYPE="unknown"
fi
AGENT_TYPE="${AGENT_TYPE##*:}"

PROJECT=$(basename "$CWD" 2>/dev/null || echo "unknown")
BRANCH=$(cd "$CWD" 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +%FT%TZ)

# ---------- parse task_type from user prompt in transcript ----------
# Convention: orchestrator prefixes prompts with "[task_type=X] ..."
# The first user message in the subagent transcript carries the prompt.
TASK_TYPE="untagged"
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  FIRST_USER_PROMPT=$(head -1 "$TRANSCRIPT" 2>/dev/null | jq -r '.message.content // empty' 2>/dev/null)
  PARSED=$(echo "$FIRST_USER_PROMPT" | grep -oE '\[task_type=[a-z0-9_]+\]' | head -1 | sed -E 's/\[task_type=([a-z0-9_]+)\]/\1/')
  [ -n "$PARSED" ] && TASK_TYPE="$PARSED"
fi

# ---------- determine outcome status per agent ----------
# Per-agent outcome metric.
STATUS="unknown"
SIGNAL_SOURCE="none"
CONFIDENCE="n/a"

case "$AGENT_TYPE" in
  implementer)
    # No standalone verify hook; use the same regex-keyword fallback as the other agent types.
    if echo "$LAST_MSG" | grep -qiE "error|failed|cannot|unable"; then
      STATUS="fail"; SIGNAL_SOURCE="regex_keywords"; CONFIDENCE="low"
    else
      STATUS="pass"; SIGNAL_SOURCE="regex_keywords"; CONFIDENCE="low"
    fi
    ;;
  deployer)
    # Look for "exit 0" or successful push/rsync indicator in last message.
    if echo "$LAST_MSG" | grep -qiE "pushed|deployed|rsync.*completed|exit.*0"; then
      STATUS="pass"; SIGNAL_SOURCE="regex_keywords"; CONFIDENCE="medium"
    elif echo "$LAST_MSG" | grep -qiE "failed|error|rejected"; then
      STATUS="fail"; SIGNAL_SOURCE="regex_keywords"; CONFIDENCE="medium"
    else
      STATUS="unknown"; SIGNAL_SOURCE="none"; CONFIDENCE="low"
    fi
    ;;
  reviewer)
    if echo "$LAST_MSG" | grep -qiE "CRITICAL|BLOCKER"; then
      STATUS="flagged_critical"; SIGNAL_SOURCE="regex_critical"; CONFIDENCE="medium"
    else
      STATUS="pass"; SIGNAL_SOURCE="regex_critical"; CONFIDENCE="medium"
    fi
    ;;
  researcher)
    # Scored by the delegating agent (orchestrator). Mark pending; the
    # resolver pairs orchestrator [score:...] lines back to this record.
    STATUS="pending_lead_score"; SIGNAL_SOURCE="none"; CONFIDENCE="n/a"
    ;;
  orchestrator)
    # Orchestrator outcome is aggregate; computed offline by weekly rollup.
    # Capture pass/fail signal from final synthesis tone only.
    STATUS="pending_aggregate"; SIGNAL_SOURCE="none"; CONFIDENCE="n/a"
    ;;
  *)
    STATUS="unknown"; SIGNAL_SOURCE="none"; CONFIDENCE="n/a"
    ;;
esac

# ---------- summary (first 200 chars, single line, escaped) ----------
SUMMARY=$(echo "$LAST_MSG" | tr '\n' ' ' | cut -c 1-200)

# ---------- build record + append ----------
JSONL_FILE="$OUT_DIR/${AGENT_TYPE}.jsonl"

RECORD=$(jq -cn \
  --arg ts "$TIMESTAMP" \
  --arg agent_type "$AGENT_TYPE" \
  --arg agent_id "$AGENT_ID" \
  --arg session_id "$SESSION_ID" \
  --arg project "$PROJECT" \
  --arg branch "$BRANCH" \
  --arg task_type "$TASK_TYPE" \
  --arg status "$STATUS" \
  --arg signal_source "$SIGNAL_SOURCE" \
  --arg confidence "$CONFIDENCE" \
  --arg summary "$SUMMARY" \
  --arg transcript "$TRANSCRIPT" \
  '{timestamp:$ts, agent_type:$agent_type, agent_id:$agent_id, session_id:$session_id, project:$project, branch:$branch, task_type:$task_type, status:$status, signal_source:$signal_source, confidence:$confidence, summary:$summary, transcript_path:$transcript}' \
  2>/dev/null)

if [ -z "$RECORD" ]; then
  echo "outcome-capture: jq failed to build record for $AGENT_TYPE/$AGENT_ID" >&2
  echo "$TIMESTAMP jq_failed agent=$AGENT_TYPE id=$AGENT_ID" >> "$ERR_DIR/capture-errors.log"
  exit 0
fi

echo "$RECORD" >> "$JSONL_FILE"

exit 0
