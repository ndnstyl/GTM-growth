#!/usr/bin/env bash
# local-ask.sh, run an instruction over a file on an ON-DEVICE model, so the file's bytes never reach a cloud model.
#
# usage: local-ask.sh -f <input-file> "<instruction>" --out <result-file> [--summary]
#
# Configuration (environment):
#   OPERATOR_LOCAL_LLM_URL    base URL of an OpenAI-compatible server on this machine or your LAN,
#                             e.g. http://<host>:<port>/v1   (REQUIRED)
#   OPERATOR_LOCAL_LLM_MODEL  model name to request (REQUIRED)
#   OPERATOR_LOCAL_LLM_KEY    bearer token if your server wants one (optional)
#
# Unconfigured = prints one "not configured" line and exits 3. It never falls back to a cloud model.
# With --summary, a second pass asks the model for a PII-stripped digest and prints only that.
# Without --summary, only a mechanical confirmation (path, lines, bytes) is printed.
set -euo pipefail

if [ -z "${OPERATOR_LOCAL_LLM_URL:-}" ] || [ -z "${OPERATOR_LOCAL_LLM_MODEL:-}" ]; then
  echo "operator-os: local-ask not configured: set OPERATOR_LOCAL_LLM_URL and OPERATOR_LOCAL_LLM_MODEL (an on-device OpenAI-compatible server). Nothing was sent anywhere." >&2
  exit 3
fi
for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "operator-os: local-ask needs $bin installed" >&2; exit 3; }
done

IN=""; INSTR=""; OUT=""; SUMMARY=0
while [ $# -gt 0 ]; do
  case "$1" in
    -f) IN="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --summary) SUMMARY=1; shift ;;
    *) INSTR="$1"; shift ;;
  esac
done
[ -n "$IN" ] && [ -f "$IN" ] || { echo "local-ask: -f <input-file> missing or not a file" >&2; exit 2; }
[ -n "$INSTR" ] || { echo "local-ask: instruction missing" >&2; exit 2; }
[ -n "$OUT" ] || { echo "local-ask: --out <result-file> is required so the raw result stays on-device" >&2; exit 2; }

ask() {  # ask <prompt-text> -> model text on stdout
  local body resp
  body=$(jq -cn --arg m "$OPERATOR_LOCAL_LLM_MODEL" --arg p "$1" \
    '{model:$m, stream:false, messages:[{role:"user", content:$p}]}')
  local auth=()
  [ -n "${OPERATOR_LOCAL_LLM_KEY:-}" ] && auth=(-H "Authorization: Bearer $OPERATOR_LOCAL_LLM_KEY")
  resp=$(curl -sS --max-time 600 "${auth[@]+"${auth[@]}"}" -H 'Content-Type: application/json' \
    -d "$body" "${OPERATOR_LOCAL_LLM_URL%/}/chat/completions") \
    || { echo "local-ask: the local model server at $OPERATOR_LOCAL_LLM_URL did not answer" >&2; return 4; }
  printf '%s' "$resp" | jq -er '.choices[0].message.content' \
    || { echo "local-ask: the local model returned no content: $(printf '%s' "$resp" | head -c 300)" >&2; return 4; }
}

PAYLOAD="$(cat "$IN")"
RESULT="$(ask "$INSTR

--- INPUT ---
$PAYLOAD")" || exit 4
mkdir -p "$(dirname "$OUT")"
printf '%s\n' "$RESULT" > "$OUT"
echo "local-ask: wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines, $(wc -c < "$OUT" | tr -d ' ') bytes)"

if [ "$SUMMARY" = "1" ]; then
  ask "Summarise the text below in at most 8 lines. Remove every name, phone number, email address, street address, account number and credential. Keep only counts, categories and conclusions.

$RESULT" || exit 4
fi
