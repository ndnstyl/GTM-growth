#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PreToolUse hook: Auto-check file-scope conflicts before edits
# Automatic owned_paths conflict detection for non-conflicting work
# Only fires on Write/Edit tools
#
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .input.file_path // .file_path // empty' 2>/dev/null)

# Skip if no file path (non-file tools)
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip non-source files (hooks, logs, configs)
case "$FILE_PATH" in
  */node_modules/*|*/.git/*|*/diary/*|*/session-logs/*)
    exit 0
    ;;
esac

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
SPEC_DIR="$PROJECT_ROOT/specs"

if [ ! -d "$SPEC_DIR" ]; then
  exit 0
fi

# owned_paths entries are repo-relative (e.g. "projects/foo/**"); FILE_PATH
# from the tool call is absolute. Strip the project root so the case glob
# below compares like with like.
REL_PATH="${FILE_PATH#"$PROJECT_ROOT"/}"

# Check if any OTHER spec's owned_paths includes this file
CONFLICTS=""
for spec in "$SPEC_DIR"/*/spec.md; do
  [ -f "$spec" ] || continue
  SPEC_NAME=$(basename "$(dirname "$spec")")

  # Extract owned_paths from YAML frontmatter
  OWNED=$(sed -n '/^owned_paths:/,/^[^ ]/{ /^  - /p; }' "$spec" 2>/dev/null | sed 's/^  - //')

  if [ -n "$OWNED" ]; then
    while IFS= read -r pattern; do
      [ -z "$pattern" ] && continue
      # Glob match, not regex: a bash `case` pattern treats `**` the same as
      # `*` (no recursive-segment distinction needed for this check), and
      # never rejects the pattern the way BSD grep -E does.
      case "$REL_PATH" in
        $pattern)
          CONFLICTS="${CONFLICTS}${SPEC_NAME} owns: ${pattern}\n"
          ;;
      esac
    done <<< "$OWNED"
  fi
done

if [ -n "$CONFLICTS" ]; then
  echo "FILE-SCOPE WARNING: This file may be owned by another spec:"
  echo -e "$CONFLICTS"
  echo "Check for conflicts before proceeding."
fi

exit 0
