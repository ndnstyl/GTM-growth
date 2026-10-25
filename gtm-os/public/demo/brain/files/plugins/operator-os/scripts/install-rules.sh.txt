#!/usr/bin/env bash
# install-rules.sh, copy the operator-os rules into the current project's .claude/rules/ so Claude
# Code loads them as project rules. A Claude Code plugin cannot ship rules directly, so this is the
# one step that makes them active.
#
# usage: install-rules.sh [--force] [rule-name ...]     (no names = all rules)
# Never overwrites an existing file unless --force. Prints what it copied and what it skipped.
set -euo pipefail
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DEST="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/rules"
FORCE=0; NAMES=()
for a in "$@"; do case "$a" in --force) FORCE=1 ;; *) NAMES+=("${a%.md}") ;; esac; done
[ -d "$PLUGIN/rules" ] || { echo "install-rules: no rules folder at $PLUGIN/rules" >&2; exit 2; }
mkdir -p "$DEST"
copied=0; skipped=0
for src in "$PLUGIN"/rules/*.md; do
  name="$(basename "$src" .md)"
  if [ "${#NAMES[@]}" -gt 0 ]; then
    hit=0; for n in "${NAMES[@]}"; do [ "$n" = "$name" ] && hit=1; done
    [ "$hit" = 1 ] || continue
  fi
  if [ -e "$DEST/$name.md" ] && [ "$FORCE" != 1 ]; then
    echo "skipped (exists): $DEST/$name.md"; skipped=$((skipped+1)); continue
  fi
  cp "$src" "$DEST/$name.md"; echo "copied: $DEST/$name.md"; copied=$((copied+1))
done
echo "install-rules: $copied copied, $skipped skipped. Rules in .claude/rules/ load automatically next session."
