#!/usr/bin/env bash
# Smoke test for the operator-os hooks: feeds each one a synthetic payload in a throwaway project and
# checks the exit code. Run: bash hooks/test/smoke.sh   (exit 0 = all passed)
set -e
set +e  # loud-failure-exempt: a test harness keeps running after a failed check; failures are counted and the script exits non-zero at the end
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CLAUDE_PLUGIN_ROOT="$(cd "$HERE/.." && pwd)"
PROJ="$(mktemp -d)"
export CLAUDE_PROJECT_DIR="$PROJ"
export HOME="$PROJ/home"; mkdir -p "$HOME"
unset OPERATOR_VAULT OPERATOR_VAULT_REMOTE OPERATOR_LOCAL_LLM_URL OPERATOR_LOCAL_LLM_MODEL
cd "$PROJ" || exit 1
git init -q . && git checkout -q -b main 2>/dev/null  # loud-failure-exempt: the branch may already be main, which git reports as an error we do not need
fail=0; n=0
check() {  # check <name> <expected-exit> <hook> <payload>
  local name="$1" want="$2" hook="$3" payload="$4" got out
  n=$((n+1))
  out=$(printf '%s' "$payload" | bash "$HERE/$hook" 2>&1); got=$?
  if [ "$got" != "$want" ]; then echo "FAIL $name: wanted exit $want, got $got: $(printf '%s' "$out" | head -c 200)"; fail=$((fail+1)); else echo "ok   $name (exit $got)"; fi
  LAST_OUT="$out"
}
contains() { n=$((n+1)); if printf '%s' "$LAST_OUT" | grep -q -- "$2"; then echo "ok   $1 (says: $2)"; else echo "FAIL $1: output lacks '$2': $(printf '%s' "$LAST_OUT" | head -c 200)"; fail=$((fail+1)); fi; }

# every hook command registered in hooks.json must be executable, because Claude Code runs it by path
n=$((n+1)); bad=""
for cmd in $(grep -o '\${CLAUDE_PLUGIN_ROOT}/[^"\\ ]*' "$HERE/hooks.json" | sed 's#\${CLAUDE_PLUGIN_ROOT}#'"$CLAUDE_PLUGIN_ROOT"'#' | sort -u); do
  [ -x "$cmd" ] || bad="$bad $cmd"
done
if [ -z "$bad" ]; then echo "ok   every registered hook is executable"; else echo "FAIL registered hook not executable:$bad"; fail=$((fail+1)); fi

check "sensitive write blocks .env"        2 block-sensitive-write.sh '{"tool_name":"Write","tool_input":{"file_path":"/x/app/.env"}}'
check "sensitive write allows source"      0 block-sensitive-write.sh '{"tool_name":"Write","tool_input":{"file_path":"/x/app/main.py"}}'
check "silent failure blocks bare except"  2 block-silent-failure.sh '{"tool_name":"Write","tool_input":{"file_path":"/x/a.py","content":"try:\n    f()\nexcept:\n    pass\n"}}'
check "silent failure allows named error"  0 block-silent-failure.sh '{"tool_name":"Write","tool_input":{"file_path":"/x/a.py","content":"try:\n    f()\nexcept ValueError as e:\n    raise SystemExit(str(e))\n"}}'
check "detached process blocks nohup"      2 block-detached-process.sh '{"tool_name":"Bash","tool_input":{"command":"nohup node server.js"}}'
check "detached process allows ls"         0 block-detached-process.sh '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'
check "blind grep blocks recursive"        2 block-blind-grep.sh '{"tool_name":"Bash","tool_input":{"command":"grep -rn foo ."}}'
check "blind grep allows /usr/bin/grep"    0 block-blind-grep.sh '{"tool_name":"Bash","tool_input":{"command":"/usr/bin/grep -rn foo ."}}'
check "execute-now blocks an offer"        2 execute-now-stop-gate.sh '{"last_assistant_message":"Done with part one. Want me to do part two?"}'
check "execute-now allows a named blocker" 0 execute-now-stop-gate.sh '{"last_assistant_message":"Done.\nNeeds you: approve the deploy."}'
check "unslop gate blocks an em dash"      2 unslop-stop-gate.sh "{\"last_assistant_message\":\"It works \u2014 mostly.\"}"
check "name-the-thing blocks a ticket"     2 name-the-thing-stop-gate.sh '{"last_assistant_message":"T-410 is done and G13 is open."}'
check "local-zone wall blocks a Read"      2 block-local-zone-read.sh '{"tool_name":"Read","tool_input":{"file_path":"/p/.local-only/a.csv"}}'
check "local-zone wall allows a Read"      0 block-local-zone-read.sh '{"tool_name":"Read","tool_input":{"file_path":"/p/src/a.csv"}}'
check "sensitive mcp blocks mail send"     2 block-sensitive-mcp.sh '{"tool_name":"mcp__gmail__send_email","tool_input":{}}'
check "sensitive mcp allows a read"        0 block-sensitive-mcp.sh '{"tool_name":"mcp__gmail__read_email","tool_input":{}}'
mkdir -p specs/007-alpha
check "duplicate spec number blocks"       2 block-duplicate-spec-number.sh '{"tool_name":"Write","tool_input":{"file_path":"specs/007-beta/spec.md"}}'
check "duplicate spec number allows same"  0 block-duplicate-spec-number.sh '{"tool_name":"Write","tool_input":{"file_path":"specs/007-alpha/spec.md"}}'
mkdir -p .claude/rules && echo old > .claude/rules/x.md
check "checkpoint copies existing bytes"   0 checkpoint-before-change.sh '{"tool_name":"Edit","tool_input":{"file_path":"'"$PROJ"'/.claude/rules/x.md"},"session_id":"t"}'
n=$((n+1)); if ls .operator/checkpoints/*/*__x.md >/dev/null 2>&1; then echo "ok   checkpoint file exists"; else echo "FAIL checkpoint file missing"; fail=$((fail+1)); fi  # loud-failure-exempt: ls failure is the test's own FAIL branch
check "recall prompt says not configured"  0 vault-recall-prompt.sh '{"prompt":"what did we decide about pricing and the vendor contract","session_id":"s"}'
contains "recall prompt message" "not configured"
check "recall inject degrades quietly"     0 vault-recall-inject.sh '{"tool_name":"Agent","tool_input":{"prompt":"research the pricing history for the vendor contract in detail"}}'
n=$((n+1)); if grep -q "not configured" .operator/recall-state/feeder.err; then echo "ok   recall inject recorded 'not configured'"; else echo "FAIL recall inject left no record"; fail=$((fail+1)); fi
check "vault push says not configured"     0 vault-push-on-stop.sh '{}'
contains "vault push message" "not configured"
check "startup status line"                0 startup-load.sh '{}'
contains "startup status" "operator-os status"
check "untrusted warning fires on WebFetch" 0 inject-untrusted-warning.sh '{"tool_name":"WebFetch","tool_input":{}}'
contains "untrusted warning text" "UNTRUSTED"
check "audit log writes"                   0 audit-log.sh '{"tool_name":"Bash","tool_input":{"command":"ls"},"session_id":"s"}'
check "outcome capture writes"             0 outcome-capture.sh '{"subagent_type":"operator-os:researcher","last_assistant_message":"done","session_id":"s"}'
n=$((n+1)); if ls "$HOME/.claude/agent-outcomes/researcher.jsonl" >/dev/null 2>&1; then echo "ok   outcome record named researcher"; else echo "FAIL outcome record"; fail=$((fail+1)); fi  # loud-failure-exempt: ls failure is the test's own FAIL branch
check "scrub reports without crashing"     0 scrub-secrets-on-stop.sh '{}'
check "local-ask refuses when unconfigured" 3 ../scripts/local-ask.sh '{}'
echo
echo "$((n-fail))/$n passed"
rm -rf "$PROJ"
[ "$fail" = 0 ]
