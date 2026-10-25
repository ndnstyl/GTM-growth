#!/bin/bash
set -eu
# PreToolUse hook (matcher: Agent), VAULT RECALL FEEDER at the delegation boundary.
#
# WHY
#   MEMORY.md is loaded into the MAIN session prompt only, so a subagent starts with none of it.
#   Recall that lives only as prose in a rules file fails silently (about 80% recall, no error
#   signal). A hook that puts vault knowledge in front of every delegated agent does not.
#
# WHAT IT DOES
#   Runs the local BM25 retriever (scripts/memory/vault-search.py in this plugin) over the delegation
#   prompt and rewrites that prompt (PreToolUse hookSpecificOutput.updatedInput) to carry the top
#   vault hits. The subagent receives them inside its task text.
#
# NOT CONFIGURED
#   No vault directory (OPERATOR_VAULT, or the per-project memory folder) = the hook records
#   "not configured" in $STATE_DIR/feeder.err and the delegation proceeds unchanged.
#
# CONTRACT NOTES
#   - updatedInput REPLACES tool_input, so we merge onto the original object; dropping
#     subagent_type/description/model would silently reroute the agent.
#   - Retrieval is a POINTER, not evidence. The injected block says so.
#   - Fails OPEN: a recall feeder must never block a delegation. Every fail-open path is RECORDED,
#     not hidden: stderr of each stage lands in $STATE_DIR/feeder.err, and each injection writes one
#     receipt line to $STATE_DIR/log.jsonl.
#   - Idempotent: a prompt already carrying the block is passed through.

REPO="${CLAUDE_PROJECT_DIR:-$PWD}"
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
SEARCH="$(operator_plugin_root)/scripts/memory/vault-search.py"
STATE_DIR="${OPERATOR_RECALL_STATE:-$REPO/.operator/recall-state}"
MARKER="VAULT RECALL"
TOP_RAW=14      # pull deep, then filter dated noise
TOP_KEEP=6      # inject at most this many
MIN_QUERY_CHARS=12

# Every fail-open exit below goes through here so the reason is written down.
bail() { # reason
  if mkdir -p "$STATE_DIR" 2>>/dev/null; then
    printf '%s %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "vault-recall-inject: $1" >> "$STATE_DIR/feeder.err"
  else
    printf 'vault-recall-inject: %s (and state dir %s not writable)\n' "$1" "$STATE_DIR" >&2
  fi
  exit 0
}
mkdir -p "$STATE_DIR" || bail "state dir $STATE_DIR not writable"
ERR="$STATE_DIR/feeder.err"

INPUT=$(cat) || bail "stdin unreadable"
[ -n "$INPUT" ] || bail "empty payload"
command -v jq >/dev/null 2>>"$ERR" || bail "jq not installed"
[ -f "$SEARCH" ] || bail "vault-search.py missing at $SEARCH"
[ -d "$(operator_vault)" ] || bail "not configured: no vault at $(operator_vault) (set OPERATOR_VAULT or create it with /operator-os:init-vault)"

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>>"$ERR") || bail "payload not JSON"
[ "$TOOL_NAME" = "Agent" ] || exit 0

PROMPT=$(printf '%s' "$INPUT" | jq -r '.tool_input.prompt // empty' 2>>"$ERR") || bail "tool_input.prompt unreadable"
[ -n "$PROMPT" ] || bail "delegation prompt empty"

# Idempotency, never stack blocks.
case "$PROMPT" in *"$MARKER"*) exit 0 ;; esac

# Build the query from the delegation prompt:
#   - drop the [task_type=X] routing tag (pure harness vocabulary, not content)
#   - drop file paths and flags, which dominate BM25 with worthless tokens
#   - cap length; BM25 saturates long before this
QUERY=$(printf '%s' "$PROMPT" \
  | sed -e 's/\[task_type=[a-z_]*\]//g' \
        -e 's#/[A-Za-z0-9_./-]*##g' \
        -e 's/--[a-zA-Z-]*//g' \
  | tr '\n' ' ' | tr -s ' ' | cut -c1-600)

[ "${#QUERY}" -ge "$MIN_QUERY_CHARS" ] || bail "query under $MIN_QUERY_CHARS chars after cleaning"

# Retrieve. Exclude dated snapshots: briefs and raw/ are point-in-time captures,
# not durable learnings, and they crowd out the notes worth carrying.
RAW=$(python3 "$SEARCH" "$QUERY" --top "$TOP_RAW" 2>>"$ERR") || bail "vault-search exited non-zero (see $ERR)"
HITS=$(printf '%s\n' "$RAW" \
  | /usr/bin/grep -E '^\s*[0-9]+\. \[' \
  | /usr/bin/grep -v '00-BOARD/briefs/' \
  | /usr/bin/grep -v ' raw/' \
  | head -"$TOP_KEEP") || bail "no hits for: $(printf '%s' "$QUERY" | cut -c1-120)"

[ -n "$HITS" ] || bail "no hits for: $(printf '%s' "$QUERY" | cut -c1-120)"

VAULT="$(operator_vault)"

BLOCK=$(cat <<EOF

---
## $MARKER (auto-injected, you did not have this in context)

You are a subagent. The vault index (MEMORY.md) is loaded into the MAIN session
prompt only, so you started this task memory-blind. These are the highest-scoring
notes in the knowledge vault for your task, by local BM25:

$HITS

Vault root: $VAULT

Rules for using this block:
1. These are POINTERS, not evidence. Read a note before citing it. A ranked path
   is not a finding.
2. If a note contradicts what you infer from the code or the web, the vault is
   the record of the project, surface the conflict, do not silently pick a side.
3. Scores are relevance, not truth. A high score on an irrelevant note means the
   vault has nothing for this task; say so rather than forcing a fit.
4. NEVER write to the vault. Vault writes are main-loop-only
   (rules/learning-capture.md). Return the draft; the main loop applies it.
5. Need more than this? Search yourself, scoped to what your toolset allows:
   python3 $SEARCH "<query>" --top 8 --snippets   (needs unrestricted Bash)
   or use the Grep/Glob/Read tools directly against the vault root above.
---
EOF
)

NEW_PROMPT="${PROMPT}${BLOCK}"

# One receipt line per injection (same log as the turn feeder).
printf '%s' "$HITS" | jq -R -s -c \
  --arg ts "$(date +%Y-%m-%dT%H:%M:%S%z)" \
  --arg q "$(printf '%s' "$QUERY" | cut -c1-200)" \
  '{ts:$ts, feeder:"agent", query:$q, injected:[split("\n")[] | select(length>0) | sub("^\\s*[0-9]+\\. \\[[ 0-9.]+\\] ";"")]}' \
  >> "$STATE_DIR/log.jsonl" 2>>"$ERR" \
  || printf '%s vault-recall-inject: receipt line not written\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" >> "$ERR"

# Merge onto the ORIGINAL tool_input, updatedInput replaces the object wholesale.
printf '%s' "$INPUT" | jq -c \
  --arg p "$NEW_PROMPT" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",updatedInput:(.tool_input | .prompt = $p)}}' \
  2>>"$ERR" || bail "jq merge of updatedInput failed (delegation proceeds unchanged)"

exit 0
