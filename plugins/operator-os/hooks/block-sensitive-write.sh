#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
set -euo pipefail
# PreToolUse hook for Write|Edit: Block writes to credential/config paths.
# Exit 0 = allow, Exit 2 = block. Every non-zero path is explicit because `set -e` is on.
#
# Write/Edit could otherwise silently overwrite ~/.ssh/authorized_keys, ~/.claude/.mcp.json, or
# project .env files. This hook closes that gap: it matches any path ending in .env(.suffix), any
# /credentials/ directory, private keys, ssh and system auth files.

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }  # loud-failure-exempt: the || branch on this same line denies with a named reason and a non-zero exit; the suppressed text is bash's own "no such file" for the exact path the refusal already prints
FILE_PATH=$(tool_file_path)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Block any write/edit under ~/.ssh EXCEPT public keys (.pub)
if echo "$FILE_PATH" | grep -Eq '/\.ssh(/|$)' && ! echo "$FILE_PATH" | grep -Eq '\.pub$'; then
  deny "Refusing to Write/Edit inside ~/.ssh (non-pub file)"
fi

# Block writes to MCP config
if echo "$FILE_PATH" | grep -Eq '/\.claude/\.mcp\.json$|/\.mcp\.json$'; then
  deny "Refusing to Write/Edit .mcp.json (contains all MCP tokens)"
fi

# Block writes to .env* files (any path ending in .env or .env.<suffix>) and any credentials/ directory.
if echo "$FILE_PATH" | grep -Eq '\.env(\.[A-Za-z0-9_]+)?$|/credentials/'; then
  deny "Refusing to Write/Edit a credential path (.env* or /credentials/) (use explicit user approval flow)"
fi

# Block writes to private key files
if echo "$FILE_PATH" | grep -Eq '(id_(ed25519|rsa|dsa|ecdsa)|\.pem|\.p12|\.pfx)$'; then
  # Allow writes to public keys (.pub)
  if ! echo "$FILE_PATH" | grep -Eq '\.pub$'; then
    deny "Refusing to Write/Edit private key file"
  fi
fi

# Block writes to crontab / authorized_keys
if echo "$FILE_PATH" | grep -Eq '(authorized_keys|known_hosts|/etc/cron)'; then
  deny "Refusing to Write/Edit system auth file"
fi

exit 0
