#!/bin/bash
# SessionStart hook: surface the project constitution (if any) and print ONE status line that says
# which optional parts of operator-os are configured. Optional pieces print "not configured" here
# instead of failing silently later.

operator_vault() {
  if [ -n "${OPERATOR_VAULT:-}" ]; then printf '%s' "$OPERATOR_VAULT"; return; fi
  printf '%s' "$HOME/.claude/projects/$(printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}" | sed 's/[^A-Za-z0-9]/-/g')/memory"
}
REPO="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
CONSTITUTION="$REPO/.specify/memory/constitution.md"

if [ -f "$CONSTITUTION" ]; then
  echo "STARTUP: Constitution loaded from $CONSTITUTION"
  awk 'NR==1&&/^---$/{f=1;next} f&&/^---$/{f=0;next} !f' "$CONSTITUTION" 2>/dev/null | head -20
fi

have() { command -v "$1" >/dev/null 2>&1 && echo ok || echo MISSING; }
VAULT_DIR="$(operator_vault 2>/dev/null)"
vault_state="not configured (no folder at ${VAULT_DIR:-?}; run /operator-os:init-vault)"
[ -n "$VAULT_DIR" ] && [ -d "$VAULT_DIR" ] && vault_state="ok"
remote_state="not configured (set OPERATOR_VAULT_REMOTE to enable the vault push)"
[ -n "${OPERATOR_VAULT_REMOTE:-}" ] && remote_state="ok"
llm_state="not configured (set OPERATOR_LOCAL_LLM_URL and OPERATOR_LOCAL_LLM_MODEL to enable the on-device lane)"
[ -n "${OPERATOR_LOCAL_LLM_URL:-}" ] && [ -n "${OPERATOR_LOCAL_LLM_MODEL:-}" ] && llm_state="ok"
rules_state="installed"
[ -f "$REPO/.claude/rules/execute-now.md" ] || rules_state="not installed (run /operator-os:install-rules)"

echo "operator-os status: jq=$(have jq) python3=$(have python3) git=$(have git) | vault: $vault_state | vault remote: $remote_state | local model lane: $llm_state | rules: $rules_state"

exit 0
