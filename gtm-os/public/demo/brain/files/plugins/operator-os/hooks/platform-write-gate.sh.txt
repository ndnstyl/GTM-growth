#!/bin/bash
set -Eeu
# PreToolUse hook (Bash and mcp__*): the platform-write gate.
#
# THE RULE: a call that WRITES TO A PLATFORM OUTSIDE THIS MACHINE (your CRM, an ad platform, a vendor
# sheet, a shared drive, email, a hosting account, a workflow server) checks with the operator first.
# A change that is local only (code, config, data files, the vault, receipts) is checkpointed and made
# without asking. The line runs between local-and-revertible and outward-and-not.
#
# HOW: a registry file lists every write surface as a regex (a Bash command string, or an MCP tool
# name). A match is DENIED unless .operator/approvals/ holds a token that (a) names the gate id,
# (b) is unexpired, (c) has uses left, (d) pins the sha256 of this exact call or says "*", and (e) has
# a matching "minted" row in the gate log (a well-formed file written by anything else is a forgery).
# A pass CONSUMES one use, under a lock. The operator mints a token with scripts/approve-write.py,
# typed with the "!" prefix so it is not a tool call and never passes through this hook.
#
# THE REGISTRY SHIPS EMPTY. With no gates this hook allows everything and says so once per project.
# Add one row per write surface you run. See docs/platform-write-gate.md.
#   registry: $OPERATOR_PLATFORM_WRITES, else $CLAUDE_PROJECT_DIR/.operator/platform-writes.json,
#             else the empty example beside this file.
#   state:    $CLAUDE_PROJECT_DIR/.operator/approvals/ and .operator/receipts/write_gate.jsonl
#
# Exit 0 = allow, exit 2 = deny. Any internal failure DENIES (a gate that cannot finish must never allow).

gate_abort() {
  printf 'platform-write-gate: aborted at line %s (rc=%s). Denying: a gate that cannot finish must never allow.\n' "$2" "$1" >&2
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"platform-write-gate failed internally at line %s (rc %s). Denying, because a gate that cannot complete must never allow a platform write. Check the hook stderr."}}\n' "$2" "$1"
  exit 2
}
trap 'gate_abort $? $LINENO' ERR

INPUT=$(cat)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_lib.sh"
PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
STATE="$PROJ/.operator"
REG="${OPERATOR_PLATFORM_WRITES:-$STATE/platform-writes.json}"
[ -f "$REG" ] || REG="$HERE/platform-writes.json"
APPROVALS="$STATE/approvals"
LOG="$STATE/receipts/write_gate.jsonl"
if ! mkdir_err=$(mkdir -p "$APPROVALS" "$(dirname "$LOG")" 2>&1); then
  printf 'platform-write-gate: cannot create state directories (%s). Gated calls will deny.\n' "$mkdir_err" >&2
fi

TOOL=$(tool_name)
[ -n "$TOOL" ] || exit 0
[ -f "$REG" ] || deny "platform-write registry missing at $REG; refusing every call until it is restored"
if ! jq -e '.gates | type == "array"' "$REG" >/dev/null 2>&1; then
  deny "platform-write registry at $REG is not parseable JSON with a .gates array; refusing every $TOOL call until it is fixed"
fi

if [ "$TOOL" = "Bash" ]; then
  SUBJECT=$(tool_command); KIND="bash"
else
  case "$TOOL" in mcp__*) : ;; *) exit 0 ;; esac
  SUBJECT="$TOOL"; KIND="mcp"
fi
[ -n "$SUBJECT" ] || exit 0

# Keystone: the mint script and the approvals folder are always gated, even with an empty registry,
# because a minted token unlocks every other gate. No agent may mint its own approval.
if [ "$KIND" = "bash" ] && printf '%s' "$SUBJECT" | tr '\n' ';' | grep -Eiq 'approve-write\.py|\.operator/approvals'; then
  deny "PLATFORM WRITE gate [approval-mint]: minting or touching approvals is the operator's act. Run it yourself with the ! prefix, once per gate: python3 \"\${CLAUDE_PLUGIN_ROOT}/scripts/approve-write.py\" <gate-id> --ttl 900"
fi

GATE_COUNT=$(jq '.gates | length' "$REG")
if [ "$GATE_COUNT" -eq 0 ]; then
  NOTICE="$STATE/.write-gate-empty-notice"
  if [ ! -f "$NOTICE" ]; then
    printf 'operator-os: platform-write gate not configured (the registry has no gates); platform writes are NOT gated. Add rows per docs/platform-write-gate.md.\n' >&2
    : > "$NOTICE"
  fi
  exit 0
fi

SUBJECT_MATCH=$(printf '%s' "$SUBJECT" | tr '\n' ';')
if [ "$KIND" = "mcp" ]; then
  FULL_INPUT=$(printf '%s' "$INPUT" | jq -c '.tool_input // .input // {}')
  SUBJECT_SHA=$(printf '%s%s' "$SUBJECT" "$FULL_INPUT" | shasum -a 256 | cut -c1-16)
else
  SUBJECT_SHA=$(printf '%s' "$SUBJECT" | shasum -a 256 | cut -c1-16)
fi

log() {  # log EVENT GATE [detail]
  local session=""
  if ! session=$(printf '%s' "$INPUT" | jq -r '.session_id // empty'); then session=""; fi
  if ! jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg ev "$1" --arg gate "$2" --arg sha "$SUBJECT_SHA" \
    --arg subj "${SUBJECT:0:300}" --arg d "${3:-}" --arg session "$session" \
    '{ts:$ts,event:$ev,gate:$gate,subject_sha:$sha,subject:$subj,detail:$d,session_id:$session}' >> "$LOG"; then
    printf 'platform-write-gate: could not append a %s row to %s; the verdict stands but the trail is incomplete.\n' "$1" "$LOG" >&2
  fi
}

# Fail closed on a registry regex grep rejects (grep exits 2 on a bad regex, 1 on no match).
BAD=$(trap - ERR; set +eE; jq -r --arg kind "$KIND" '.gates[] | select(.kind==$kind) | .pattern' "$REG" | while read -r pat; do
    grc=0
    gerr=$(printf 'x' | grep -Eq -- "$pat" 2>&1) || grc=$?
    if [ "$grc" -eq 2 ]; then printf '%s :: %s\n' "$pat" "${gerr:-no detail}"; fi
  done)
[ -z "$BAD" ] || deny "platform-write registry has an invalid regex (${BAD:0:160}); refusing every $KIND call until it is fixed"

# Collect EVERY matching row, not the first: a decoy segment must not hide a real write.
US=$(printf '\037')
MATCH=$(jq -r --arg kind "$KIND" '.gates[] | select(.kind==$kind) | [.id, .platform, .pattern] | join("\u001f")' "$REG" | \
  while IFS="$US" read -r gid plat pat; do
    [ -n "$pat" ] || continue
    if printf '%s' "$SUBJECT_MATCH" | grep -Eiq -- "$pat"; then printf '%s\t%s\n' "$gid" "$plat"; fi
  done)
[ -n "$MATCH" ] || exit 0

# Optionally downgrade a match whose pattern survives only inside data (an echo, a commit message).
# Needs command_scope.py from this plugin; if absent, deny on the pattern alone.
SCOPE="$HERE/command_scope.py"
KEPT=""
while IFS=$'\t' read -r GATE PLATFORM; do
  [ -n "$GATE" ] || continue
  if [ "$KIND" = "bash" ] && [ -f "$SCOPE" ]; then
    SCOPE_PAT=$(jq -r --arg id "$GATE" '.gates[] | select(.id==$id) | .pattern' "$REG")
    SCOPE_RC=0
    SCOPE_WHY=$(trap - ERR; set +eE; printf '%s' "$SUBJECT_MATCH" | python3 "$SCOPE" --pattern "$SCOPE_PAT" 2>&1 >/dev/null) || SCOPE_RC=$?
    if [ "$SCOPE_RC" -eq 0 ]; then
      log "mention" "$GATE" "downgraded: the pattern survives only in data, nothing here executes it"
      continue
    fi
  fi
  KEPT="${KEPT}${GATE}"$'\t'"${PLATFORM}"$'\n'
done <<< "$MATCH"
[ -n "$KEPT" ] || exit 0

NOW=$(date -u +%s)
LOCK="$APPROVALS/.gate.lock"
tries=0
until mkdir "$LOCK" 2>/dev/null; do  # loud-failure-exempt: a failed mkdir IS the lock being held; the loop counts tries and deny() names the lock at ten seconds
  tries=$((tries + 1))
  if [ "$tries" -ge 100 ]; then
    deny "PLATFORM WRITE gate: the approvals lock $LOCK could not be taken in ten seconds (another call holds it, or a crashed one left it; remove it by hand if no gate is running). Refusing rather than spending a token unmetered."
  fi
  sleep 0.1
done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT  # loud-failure-exempt: on a deny path the lock may already be gone; the verdict already stands

find_token() {  # find_token GATE -> prints the approval path, or nothing
  local gate="$1" f tsv a_gate a_sha a_exp a_uses
  for f in "$APPROVALS"/"$gate"__*.json; do
    [ -f "$f" ] || continue
    if ! grep -E "\"file\": ?\"$(basename "$f")\"" "$LOG" 2>/dev/null | grep -Eq '"event": ?"minted"'; then  # loud-failure-exempt: an absent log reads as no minted row, which is the refusal logged on the next line
      log "token_unminted" "$gate" "$(basename "$f"): no minted row names this file; refused as a forgery"
      continue
    fi
    if ! tsv=$(jq -r '[.gate, (.subject_sha // "*"), (.expires_at // 0), (.uses_left // 0)] | @tsv' "$f" 2>&1); then
      log "token_unreadable" "$gate" "$(basename "$f"): ${tsv:0:120}"
      continue
    fi
    IFS=$'\t' read -r a_gate a_sha a_exp a_uses <<< "$tsv"
    [ "$a_gate" = "$gate" ] || continue
    if ! [[ "$a_exp" =~ ^[0-9]+$ ]] || ! [[ "$a_uses" =~ ^-?[0-9]+$ ]]; then
      log "token_malformed" "$gate" "$(basename "$f")"
      continue
    fi
    [ "$a_exp" -gt "$NOW" ] || continue
    [ "$a_uses" -gt 0 ] || continue
    if [ "$a_sha" = "*" ] || [ "$a_sha" = "$SUBJECT_SHA" ]; then printf '%s' "$f"; return 0; fi
  done
  return 0
}

TOKENS=""; MISSING=""
while IFS=$'\t' read -r GATE PLATFORM; do
  [ -n "$GATE" ] || continue
  tok=$(find_token "$GATE")
  if [ -n "$tok" ]; then TOKENS="${TOKENS}${GATE}"$'\t'"${tok}"$'\n'; else MISSING="${MISSING}${GATE} "; log "denied" "$GATE" "$PLATFORM"; fi
done <<< "$KEPT"

if [ -n "$MISSING" ]; then
  MINTS=""
  for g in $MISSING; do MINTS="${MINTS}  python3 \"\${CLAUDE_PLUGIN_ROOT}/scripts/approve-write.py\" $g --subject-sha $SUBJECT_SHA --ttl 900"$'\n'; done
  deny "PLATFORM WRITE gate [${MISSING% }]: this is a write outside this machine. Check with the operator. If approved, THEY run (with the ! prefix, once per gate):
${MINTS}then re-issue the exact same call. Local-only changes are not gated: checkpoint, change, log."
fi

while IFS=$'\t' read -r GATE f; do
  [ -n "$GATE" ] || continue
  tmp="$f.tmp.$$"
  if ! consume_err=$(jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg sha "$SUBJECT_SHA" \
    '.uses_left -= 1 | .consumed += [{at:$ts, subject_sha:$sha}]' "$f" > "$tmp" 2>&1); then
    rm -f "$tmp"
    log "token_consume_failed" "$GATE" "$(basename "$f"): ${consume_err:0:120}"
    deny "PLATFORM WRITE gate [$GATE]: a live approval exists but its use could not be consumed. Refusing rather than granting an unmetered use."
  fi
  mv -f "$tmp" "$f"
  log "approved" "$GATE" "$(basename "$f")"
done <<< "$TOKENS"
exit 0
