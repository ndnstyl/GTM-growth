#!/bin/bash
set -euo pipefail
# PreToolUse (Bash) hook: structured numbers come from the warehouse through the accuracy hierarchy,
# never from an agent hand-summing a governed dataset in the terminal.
#
# THE RULE: a number with a defined grain (cost, revenue, KPI) is produced by a deterministic query or
# view, one definition reused everywhere. Hand-reasoning is non-deterministic: a cost percentage that
# moves 15.9, then 16.45, then 17.0 across three hand passes is the failure this hook exists to stop.
# Rule: rules/warehouse-first.md.
#
# WHAT IT CATCHES: a Bash command that names a GOVERNED dataset AND aggregates it (SUM, GROUP BY, .sum(),
# running totals, awk totals). Reads and slices are allowed. The sanctioned pipeline is never blocked.
#
# CONFIGURE (ships off): set patterns in $CLAUDE_PROJECT_DIR/.operator/warehouse-first.json:
#   {"governed": "regex naming your governed datasets", "sanctioned": "regex for your pipeline modules"}
# With no file this hook prints one "not configured" line per project and allows everything.
#
# Exit 0 = allow, exit 2 = block.

INPUT=$(cat)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_lib.sh"

TOOL=$(tool_name)
[ "$TOOL" = "Bash" ] || exit 0
CMD=$(tool_command)
[ -n "$CMD" ] || exit 0

PROJ="${CLAUDE_PROJECT_DIR:-$PWD}"
CFG="${OPERATOR_WAREHOUSE_FIRST:-$PROJ/.operator/warehouse-first.json}"
if [ ! -f "$CFG" ]; then
  NOTICE="$PROJ/.operator/.warehouse-first-notice"
  if [ ! -f "$NOTICE" ]; then
    mkdir -p "$PROJ/.operator"
    printf 'operator-os: warehouse-first gate not configured (%s missing); hand-aggregation is NOT checked.\n' "$CFG" >&2
    : > "$NOTICE"
  fi
  exit 0
fi
GOVERNED=$(jq -r '.governed // empty' "$CFG")
SANCTIONED=$(jq -r '.sanctioned // empty' "$CFG")
[ -n "$GOVERNED" ] || deny "warehouse-first config at $CFG has no 'governed' regex; fix it or delete the file"

# 1. The sanctioned pipeline is the hierarchy itself. Never blocked.
if [ -n "$SANCTIONED" ] && printf '%s' "$CMD" | grep -Eq "$SANCTIONED"; then exit 0; fi

# 2. Is a governed dataset named?
printf '%s' "$CMD" | grep -Eq "$GOVERNED" || exit 0

# 3. Is it being aggregated into a number?
AGG='SUM\(|sum\(|GROUP BY|group_by|\.sum\(\)|\bsum=|[a-zA-Z_]+ *\+= *(float|int|Decimal|amount|spend|cost|revenue|[0-9])|awk[^|]*\{[^}]*(\+=|sum)'
printf '%s' "$CMD" | grep -Eq "$AGG" || exit 0

deny "Warehouse-first: this command aggregates a governed dataset into a number by hand. Structured numbers come from the warehouse through the accuracy hierarchy (research proves and pins the inputs, report computes and recomputes a second way, a senior pass ties out from a different pull; the pass/fail matrix is the gate), never from an agent summing a file in the terminal. A hand-summed figure is a HYPOTHESIS, never a delivered answer. Route it: (1) run the sanctioned pipeline, or (2) if the compute does not exist yet, BUILD it as a warehouse query or view and read the number off the matrix. Exploration that only reads or slices is fine. Rule: rules/warehouse-first.md."
