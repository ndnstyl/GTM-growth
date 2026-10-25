#!/bin/bash
set -euo pipefail
# PreToolUse (Bash) hook: nothing that leaves this machine names a path ON this machine.
#
# THE RULE: a path on your machine exposes its layout to people who have no business seeing it, can
# never be opened by the reader, and goes stale the day the work moves host.
#
# WHAT MAY TRAVEL: a shared-drive location the recipient can actually open, a public URL, or a
# warehouse identifier. When a reader needs a receipt, hand them a PROMPT that retrieves it, never a path.
#
# WHAT IT CHECKS: the draft spec (subject, body, AND every attachment's text) and any file put on a
# shared drive, for commands matching OPERATOR_OUTBOUND_CMD_RX (an ERE over the Bash command; the default
# covers mail, cloud-copy and issue-posting CLIs). A clean body can carry paths inside an attached PDF,
# so a body-only check would pass it.
#
# Exit 0 = allow, exit 2 = block. Every non-zero path below is explicit because `set -e` is on.

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }  # loud-failure-exempt: the || branch on this same line denies with a named reason and a non-zero exit; the suppressed text is bash's own "no such file" for the exact path the refusal already prints

TOOL=$(tool_name)
[ "$TOOL" = "Bash" ] || exit 0
CMD=$(tool_command)
[ -n "$CMD" ] || exit 0

# Only outbound surfaces: staging an email, or putting a file on a shared drive.
OUTBOUND_RX="${OPERATOR_OUTBOUND_CMD_RX:-(^|[;&|[:space:]])(mutt|mailx|rclone|gsutil|aws[[:space:]]+s3|gh[[:space:]]+(issue|pr)[[:space:]]+(create|comment))([[:space:]]|\$)}"
printf '%s' "$CMD" | grep -Eq "$OUTBOUND_RX" || exit 0

SCANNER="$(dirname "${BASH_SOURCE[0]}")/outbound_path_scan.py"
if [ ! -f "$SCANNER" ]; then
  deny "Outbound path gate is armed but its scanner is missing at hooks/outbound_path_scan.py. A gate that cannot run refuses rather than passing."
  exit 2
fi

# The payload arguments: the draft spec json, or the file being put. No match is a normal
# outcome (a put with an odd extension), so it is caught explicitly rather than with || true.
TARGETS=$(printf '%s' "$CMD" | grep -oE '(/[^ "'"'"']+|[A-Za-z0-9_./-]+)\.(json|pdf|md|html|csv|txt)' | sort -u) || TARGETS=""
[ -n "$TARGETS" ] || exit 0

RC=0
OUT=$(python3 "$SCANNER" $TARGETS 2>&1) || RC=$?

if [ "$RC" -eq 3 ]; then
  deny "Outbound path gate could not READ part of this payload, so it refuses rather than assuming it is clean: ${OUT}. Make the payload readable and retry."
  exit 2
fi

if [ "$RC" -eq 2 ]; then
  SAMPLE=$(printf '%s' "$OUT" | head -12)
  deny "Local paths leave this machine. This outbound payload names paths or commands on THIS machine:

${SAMPLE}

A path on your machine exposes its layout to a reader who can never open it, and goes stale when the work moves host.

Send instead: a shared-drive location the recipient can actually open, a public URL, or a warehouse identifier. If they need a receipt, give them a PROMPT that retrieves it, never a path to go look at.

The scan reads ATTACHMENT TEXT, not just the body. If the body looks clean, the hit is inside an attached PDF and that PDF must be reissued before it travels."
  exit 2
fi

if [ "$RC" -ne 0 ]; then
  deny "Outbound path gate exited ${RC}, which is not a verdict it knows how to read: ${OUT}. Refused rather than passed."
  exit 2
fi

exit 0
