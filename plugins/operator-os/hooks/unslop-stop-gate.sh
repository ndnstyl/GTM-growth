#!/usr/bin/env bash
# unslop-stop-gate.sh, Stop hook (OPTIONAL, not registered by default). Regex-checks the turn's
# FINAL assistant message against the zero-tolerance subset of the unslop banlist before the turn
# may end.
#
# Why: unslop is a harness-wide communication property, not a publishing filter. Chat/CLI replies
# are the one surface no PreToolUse hook can reach; the Stop hook is the only deterministic gate
# that exists for prose. The judgment half lives in rules/unslop-comms.md; this enforces the
# mechanical half. One correction pass max (stop_hook_active guard, no loops).
#
# Cost warning: a block forces the whole final message to be regenerated, so the reader pays output
# tokens twice. Register it only if that trade is worth it to you.
#
# Banlist: $CLAUDE_PROJECT_DIR/.operator/unslop-banlist.json if present, else unslop-banlist.json
# beside this file. A missing or unreadable banlist prints "not configured" and lets the turn end.
set -uo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "operator-os: unslop gate not configured: python3 not found" >&2
  exit 0
fi

UNSLOP_PAYLOAD="$(cat)"
export UNSLOP_PAYLOAD
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export UNSLOP_DEFAULT_BANLIST="$HOOK_DIR/unslop-banlist.json"

python3 - <<'PY'
import json, re, sys, os

try:
    payload = json.loads(os.environ.get("UNSLOP_PAYLOAD", "{}"))
except Exception as e:
    sys.stderr.write("operator-os: unslop gate skipped, payload unreadable (%s)\n" % e.__class__.__name__)
    sys.exit(0)

# One correction pass only: if we already blocked once this turn, let it end.
if payload.get("stop_hook_active"):
    sys.exit(0)

text = payload.get("last_assistant_message")
if not isinstance(text, str) or not text.strip():
    text = None
    tp = payload.get("transcript_path", "")
    if not tp or not os.path.exists(tp):
        sys.exit(0)
    try:
        with open(tp) as f:
            for line in f:
                try:
                    e = json.loads(line)
                except Exception:
                    continue
                if e.get("type") == "assistant":
                    blocks = (e.get("message") or {}).get("content") or []
                    t = "\n".join(b.get("text", "") for b in blocks
                                  if isinstance(b, dict) and b.get("type") == "text")
                    if t.strip():
                        text = t
    except Exception as e:
        sys.stderr.write("operator-os: unslop gate skipped, transcript unreadable (%s)\n" % e.__class__.__name__)
        sys.exit(0)
if not text:
    sys.exit(0)

# Exclude quoted/code material: fenced blocks, inline code, blockquotes.
text = re.sub(r"```.*?```", " ", text, flags=re.S)
text = re.sub(r"`[^`\n]*`", " ", text)
text = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith(">"))

proj = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
bl_path = os.path.join(proj, ".operator", "unslop-banlist.json")
if not os.path.exists(bl_path):
    bl_path = os.environ["UNSLOP_DEFAULT_BANLIST"]
try:
    bl = json.load(open(bl_path))
except Exception as e:
    sys.stderr.write("operator-os: unslop gate not configured: banlist unreadable at %s (%s)\n" % (bl_path, e.__class__.__name__))
    sys.exit(0)
pats = bl.get("patterns", {})
enforce = (bl.get("_enforcement") or {}).get("zero_tolerance_remove") or list(pats)

hits = []
for name in enforce:
    p = pats.get(name)
    rx = p.get("regex") if isinstance(p, dict) else None
    if not rx:
        continue
    try:
        m = re.search(rx, text, flags=re.I)
    except re.error:
        sys.stderr.write("operator-os: unslop banlist pattern %s is not a valid regex, skipped\n" % name)
        continue
    if m:
        hits.append('%s: "%s" -- %s' % (name, m.group(0)[:60], p.get("say_instead", "")))

if hits:
    sys.stderr.write(
        "UNSLOP GATE hit in your final message:\n  "
        + "\n  ".join(hits)
        + "\nRewrite the affected sentences in YOUR OWN prose only (never inside quotes/code you "
          "reproduced), then end the turn. Rule: rules/unslop-comms.md in the operator-os plugin\n")
    sys.exit(2)
sys.exit(0)
PY
