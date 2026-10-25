#!/usr/bin/env bash
# init-vault.sh, create a minimal knowledge vault (an Obsidian-style folder of markdown notes) at
# the location the memory scripts and hooks expect.
#
# usage: init-vault.sh [vault-dir]
# Default location: $OPERATOR_VAULT, else ~/.claude/projects/<this project's slug>/memory
# Idempotent: never overwrites an existing file.
set -euo pipefail
case "${1:-}" in -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0;; esac
if [ $# -ge 1 ]; then VAULT="$1"
elif [ -n "${OPERATOR_VAULT:-}" ]; then VAULT="$OPERATOR_VAULT"
else VAULT="$HOME/.claude/projects/$(printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}" | sed 's/[^A-Za-z0-9]/-/g')/memory"; fi
mkdir -p "$VAULT/raw" "$VAULT/templates" "$VAULT/30-KNOWLEDGE/concepts" "$VAULT/20-AREAS/harness"
write_once() { if [ -e "$1" ]; then echo "exists: $1"; cat >/dev/null; else cat > "$1"; echo "created: $1"; fi; }
write_once "$VAULT/MEMORY.md" <<'M'
# Memory
One line per note, hook under ~160 characters. This index loads into every session; keep it under 24,400 bytes.

## Hard rules

## Active projects

## Areas
M
write_once "$VAULT/log.md" <<'M'
# Log
Append-only record of ingests and distills.
M
write_once "$VAULT/_WIKI-SCHEMA.md" <<'M'
# Wiki schema
Every note has frontmatter with `description` and `type` (feedback | project | reference | user | learning | source | sop).
`name`, if present, equals the filename stem. Raw sources live in `raw/` and are never edited.
Notes cite their raw source as `[[raw/<file>]]`.
M
write_once "$VAULT/templates/tpl-learning.md" <<'M'
---
description: one sentence, declarative
type: learning
---
What happened, what it means, how to apply it.
M
echo "init-vault: vault ready at $VAULT"
echo "Set OPERATOR_VAULT=$VAULT if you want it somewhere other than the per-project default."
