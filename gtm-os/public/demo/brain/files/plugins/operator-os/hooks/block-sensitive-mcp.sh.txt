#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
# PreToolUse hook for MCP tools: Block or warn on destructive/external-effect MCP calls.
# Exit 0 = allow, Exit 2 = block.
#
# Tools that can do irreversible external damage (external message sends, mass workflow edits) need a
# gate. External messages require explicit user approval: the send is blocked unless the tool_input
# carries `confirmed_by_user: true` or the session sets AUTO_APPROVE_EXTERNAL_SENDS=1.
# The send matcher is case-insensitive and covers any mail/chat/SMS server whose tool name contains
# send, reply or forward. Extend with OPERATOR_SEND_TOOLS (an ERE matched against the lowercase tool name).

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }
TOOL_NAME=$(tool_name)

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# Only act on mcp__* tools
case "$TOOL_NAME" in
  mcp__*) : ;;
  *) exit 0 ;;
esac

# ─── Always-block (require full user intervention) ────────────────────────────
# Empty by default. Add anchored patterns for any bare "delete everything" tool you expose.
ALWAYS_BLOCK=()

for pattern in "${ALWAYS_BLOCK[@]}"; do
  if echo "$TOOL_NAME" | grep -Eq "^${pattern}$"; then
    deny "MCP tool '$TOOL_NAME' is always-blocked. Requires explicit user override."
  fi
done

# ─── Conditional: outbound message sends ─────────────────────────────────────
# These fire external messages. Block unless the tool_input includes a field
# `confirmed_by_user: true`, or AUTO_APPROVE_EXTERNAL_SENDS=1 is set for the session.

SEND_RX='(gmail|mail|slack|sms|twilio|whatsapp|telegram|discord).*(send|reply|forward|post_message)'
[ -n "${OPERATOR_SEND_TOOLS:-}" ] && SEND_RX="${SEND_RX}|${OPERATOR_SEND_TOOLS}"
if echo "$TOOL_NAME" | grep -Eqi "$SEND_RX"; then
  if [ "${AUTO_APPROVE_EXTERNAL_SENDS:-0}" = "1" ]; then
    exit 0
  fi
  CONFIRMED=$(printf '%s' "$INPUT" | jq -r '.tool_input.confirmed_by_user // .input.confirmed_by_user // false' 2>/dev/null)
  if [ "$CONFIRMED" != "true" ]; then
    deny "External-message MCP tool '$TOOL_NAME' requires confirmed_by_user:true or AUTO_APPROVE_EXTERNAL_SENDS=1"
  fi
fi

# ─── Conditional: workflow mass-edit ──────────────────────────────────────────
# Full-workflow replacement tools: allowed, logged by audit-log.sh.

exit 0
