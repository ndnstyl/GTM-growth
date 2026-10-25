#!/usr/bin/env bash
# ============================================================================
# token-budget.sh, Estimate infrastructure vs conversation token spend per session
# ============================================================================
#
# WHAT IT DOES
#   Runs on Stop hook (or manually). For the current project, estimates:
#     - memory_tokens:   bytes of MEMORY.md + linked memory files loaded
#     - skills_tokens:   estimated tokens for the skill list system reminder
#     - hooks_tokens:    estimated tokens injected by PostToolUse warnings
#     - claude_md_tokens: bytes of global + project CLAUDE.md files
#     - total_infra:     sum of the above
#   Writes one JSONL row to ~/.claude/token-budget.jsonl
#
# WHY IT EXISTS
#   Right now infrastructure bloat is INVISIBLE. We can feel "context is
#   slower" but not see why. Instrumenting it lets us actually optimize
#   what's costing us. Token cost ~= bytes / 4 (rough Anthropic ratio).
#
# USAGE
#   # Run manually for current state
#   token-budget.sh
#
#   # Run with project override
#   token-budget.sh --project /path/to/.claude-managed-project
#
#   # Show summary of recent sessions (last 30 days)
#   token-budget.sh --report
#
# HOOK INTEGRATION
#   Add to ~/.claude/settings.json under "Stop" hook event:
#     {
#       "matcher": ".*",
#       "hooks": [{"type": "command", "command": "<plugin>/scripts/budget/token-budget.sh", "timeout": 5000}]
#     }
#
# CRON SUGGESTION (weekly summary)
#   0 8 * * 1  cd <your project> && /bin/bash <plugin>/scripts/budget/token-budget.sh --report
# ============================================================================

set -u

PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$PWD}}"
if [ -n "${OPERATOR_VAULT:-}" ]; then MEMORY_DIR="$OPERATOR_VAULT"; else MEMORY_DIR="$HOME/.claude/projects/$(printf '%s' "$PROJECT_DIR" | sed 's/[^A-Za-z0-9]/-/g')/memory"; fi
GLOBAL_CLAUDE="$HOME/.claude/CLAUDE.md"
PROJECT_CLAUDE="$PROJECT_DIR/CLAUDE.md"
LOG="$HOME/.claude/token-budget.jsonl"

MODE="record"
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT_DIR="$2"; shift 2 ;;
    --report)  MODE="report"; shift ;;
    --help|-h) sed -n '2,35p' "$0"; exit 0 ;;
    *) shift ;;
  esac
done

# Rough token estimation: bytes / 4 is Anthropic's stated ballpark
bytes_to_tokens() {
  echo $(( $1 / 4 ))
}

# Sum sizes of all .md files in a directory (top-level only)
dir_md_bytes() {
  local d="$1"
  [ ! -d "$d" ] && { echo 0; return; }
  local total=0
  for f in "$d"/*.md; do
    [ -f "$f" ] || continue
    sz=$(wc -c < "$f" | tr -d ' ')
    total=$((total + sz))
  done
  echo "$total"
}

# Count files in a directory matching pattern
count_files() {
  local d="$1"; local pat="$2"
  [ ! -d "$d" ] && { echo 0; return; }
  find "$d" -maxdepth 1 -type f -name "$pat" 2>/dev/null | wc -l | tr -d ' '
}

if [ "$MODE" = "report" ]; then
  if [ ! -f "$LOG" ]; then
    echo "no token-budget log yet at $LOG"
    exit 0
  fi
  echo "=== Token Budget, Last 30 sessions ==="
  printf "%-22s %10s %10s %10s %10s %12s\n" "timestamp" "memory" "claudemd" "infra" "skills_n" "memory_files"
  tail -30 "$LOG" | while read -r line; do
    ts=$(echo "$line" | jq -r '.timestamp // "?"')
    mem=$(echo "$line" | jq -r '.tokens.memory // 0')
    cmd=$(echo "$line" | jq -r '.tokens.claude_md // 0')
    inf=$(echo "$line" | jq -r '.tokens.total_infra // 0')
    sk=$(echo "$line" | jq -r '.counts.skills // 0')
    mf=$(echo "$line" | jq -r '.counts.memory_files // 0')
    printf "%-22s %10s %10s %10s %10s %12s\n" "$ts" "$mem" "$cmd" "$inf" "$sk" "$mf"
  done
  echo ""
  echo "=== 7-day trend ==="
  cutoff=$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)
  jq -s --arg cut "$cutoff" 'map(select(.timestamp >= $cut)) | {sessions: length, avg_infra: (map(.tokens.total_infra) | add / length | floor), max_infra: (map(.tokens.total_infra) | max)}' "$LOG" 2>/dev/null
  exit 0
fi

# Record mode, capture current state
mem_bytes=$(dir_md_bytes "$MEMORY_DIR")
global_md_bytes=$([ -f "$GLOBAL_CLAUDE" ] && wc -c < "$GLOBAL_CLAUDE" | tr -d ' ' || echo 0)
project_md_bytes=$([ -f "$PROJECT_CLAUDE" ] && wc -c < "$PROJECT_CLAUDE" | tr -d ' ' || echo 0)
total_md_bytes=$((global_md_bytes + project_md_bytes))

mem_tokens=$(bytes_to_tokens "$mem_bytes")
md_tokens=$(bytes_to_tokens "$total_md_bytes")

# Count skills (estimate ~75 tokens per skill in system reminder)
# Excludes archive/ subdirs since archived skills aren't surfaced to Claude.
skill_count=0
for skills_dir in "$HOME/.claude/skills" "$PROJECT_DIR/.claude/skills"; do
  [ -d "$skills_dir" ] || continue
  while IFS= read -r d; do
    # Skip anything inside an archive/ directory
    [[ "$d" == */archive/* ]] && continue
    [ -f "$d/SKILL.md" ] && skill_count=$((skill_count + 1))
  done < <(find "$skills_dir" -mindepth 1 -maxdepth 4 -type d 2>/dev/null)
done
skills_tokens=$((skill_count * 75))

# Hook overhead (rough estimate: each Bash/WebSearch/WebFetch + MCP call gets a 60-token untrusted-data warning)
# This is per-session, not per-load. Estimated ~600 tokens average for an active session.
hook_tokens=600

total_infra=$((mem_tokens + md_tokens + skills_tokens + hook_tokens))

memory_files=$(count_files "$MEMORY_DIR" "*.md")
ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
session_id="${CLAUDE_SESSION_ID:-${HOSTNAME}-$$}"

mkdir -p "$(dirname "$LOG")"
jq -cn \
  --arg ts "$ts" \
  --arg sid "$session_id" \
  --argjson mem "$mem_tokens" \
  --argjson md "$md_tokens" \
  --argjson sk "$skills_tokens" \
  --argjson hk "$hook_tokens" \
  --argjson total "$total_infra" \
  --argjson mfc "$memory_files" \
  --argjson skc "$skill_count" \
  --argjson mb "$mem_bytes" \
  --argjson mdb "$total_md_bytes" \
  '{
    timestamp: $ts,
    session_id: $sid,
    tokens: {
      memory: $mem,
      claude_md: $md,
      skills: $sk,
      hooks: $hk,
      total_infra: $total
    },
    bytes: {
      memory: $mb,
      claude_md: $mdb
    },
    counts: {
      memory_files: $mfc,
      skills: $skc
    }
  }' >> "$LOG"

# If invoked from Stop hook, exit silently. If invoked manually, print summary.
if [ -z "${CLAUDE_HOOK_EVENT:-}" ]; then
  echo "Recorded to $LOG:"
  tail -1 "$LOG" | jq '.'
fi
