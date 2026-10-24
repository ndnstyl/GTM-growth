#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PostToolUse hook: Auto-lint after file edits
# Only runs on .ts, .tsx, .js, .jsx files
#
# Reads .tool_input.file_path from the stdin JSON payload.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .input.file_path // .file_path // empty' 2>/dev/null)

# Skip if no file path or not a JS/TS file
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx)
    # Only lint if eslint config exists in project
    if [ -f "$(git rev-parse --show-toplevel 2>/dev/null)/.eslintrc.json" ] || \
       [ -f "$(git rev-parse --show-toplevel 2>/dev/null)/.eslintrc.js" ] || \
       [ -f "$(git rev-parse --show-toplevel 2>/dev/null)/eslint.config.js" ]; then
      npx eslint --fix "$FILE_PATH" 2>/dev/null
    fi
    ;;
esac

exit 0
