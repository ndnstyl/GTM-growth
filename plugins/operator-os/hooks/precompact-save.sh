#!/bin/bash
# PreCompact hook: Save a git-state snapshot before context compression.
# Writes a timestamped diary entry to .operator/diary/ for later /reflect synthesis.
#
# Writes the git snapshot only, which is the one thing it can produce deterministically.

DIARY_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}/.operator/diary"
mkdir -p "$DIARY_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE=$(date +"%Y-%m-%d")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Get recent file changes as context
CHANGED=$(git diff --name-only HEAD~3 2>/dev/null | head -10 | tr '\n' ', ' | sed 's/,$//')
COMMITS=$(git log --oneline -5 --since="4 hours ago" 2>/dev/null | tr '\n' '; ' | sed 's/;$//')

ENTRY_FILE="$DIARY_DIR/diary-${DATE}-$(date +%H%M%S).md"
cat > "$ENTRY_FILE" <<EOF
---
timestamp: ${TIMESTAMP}
branch: ${BRANCH}
event: precompact
---

## Session Context (Pre-Compact Snapshot)

**Branch:** ${BRANCH}
**Recent commits:** ${COMMITS}
**Changed files:** ${CHANGED}
EOF

echo "Pre-compact diary saved: $ENTRY_FILE"
exit 0
