#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PostToolUse hook: TypeScript type check after file edits
# Reports errors but does not block (exit 0)
#
# Walks up from the edited file to the repo root looking for the nearest tsconfig.json.

# Read stdin to get tool input
INPUT=$(cat)

# Extract file path from JSON (try multiple paths)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .input.file_path // .file_path // empty' 2>/dev/null)

# Skip if not a TypeScript file
case "$FILE_PATH" in
  *.ts|*.tsx)
    ;;
  *)
    exit 0
    ;;
esac

# Find nearest tsconfig.json
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$PROJECT_ROOT" ]; then
  exit 0
fi

TSCONFIG=""
DIR=$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd)
if [ -n "$DIR" ]; then
  while :; do
    if [ -f "$DIR/tsconfig.json" ]; then
      TSCONFIG="$DIR/tsconfig.json"
      break
    fi
    [ "$DIR" = "$PROJECT_ROOT" ] && break
    PARENT=$(dirname "$DIR")
    [ "$PARENT" = "$DIR" ] && break
    DIR="$PARENT"
  done
fi

if [ -z "$TSCONFIG" ]; then
  exit 0
fi

# Run type check, show only errors (max 5 lines)
ERRORS=$(cd "$(dirname "$TSCONFIG")" && npx tsc --noEmit 2>&1 | grep "error TS" | head -5)

if [ -n "$ERRORS" ]; then
  echo "TypeScript errors detected:"
  echo "$ERRORS"
  ERROR_COUNT=$(echo "$ERRORS" | wc -l | tr -d ' ')
  echo "($ERROR_COUNT errors shown, run 'npx tsc --noEmit' for full list)"
fi

# Don't block, just inform
exit 0
