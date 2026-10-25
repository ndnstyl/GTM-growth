#!/bin/bash
set -euo pipefail
# UserPromptSubmit hook, VAULT RECALL FEEDER for the main loop's own turns.
#
# The delegation feeder (vault-recall-inject.sh) fires only when work is handed to a subagent. On the
# main loop's own turns recall would depend on the session remembering to search; this hook makes
# recall fire on a domain pivot without being asked.
#
# CONTRACT
#   - stdin: the UserPromptSubmit payload (prompt, session_id).
#   - stdout: hookSpecificOutput.additionalContext with <=5 note TITLES and verified dates, only when
#     the message changes subject. Nothing on a same-subject turn.
#   - exit 0 always. Every degraded path (search failed, reranker down, past deadline, module missing,
#     module crashed, no vault) is NAMED in the injected block; never a silent skip.
#   - All logic lives in scripts/memory/recall_turn.py in this plugin; this file only routes.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
MOD="$(operator_plugin_root)/scripts/memory/recall_turn.py"
VAULT_DIR="$(operator_vault)"
if [ ! -d "$VAULT_DIR" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"recall: not configured (no vault at %s; set OPERATOR_VAULT)"}}\n' "$VAULT_DIR"
  exit 0
fi
fail() {
  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"recall: FAILED, %s"}}\n' "$1"
  exit 0
}
[ -f "$MOD" ] || fail "recall_turn.py missing at $MOD"
ERR=$(mktemp)
export OPERATOR_VAULT="$VAULT_DIR"
if ! python3 "$MOD" 2>"$ERR"; then
  fail "recall_turn.py exited non-zero: $(tr -d '"\\' < "$ERR" | tail -1 | cut -c1-160)"
fi
rm -f "$ERR"
exit 0
