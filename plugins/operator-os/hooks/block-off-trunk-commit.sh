#!/bin/bash
command -v jq >/dev/null 2>&1 || { echo "operator-os: jq not installed; $(basename "$0") skipped (install jq to enable this hook)" >&2; exit 0; }
set -Eeu
# PreToolUse hook (Bash): refuse a `git commit` that lands off trunk.
#
# Policy: one main, feature branches and pull requests for kit work. Every session commits to
# `main` or to a `spec/NNN-` worktree branch.
#
# THE RULE:
#   - `git commit` (any form: plain, -a, -m, --amend, -F, inside a chain) is DENIED unless the
#     repository's checked-out branch is `main`, OR matches `^spec/[0-9]{3}-` AND the commit is
#     running from a worktree whose path is NOT the shared root ($CLAUDE_PROJECT_DIR).
#   - Hosts listed in OPERATOR_NO_COMMIT_HOSTS (a regex over `hostname -s`, unset = none) deny every
#     `git commit` outright (for a server that only fast-forwards from main).
#   - `git status`, `git log`, `git diff`, `git show`, and every other non-commit git subcommand
#     are never matched.
#
# Your own branch pattern: set OPERATOR_TRUNK_BRANCH_RX to a regex (for example '^(main|feature/.+)$') and a
# commit on any branch that matches it is allowed. Unset = the policy above, unchanged.
#
# Grace: a one-time convergence commit on the current parked branch is allowed when the operator sets
# OPERATOR_TRUNK_GRACE=1 in the environment, or creates the file .operator/TRUNK_GRACE (either one;
# both are logged as grace use, never silent). The grace is per-invocation, not per-session.
#
# Every denial and every grace use is appended to .operator/receipts/branch_guard.jsonl.
# Exit 0 = allow, exit 2 = deny.

gate_abort() {
  local rc="$1" line="$2"
  printf 'block-off-trunk-commit: aborted at line %s (rc=%s). Denying: a gate that cannot finish must never allow.\n' "$line" "$rc" >&2
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"block-off-trunk-commit failed internally at line %s (rc %s). Denying because a gate that cannot complete must never allow a commit."}}\n' "$line" "$rc"
  exit 2
}
trap 'gate_abort $? $LINENO' ERR

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" || { echo '{"decision":"block","reason":"hook library missing or unreadable: hooks/_lib.sh"}'; exit 2; }

BRAIN="${CLAUDE_PROJECT_DIR:-$PWD}"
LOG="$BRAIN/.operator/receipts/branch_guard.jsonl"
GRACE_FILE="$BRAIN/.operator/TRUNK_GRACE"
RULE="Policy: one main, kit work on spec/NNN- worktree branches. The only allowed path: git commit on main, or on a spec/NNN- branch inside its own worktree (never the shared root). To allow your own branch names set OPERATOR_TRUNK_BRANCH_RX to a regex. Grace for a one-time convergence commit: set OPERATOR_TRUNK_GRACE=1 or create $GRACE_FILE (the operator only)."

if ! mkdir_err=$(mkdir -p "$(dirname "$LOG")" 2>&1); then
  printf 'block-off-trunk-commit: cannot create log directory (%s). The trail will be incomplete; the verdict still stands.\n' "${mkdir_err:-unknown error}" >&2
fi

log_event() {  # log_event EVENT REASON [branch] [host]
  local session=""
  if ! session=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null); then session=""; fi  # loud-failure-exempt: a session id this hook cannot read is not a reason to fail the commit decision; the row is still written with session_id empty, which is visible in the log
  if ! jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg ev "$1" --arg reason "$2" \
    --arg branch "${3:-}" --arg host "${4:-}" --arg session "$session" \
    '{ts:$ts,event:$ev,reason:$reason,branch:$branch,host:$host,session_id:$session}' >> "$LOG"; then
    printf 'block-off-trunk-commit: could not append a %s row to %s, the verdict stands but the trail is incomplete.\n' "$1" "$LOG" >&2
  fi
}

TOOL=$(tool_name)
[ "$TOOL" = "Bash" ] || exit 0

CMD=$(tool_command)
[ -n "$CMD" ] || exit 0

# Only `git commit` invocations are evaluated past this point.
if ! printf '%s' "$CMD" | grep -Eq '(^|[;&|]|[[:space:]])git([[:space:]]+-[A-Za-z-]+(=[^[:space:]]+)?)*[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

HOST="$(hostname -s 2>/dev/null || echo unknown)"  # loud-failure-exempt: a missing hostname falls back to the literal "unknown", which simply never matches the no-commit host regex below, so the rest of the verdict logic still runs unaffected
if [ -n "${OPERATOR_NO_COMMIT_HOSTS:-}" ] && printf '%s' "$HOST" | grep -Eiq "$OPERATOR_NO_COMMIT_HOSTS"; then
  log_event "deny" "commit attempted on a no-commit host" "" "$HOST"
  deny "git commit refused on $HOST: this host only fast-forwards from main, it never commits. $RULE" "BLOCKED"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"  # loud-failure-exempt: outside a repo rev-parse fails, BRANCH reads empty, and the very next check denies by name ("could not determine a named branch"), which is the correct verdict for a commit with no repository at all
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  log_event "deny" "detached HEAD or unreadable branch" "$BRANCH" "$HOST"
  deny "git commit refused: could not determine a named branch (detached HEAD or unreadable). $RULE" "BLOCKED"
fi

TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"  # loud-failure-exempt: failure here leaves TOPLEVEL empty; only the spec/ branch path below reads it, and an empty value there is treated as "not the shared root", which still reaches a named deny or allow, never a silent pass
SHARED_ROOT="$(cd "$BRAIN" 2>/dev/null && pwd -P || echo "$BRAIN")"  # loud-failure-exempt: if cd fails, BRAIN itself (an absolute path already) is used verbatim as the comparison root
TOPLEVEL_RESOLVED="$(cd "$TOPLEVEL" 2>/dev/null && pwd -P || echo "$TOPLEVEL")"  # loud-failure-exempt: same as above, falls back to the unresolved TOPLEVEL string, which still compares correctly against SHARED_ROOT in the common case

GRACE_ACTIVE=0
if [ "${OPERATOR_TRUNK_GRACE:-}" = "1" ] || [ -f "$GRACE_FILE" ]; then
  GRACE_ACTIVE=1
fi

if [ "$BRANCH" = "main" ]; then
  exit 0
fi

if [ -n "${OPERATOR_TRUNK_BRANCH_RX:-}" ] && printf '%s' "$BRANCH" | grep -Eq "$OPERATOR_TRUNK_BRANCH_RX"; then
  exit 0
fi

if printf '%s' "$BRANCH" | grep -Eq '^spec/[0-9]{3}-'; then
  if [ -n "$TOPLEVEL_RESOLVED" ] && [ "$TOPLEVEL_RESOLVED" != "$SHARED_ROOT" ]; then
    exit 0
  fi
  log_event "deny" "spec/ branch but running from the shared root, not its own worktree" "$BRANCH" "$HOST"
  deny "git commit refused: branch $BRANCH matches spec/NNN- but this is the shared root ($SHARED_ROOT), not a dedicated worktree. $RULE" "BLOCKED"
fi

if [ "$GRACE_ACTIVE" = "1" ]; then
  log_event "grace_used" "convergence commit allowed on parked branch $BRANCH" "$BRANCH" "$HOST"
  exit 0
fi

log_event "deny" "parked branch, not main, not a spec/ worktree" "$BRANCH" "$HOST"
deny "git commit refused: branch '$BRANCH' is neither main nor a spec/NNN- worktree branch. $RULE" "BLOCKED"
