#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# Stop hook: Log session summary on session end
# Writes JSON to ~/.claude/session-logs/ (local record)
#
# Stop fires once per assistant turn, not once per session, so the file is keyed by session_id
# from stdin and overwritten: one file per session no matter how many turns it took.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

LOG_DIR="$HOME/.claude/session-logs"
mkdir -p "$LOG_DIR"

SESSION_END=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_DATE=$(date +"%Y-%m-%d")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "unknown")
PROJECT_NAME=$(basename "$PROJECT_ROOT" 2>/dev/null || echo "unknown")

# Get changed files from recent commits (last 3)
CHANGED_FILES=$(git diff --name-only HEAD~3 2>/dev/null | head -20 | tr '\n' ', ' | sed 's/,$//')

# Get commit messages from this session
COMMITS=$(git log --oneline -5 --since="4 hours ago" 2>/dev/null | tr '\n' '; ' | sed 's/;$//')

if [ -n "$SESSION_ID" ]; then
  LOG_FILE="$LOG_DIR/session-${SESSION_ID}.json"
else
  # Fall back to the old per-invocation naming if no session_id is present.
  LOG_FILE="$LOG_DIR/session-${SESSION_DATE}-$(date +%H%M%S).json"
fi

cat > "$LOG_FILE" <<EOF
{
  "timestamp": "$SESSION_END",
  "date": "$SESSION_DATE",
  "session_id": "$SESSION_ID",
  "project": "$PROJECT_NAME",
  "branch": "$BRANCH",
  "changed_files": "$CHANGED_FILES",
  "recent_commits": "$COMMITS"
}
EOF

echo "Session logged: $LOG_FILE"
exit 0
