#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PreToolUse, EGRESS GUARD (warn + log, NON-BLOCKING).
#
# Complements block-sensitive-mcp.sh (which BLOCKS destructive/send calls). This hook does NOT block:
# it inspects the OUTBOUND payload of any egress vector for leaked secrets and sensitive-data markers,
# logs every egress event to .operator/logs/egress.log, and prints a visible WARNING when a secret
# pattern would leave the machine. Enforcement level: "warn + log first."
#
# The secret regex list lives in secret-patterns.txt beside this file, shared with
# pre-commit-secret-scan.sh.
#
# Exit 0 ALWAYS (non-blocking). It informs; it never denies.

INPUT=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
LOG_DIR="$ROOT/.operator/logs"
LOG="$LOG_DIR/egress.log"
mkdir -p "$LOG_DIR" 2>/dev/null
TS=$(date '+%Y-%m-%d %H:%M:%S %Z')

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .tool // empty' 2>/dev/null)
[ -z "$TOOL_NAME" ] && exit 0

# Serialize the tool input for scanning (compact).
PAYLOAD=$(echo "$INPUT" | jq -c '.tool_input // .input // {}' 2>/dev/null)

# ─── Is this an egress vector? (something that can send data off the machine) ──
is_egress=0
LOWER_TOOL=$(printf '%s' "$TOOL_NAME" | tr 'A-Z' 'a-z')
case "$LOWER_TOOL" in
  mcp__*mail*|mcp__*drive*|mcp__*docs*|mcp__*sheets*|mcp__*slack*|mcp__*sms*|mcp__*twilio*) is_egress=1 ;;
  WebFetch) is_egress=1 ;;
  Bash)
    CMD=$(echo "$PAYLOAD" | jq -r '.command // empty' 2>/dev/null)
    # Network egress commands aimed at a non-localhost destination.
    # Word boundaries so 'nc' does not match inside 'sync'/'instance'/etc.
    if echo "$CMD" | grep -Eqw '(curl|wget|scp|rsync|ssh|nc|ftp|sftp)' \
       && ! echo "$CMD" | grep -Eq '(127\.0\.0\.1|localhost|::1)'; then
      is_egress=1
    fi
    ;;
esac
[ "$is_egress" -eq 0 ] && exit 0

# ─── Scan the payload for leaked secrets (shared pattern list) ───────────
# Resolve the REAL script location (a symlinked hook would otherwise look for the pattern file
# next to the symlink).
_HOOK_REAL="$(python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}" 2>/dev/null || readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
PATTERNS_FILE="$(dirname "$_HOOK_REAL")/secret-patterns.txt"
SECRET_HITS=""
if [ -f "$PATTERNS_FILE" ]; then
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in \#*) continue ;; esac
    if echo "$PAYLOAD" | grep -Eoq -e "$p"; then
      SECRET_HITS="${SECRET_HITS}${SECRET_HITS:+, }$(echo "$p" | cut -c1-14)…"
    fi
  done < "$PATTERNS_FILE"
else
  # This guard is non-blocking by design (it warns and logs, never denies), but a
  # silently-missing patterns file would mean EVERY egress event scans zero secret
  # patterns with no signal at all. This IS the loud warning the design calls for.
  echo "⚠️  GOVERNANCE WARNING: secret-patterns.txt missing at $PATTERNS_FILE, this egress event ($TOOL_NAME) was NOT scanned for leaked secrets. Restore the file." >&2
fi

# ─── Sensitive-data markers (informational; lower confidence) ─────────────────
SENSITIVE=""
echo "$PAYLOAD" | grep -Eq '[0-9]{3}-[0-9]{2}-[0-9]{4}' && SENSITIVE="${SENSITIVE}SSN-like " || true
echo "$PAYLOAD" | grep -Eiq '(password|passwd|secret|api[_-]?key|credential|refresh[_-]?token)' && SENSITIVE="${SENSITIVE}credential-words " || true

# ─── Log every egress event ───────────────────────────────────────────────────
{
  echo "[$TS] EGRESS tool=$TOOL_NAME bytes=${#PAYLOAD} secrets=[${SECRET_HITS:-none}] markers=[${SENSITIVE:-none}]"
} >> "$LOG" 2>/dev/null

# ─── Warn the user visibly if a secret pattern is about to leave ──────────────
# NON-BLOCKING by design: exit 0 with NO decision JSON, so this hook only warns
# and logs and NEVER overrides another hook's block (e.g. block-sensitive-mcp.sh)
# or the normal permission flow. stderr surfaces the warning; the log is durable.
if [ -n "$SECRET_HITS" ]; then
  echo "⚠️  GOVERNANCE WARNING: outbound $TOOL_NAME payload contains secret pattern(s): ${SECRET_HITS}. Logged to .operator/logs/egress.log. NOT blocked (warn+log mode), verify this is intended before it leaves the machine." >&2
fi

exit 0
