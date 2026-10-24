#!/usr/bin/env bash
set -euo pipefail
# execute-now-stop-gate.sh, Stop hook. Refuses to end a turn whose FINAL assistant message
# offers work instead of doing it ("Want me to draft it?", "Should I run it?", "Let me know if
# you'd like ...") unless the message names a blocker that sits on the operator.
#
# Hard rule: "if it can be done now do it NOW. The only time to not execute is if there is a
# blocker on the operator." Written as code because the prose version gets broken repeatedly.
# Rule file: rules/execute-now.md in this plugin.
#
# The escape is explicit, not inferred: a line that starts with "Needs you:" names what only the operator
# can do (an approval, a send, a UI-only change, a ruling that is theirs). An offer with no
# such line is refused. Fenced code and blockquotes are exempt. One correction pass max
# (stop_hook_active guard). Fails open on an unreadable payload and says so in the receipt.

EN_PAYLOAD="$(cat)"
export EN_PAYLOAD
export EN_RECEIPT="${CLAUDE_PROJECT_DIR:-$PWD}/.operator/receipts/execute-now-gate.jsonl"

python3 - <<'PY'
import json, re, sys, os, time

T0 = time.time()
RECEIPT = os.environ.get("EN_RECEIPT", "")

def receipt(**facts):
    facts.setdefault("ts", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    facts["ms"] = int((time.time() - T0) * 1000)
    try:
        os.makedirs(os.path.dirname(RECEIPT), exist_ok=True)
        with open(RECEIPT, "a") as f:
            f.write(json.dumps(facts, sort_keys=True) + "\n")
    except OSError as e:  # loud-failure-exempt: the receipt is the alarm channel itself; said on stderr, verdict stands
        sys.stderr.write(f"execute-now gate: receipt not written ({e.__class__.__name__}: {e})\n")

def leave(code, **facts):
    receipt(exit=code, **facts)
    sys.exit(code)

try:
    payload = json.loads(os.environ.get("EN_PAYLOAD", "{}"))
except Exception as e:  # loud-failure-exempt: prose gate fails open by design (header); the receipt names it
    leave(0, source="none", reason=f"payload unreadable: {e.__class__.__name__}")

if payload.get("stop_hook_active"):
    leave(0, source="none", reason="stop_hook_active: second pass, let the turn end")

text = payload.get("last_assistant_message")
source = "payload"
if not isinstance(text, str) or not text.strip():
    text, source = None, "transcript"
    tp = payload.get("transcript_path", "")
    if not tp or not os.path.exists(tp):
        leave(0, source="none", reason="no transcript_path in payload")
    try:
        with open(tp) as f:
            for line in f:
                try:
                    e = json.loads(line)
                except Exception:  # loud-failure-exempt: a non-JSON transcript line is skipped; the gate reads the last assistant text only
                    continue
                if e.get("type") == "assistant":
                    blocks = (e.get("message") or {}).get("content") or []
                    t = "\n".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
                    if t.strip():
                        text = t
    except Exception as e:  # loud-failure-exempt: prose gate fails open by design (header); the receipt names it
        leave(0, source="transcript", reason=f"transcript unreadable: {e.__class__.__name__}")
    if not text:
        leave(0, source="transcript", reason="no assistant text found")

raw_len = len(text)
body = re.sub(r"```.*?```", " ", text, flags=re.S)
body = "\n".join(l for l in body.splitlines() if not l.lstrip().startswith(">"))

if re.search(r"(?im)^\s*[*_]*needs you[*_]*:", body):
    leave(0, source=source, text_len=raw_len, hits=[], reason="blocker on the operator named")

OFFERS = [
    r"\b(?:do you )?want me to\b",
    r"\bshould I\b[^.?!\n]*\?",
    r"\bshall I\b",
    r"\bwould you like (?:me|to)\b",
    r"\blet me know if you(?:'d| would)? (?:want|like)\b",
    r"\bif you(?:'d| would)? like,? I\b",
    r"\bif you want,? I\b",
    r"\bI can (?:also )?(?:draft|write|build|run|send|stage|pull|fix|do|make|set|add|open|check)\b[^.!\n]*\?",
    r"\bsay the word\b",
    r"\bhappy to\b",
]
hits = []
for rx in OFFERS:
    for m in re.finditer(rx, body, flags=re.I):
        hits.append(m.group(0).strip()[:80])

if hits:
    sys.stderr.write(
        "EXECUTE-NOW GATE: your final message offers work instead of doing it.\n  "
        + "\n  ".join(repr(h) for h in dict.fromkeys(hits))
        + "\n\nHard rule: \"if it can be done now do it NOW. The only time to not execute\n"
          "is if there is a blocker on the operator.\" Do the work, then report what was done.\n"
          "If something genuinely needs the operator (an approval, a send, a UI-only change, a ruling that is\n"
          "theirs), name it on its own line starting with \"Needs you:\" and say exactly what they do.\n"
          "Rule: rules/execute-now.md in the operator-os plugin\n")
    leave(2, source=source, text_len=raw_len, hits=list(dict.fromkeys(hits))[:10], hit_count=len(hits))
leave(0, source=source, text_len=raw_len, hits=[], hit_count=0)
PY
