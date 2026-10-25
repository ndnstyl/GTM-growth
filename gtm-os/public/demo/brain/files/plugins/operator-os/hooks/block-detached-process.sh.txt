#!/bin/bash
set -euo pipefail
# PreToolUse (Bash) hook: an agent never leaves a process running that nobody supervises.
#
# THE RULE: a process an agent starts dies with the agent or lives under a scheduler. A test
# database started with a detached background launch can run for days with no owner; hung test
# runners pile up the same way. Rule: rules/loud-failure.md in this plugin.
#
# WHAT IT CATCHES, at command position only (a word in a grep pattern or a message is not a launch):
#   - the detach verbs: nohup, setsid, disown; a self-backgrounding ssh (ssh -f, autossh)
#   - pg_ctl ... start|restart, and a bare `postgres -D`
#   - a long-lived server put in the background with a lone `&` when the same command never
#     waits for it or kills it (uvicorn, gunicorn, http.server, cloudflared tunnel, a local model server,
#     a node/npm/next/wrangler dev or server process)
# WHAT IT ALLOWS: the Bash tool's own run_in_background (the harness tracks it and stops it with the
# session; no `&` in the command), `cmd & ... wait`, `cmd & ... kill`, and any command carrying an
# explicit `# detach-ok: <reason>; stop: <exact stop command>` marker. 
#
# Exit 0 = allow, exit 2 = block.

INPUT=$(cat)
LIB="$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# shellcheck source=/dev/null
source "$LIB" 2>/dev/null || { echo '{"decision":"block","reason":"hook library missing: hooks/_lib.sh"}'; exit 2; }  # loud-failure-exempt: a failed load is named in the block reason on the same line

TOOL=$(tool_name)
[ "$TOOL" = "Bash" ] || exit 0
CMD=$(tool_command)
[ -n "$CMD" ] || exit 0
# A heredoc body is data (a commit message, a file being written, a script fed to an interpreter), not a
# command at this shell's command position: drop it before matching, keeping the line that opens it.
CMD=$(printf '%s\n' "$CMD" | awk '
  skip { t=$0; sub(/^[ \t]+/, "", t); if (t == delim) skip=0; next }
  { print }
  match($0, /<<-?[ \t]*[\047"]?[A-Za-z_][A-Za-z0-9_]*[\047"]?/) {
    d=substr($0, RSTART, RLENGTH); sub(/^<<-?[ \t]*/, "", d); gsub(/[\047"]/, "", d); delim=d; skip=1 }')

# An explicit, reasoned marker with a stop command passes; a bare marker does not.
if printf '%s' "$CMD" | grep -Eq '#[[:space:]]*detach-ok:[[:space:]]*[^;]{8,};[[:space:]]*stop:[[:space:]]*[^[:space:]]+'; then
  exit 0
fi

# Command position: start of a line, after ; & | ( ` or $(, optionally behind sudo/exec/env/time/command.
POS='(^|[;&|(`]|\$\()[[:space:]]*((sudo|exec|env|time|command)([[:space:]]+-[^[:space:]]+)*[[:space:]]+)*'
HIT=""
if printf '%s' "$CMD" | grep -Eq "${POS}(nohup|setsid|disown)([[:space:]]|$)"; then
  HIT="a detach verb (nohup, setsid or disown)"
elif printf '%s' "$CMD" | grep -Eq "${POS}(autossh)([[:space:]]|$)" \
     || printf '%s' "$CMD" | grep -Eq "${POS}ssh([[:space:]]+-[A-Za-eg-zA-Z]+([[:space:]]+[^-[:space:]'\"][^[:space:]'\"]*)?)*[[:space:]]+-[A-Za-z]*f"; then
  HIT="a backgrounded ssh tunnel (ssh -f or autossh), which outlives the command and the session"
elif printf '%s' "$CMD" | grep -Eq "${POS}[^[:space:];&|]*pg_ctl([[:space:]]+[^;&|]*)?[[:space:]](start|restart)([[:space:]]|$)"; then
  HIT="pg_ctl start, which leaves a database running after the command returns"
elif printf '%s' "$CMD" | grep -Eq "${POS}[^[:space:];&|]*/?postgres[[:space:]]+-D"; then
  HIT="a database server started by hand (postgres -D)"
else
  SERVER='uvicorn|gunicorn|http\.server|cloudflared[[:space:]]+tunnel|llama-server|vllm[[:space:]]+serve|node[[:space:]]+[^;&|]*server\.m?js|npm[[:space:]]+(run[[:space:]]+)?(start|dev|serve)|next[[:space:]]+(dev|start)|wrangler[[:space:]]+(pages[[:space:]]+)?dev'
  # A lone & (not &&, not >&, not &>) that backgrounds a server, with no wait or kill later in the command.
  if printf '%s' "$CMD" | grep -Eq "(${SERVER})[^;|]*[^&>]&([^&>]|$)" \
     && ! printf '%s' "$CMD" | grep -Eq "${POS}(wait|kill|pkill)([[:space:]]|$)"; then
    HIT="a long-lived server put in the background with & and never waited for or stopped"
  fi
fi
[ -n "$HIT" ] || exit 0

deny "Detached process: this command starts $HIT. A process an agent starts dies with the agent or lives under a scheduler. Do one of: (1) use the Bash tool's run_in_background instead of nohup or &, which the harness tracks and stops with the session; (2) start the server inside the test or script and stop it in the same command (cmd & ... ; kill \$! or wait); (3) a service that must stay up is a row in your scheduler's manifest (launchd, systemd, supervisor), never a hand-started process; (4) if a detached process is truly needed, append '# detach-ok: <why>; stop: <exact stop command>' and stop it before you finish. Rule: rules/loud-failure.md in the operator-os plugin."
exit 2
