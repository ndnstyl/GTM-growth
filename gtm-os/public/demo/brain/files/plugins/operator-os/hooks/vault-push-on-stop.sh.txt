#!/bin/bash
# Stop hook: no turn ends with a vault write that only exists on this machine.
#
# THE RULE: if your knowledge vault has a canonical home on another machine (a server, a second box),
# every distill and every vault write is pushed there and verified in the same turn.
#
# NOT CONFIGURED: with OPERATOR_VAULT_REMOTE unset this hook prints one "not configured" line and does
# nothing. Set it to an rsync/ssh destination (user@host:/path/to/vault) to enable the push.
#
# WHY A HOOK: a step in a skill file can be skipped; a Stop hook runs on every turn. It pushes only
# when a vault file changed since the last good push.
#
# CONTRACT: never blocks the turn (exit 0 always). A failed push is loud on stderr here.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
PUSH="$(operator_plugin_root)/scripts/memory/vault_push.py"
if [ -z "${OPERATOR_VAULT_REMOTE:-}" ]; then
  echo "operator-os: vault push not configured (OPERATOR_VAULT_REMOTE unset); the vault stays on this machine" >&2
  exit 0
fi
if [ ! -f "$PUSH" ]; then
  echo "vault-push-on-stop: $PUSH missing; the vault push tool is missing from the plugin" >&2
  exit 0
fi
if ! OUT=$(python3 "$PUSH" --if-dirty --quiet 2>&1); then
  echo "vault-push-on-stop: the vault did NOT reach the remote: $OUT" >&2
fi
exit 0
