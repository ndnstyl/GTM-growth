#!/bin/bash
set -eu
# PreToolUse hook (Bash): block destructive commands.
# Exit 0 = allow, exit 2 = block (with a JSON permission decision).
#
# Covers: destructive filesystem operations, git verbs that rewrite or discard a shared working tree,
# secret and SSH-key exfiltration over the network, mass database mutations, and curl-pipe-shell.
#
# Git policy: a working tree shared by several sessions carries other sessions' uncommitted work.
# rebase, pull, stash, restore, checkout (except -b), merge, reset, clean -f, add -A, commit -a and
# force pushes rewrite or discard it and are blocked regardless of intent. Explicit-path add and commit
# are the allowed path. If you work alone in a private clone and want these verbs, set
# OPERATOR_ALLOW_TREE_REWRITE=1 in the environment that launches Claude Code (not in a command).
#
# Exfiltration policy: a command that names a secret file AND uses a network tool is blocked unless it
# targets a domain in OPERATOR_TRUSTED_DOMAINS (a regex such as 'github\.com|googleapis\.com').

INPUT=$(cat)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_lib.sh"
COMMAND=$(tool_command)
[ -n "$COMMAND" ] || exit 0

FS_PATTERNS=(
  'rm[[:space:]]+-(rf|fr|r)?[[:space:]]+/($|[[:space:]])'
  'rm[[:space:]]+-(rf|fr|r)?[[:space:]]+~($|[[:space:]/])'
  'rm[[:space:]]+-(rf|fr|r)?[[:space:]]+\$HOME'
  'rm[[:space:]]+-(rf|fr|r)?[[:space:]]+"\$HOME"'
  'rm[[:space:]]+-(rf|fr|r)?[[:space:]]+/(Users|home|etc|var|opt)($|/)'
  '\bshred\b'
  'find[[:space:]]+[^|]*-delete'
  'find[[:space:]]+[^|]*-exec[[:space:]]+rm'
  'chmod[[:space:]]+-R?[[:space:]]*000'
  'mkfs\.'
  'dd[[:space:]]+if='
  '>[[:space:]]*/dev/sd'
  ':[[:space:]]*>[[:space:]]*\.env'
  'truncate[[:space:]]+[^|]*\.(env|ssh)'
)

# GP matches `git` plus any number of global options, so `git -C . reset` and `git -c k=v rebase` are caught.
GP='git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]+)|--[A-Za-z][A-Za-z0-9-]*(=[^[:space:]]*)?|-[pP]))*[[:space:]]+'
GIT_FORCE=(
  "${GP}push[[:space:]]+.*--force"
  "${GP}push[[:space:]]+-f([[:space:]]|$)"
  "${GP}push[[:space:]]+[^|]*[[:space:]]\+[A-Za-z]"
  "${GP}branch[[:space:]]+(--force|--move|--delete)([[:space:]]|$)"
)
GIT_TREE=(
  "${GP}reset([^A-Za-z0-9_-]|$)"
  "${GP}clean[[:space:]]+-[a-z]*f"
  "${GP}cherry-pick\b"
  "${GP}am([[:space:]]|$)"
  "${GP}apply([[:space:]]|$)"
  "${GP}rebase\b"
  "${GP}pull\b"
  "${GP}stash\b"
  "${GP}restore\b"
  "${GP}merge([[:space:]]|$)"
  "${GP}add[[:space:]]+(-A|--all|-u|--update|\.)([[:space:]]|$)"
)

DB_PATTERNS=(
  'DROP[[:space:]]+DATABASE'
  'DROP[[:space:]]+TABLE'
  'TRUNCATE[[:space:]]+TABLE'
  'DELETE[[:space:]]+FROM[[:space:]]+[a-z_]+[[:space:]]*;'
  'UPDATE[[:space:]]+[a-z_]+[[:space:]]+SET[[:space:]]+[^|]*[[:space:]]*;[[:space:]]*$'
)

PIPE_SHELL=(
  'curl[[:space:]]+[^|]*\|[[:space:]]*(sh|bash|zsh)'
  'wget[[:space:]]+[^|]*\|[[:space:]]*(sh|bash|zsh)'
)

ALL=("${FS_PATTERNS[@]}" "${GIT_FORCE[@]}" "${DB_PATTERNS[@]}" "${PIPE_SHELL[@]}")
if [ "${OPERATOR_ALLOW_TREE_REWRITE:-0}" != "1" ]; then ALL+=("${GIT_TREE[@]}"); fi

# checkout and switch: allowed only as `checkout -b <newbranch>` / `switch -c <newbranch>`, judged clause by clause.
if [ "${OPERATOR_ALLOW_TREE_REWRITE:-0}" != "1" ] && printf '%s' "$COMMAND" | grep -Eqi "${GP}(checkout|switch)\b"; then
  BAD=0
  CLAUSES=$(printf '%s' "$COMMAND" | grep -oiE "${GP}(checkout|switch)[^;&|]*" || echo "")  # loud-failure-exempt: grep rc 1 means no clause, and the guard above already proved one exists
  while IFS= read -r clause; do
    [ -n "$clause" ] || continue
    verb=$(printf '%s' "$clause" | tr 'A-Z' 'a-z' | grep -oE '(checkout|switch)' | head -1)
    want="-b"; [ "$verb" = "switch" ] && want="-c"
    rest=$(printf '%s' "$clause" | sed -E "s/^${GP}[cC][hH][eE][cC][kK][oO][uU][tT][[:space:]]*//; s/^${GP}[sS][wW][iI][tT][cC][hH][[:space:]]*//")
    read -ra toks <<< "$rest"
    if [ "${#toks[@]}" -ne 2 ] || [ "${toks[0]}" != "$want" ] || ! [[ "${toks[1]}" =~ ^[A-Za-z0-9_./-]+$ ]]; then BAD=1; fi
  done <<< "$CLAUSES"
  [ "$BAD" -eq 0 ] || deny "git checkout/switch is blocked except 'checkout -b <newbranch>' or 'switch -c <newbranch>' (a shared working tree carries other sessions' uncommitted work)"
fi

if [ "${OPERATOR_ALLOW_TREE_REWRITE:-0}" != "1" ]; then
  if printf '%s' "$COMMAND" | grep -Eq "${GP}commit[[:space:]]+(-[a-zA-Z]*a[a-zA-Z]*|--all)([[:space:]]|$)"; then
    deny "git commit -a stages every tracked change, including other sessions' work; use explicit-path add and commit"
  fi
  if printf '%s' "$COMMAND" | grep -Eqi "${GP}rm([[:space:]]|$)"; then
    if ! printf '%s' "$COMMAND" | grep -Eqi "${GP}rm[^;&|]*--cached"; then
      deny "git rm without --cached deletes working files; use git rm --cached to untrack"
    fi
  fi
fi

# Secret and SSH exfiltration.
SECRET_FILE_RX='(\.env|\.mcp\.json|\.ssh/|/id_(ed25519|rsa|dsa|ecdsa)|authorized_keys)'
NET_CMD_RX='\b(curl|wget|netcat)\b|\bnc\b[[:space:]]|\bhttps?:'
COPY_CMD_RX='(scp|rsync)[[:space:]]'  # loud-failure-exempt: a detection pattern for a blocked command, not a transfer
if printf '%s' "$COMMAND" | grep -Eq "$NET_CMD_RX|$COPY_CMD_RX" && printf '%s' "$COMMAND" | grep -Eq "$SECRET_FILE_RX"; then
  TRUSTED="${OPERATOR_TRUSTED_DOMAINS:-}"
  if [ -z "$TRUSTED" ] || ! printf '%s' "$COMMAND" | grep -Eq "$TRUSTED"; then
    deny "Possible secret exfiltration: a sensitive file is referenced with a network command to a destination not in OPERATOR_TRUSTED_DOMAINS"
  fi
fi

JOINED=$(printf '%s\n' "${ALL[@]}" | paste -sd'|' -)
if printf '%s' "$COMMAND" | grep -Eqi "$JOINED"; then
  for pattern in "${ALL[@]}"; do
    if printf '%s' "$COMMAND" | grep -Eqi "$pattern"; then
      deny "Destructive or sensitive command blocked (pattern: $pattern)"
    fi
  done
fi
exit 0
