#!/usr/bin/env bash
# scrub-secrets-on-stop.sh, Stop hook. Finds live secrets that landed in this project's session
# transcripts (and, with OPERATOR_SCRUB_APPLY=1, redacts them before the archive goes cold).
#
# Why: ~/.claude/projects/ is a verbatim log of every session including raw tool output. Any secret
# printed during a session is written to disk in plaintext and fans out into subagent transcripts.
#
# Default is report-only (safe). Set OPERATOR_SCRUB_APPLY=1 to rewrite affected transcripts.
set -uo pipefail

SCRUBBER="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/scripts/scrub-transcripts.py"

if ! command -v python3 >/dev/null 2>&1; then
  echo "operator-os: scrub-secrets-on-stop not configured: python3 not found" >&2
  exit 0
fi
if [ ! -f "$SCRUBBER" ]; then
  echo "operator-os: scrub-secrets-on-stop not configured: $SCRUBBER missing" >&2
  exit 0
fi

ARGS=()
[ "${OPERATOR_SCRUB_APPLY:-0}" = "1" ] && ARGS+=(--apply)

if ! OUT="$(python3 "$SCRUBBER" "${ARGS[@]+"${ARGS[@]}"}" 2>&1)"; then
  echo "operator-os: transcript scrub failed: $OUT" >&2
  exit 0
fi

if echo "$OUT" | grep -q "files affected: [1-9]"; then
  echo "SECRETS FOUND IN SESSION ARCHIVE, rotation still required:"
  echo "$OUT" | grep -E "files affected|totals"
  echo "  Redacting the log does NOT rotate the credential. Rotate at the source."
fi

exit 0
