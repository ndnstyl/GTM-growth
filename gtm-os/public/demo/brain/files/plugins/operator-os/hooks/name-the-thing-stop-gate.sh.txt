#!/usr/bin/env bash
set -euo pipefail
# name-the-thing-stop-gate.sh, Stop hook (OPTIONAL: register it only if you want the rule).
# Refuses to end a turn whose FINAL assistant message refers to work by a bare identifier (T-410, G13,
# FR-29, C1, W8, D15, R4, spec 122, US4, SOP-12, phase 6, round 3, lane B ...) instead of saying what the
# thing is. A ticket number is an index into a document the reader does not have open; it reads as a
# complete reference and fails silently when the reader tries to act on it.
#
# Why this is code and not prose: the prose version of the rule gets broken, repeatedly, by the same
# assistant that wrote it.
#
# Design:
#   1. The message is read from the payload's `last_assistant_message` when the harness supplies it,
#      and from the transcript otherwise. Two doors, not one.
#   2. Every run writes one receipt line (what it read, how long, how many hits, exit) to
#      .operator/receipts/name-the-thing-gate.jsonl so a quiet gate is visible. A gate that matches
#      nothing is indistinguishable from a quiet day without it.
#   3. Phase, round, lane, gate, stage, step, item, task, story, decision, finding and scenario followed
#      by a number are identifiers too.
#
# Scope: the assistant's final chat message only. Fenced code blocks, blockquotes and anything that is
# part of a file path or URL are exempt (a path is how the file is found later; the rule governs the
# SUBJECT of a sentence). Inline code is scanned.
#
# One correction pass max (stop_hook_active guard, no loops). Fails OPEN on an unreadable payload, and
# SAYS SO in the receipt: this is a prose gate, and an unreadable transcript is not a reason to trap
# the session.

NTT_PAYLOAD="$(cat)"
export NTT_PAYLOAD
export NTT_RECEIPT="${CLAUDE_PROJECT_DIR:-$PWD}/.operator/receipts/name-the-thing-gate.jsonl"

python3 - <<'PY'
import json, re, sys, os, time

T0 = time.time()
RECEIPT = os.environ.get("NTT_RECEIPT", "")

def receipt(**facts):
    """One line per run, append-only, never a contact value or the message body (lengths and hits only)."""
    facts.setdefault("ts", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    facts["ms"] = int((time.time() - T0) * 1000)
    try:
        os.makedirs(os.path.dirname(RECEIPT), exist_ok=True)
        with open(RECEIPT, "a") as f:
            f.write(json.dumps(facts, sort_keys=True) + "\n")
    except OSError as e:  # loud-failure-exempt: the receipt is the alarm channel itself; a receipt that cannot be written is said on stderr and the verdict still stands
        sys.stderr.write(f"name-the-thing gate: receipt not written ({e.__class__.__name__}: {e})\n")

def leave(code, **facts):
    receipt(exit=code, **facts)
    sys.exit(code)

try:
    payload = json.loads(os.environ.get("NTT_PAYLOAD", "{}"))
except Exception as e:  # loud-failure-exempt: prose gate fails open by design (header); the receipt names it
    leave(0, source="none", reason=f"payload unreadable: {e.__class__.__name__}")

if payload.get("stop_hook_active"):
    leave(0, source="none", reason="stop_hook_active: second pass, let the turn end")

# Door 1: the harness hands the final message directly (newer harness versions).
text = payload.get("last_assistant_message")
source = "payload"
if not isinstance(text, str) or not text.strip():
    text = None
    source = "transcript"
    tp = payload.get("transcript_path", "")
    if not tp or not os.path.exists(tp):
        leave(0, source="none", reason="no transcript_path in payload", payload_keys=sorted(payload.keys()))
    # Door 2: the last assistant entry with a text block.
    try:
        with open(tp) as f:
            for line in f:
                try:
                    e = json.loads(line)
                except Exception:  # loud-failure-exempt: a non-JSON transcript line is skipped; the gate reads the last assistant text only
                    continue
                if e.get("type") == "assistant":
                    blocks = (e.get("message") or {}).get("content") or []
                    t = "\n".join(b.get("text", "") for b in blocks
                                  if isinstance(b, dict) and b.get("type") == "text")
                    if t.strip():
                        text = t
    except Exception as e:  # loud-failure-exempt: prose gate fails open by design (header); the receipt names it
        leave(0, source="transcript", reason=f"transcript unreadable: {e.__class__.__name__}", transcript_path=tp)
    if not text:
        leave(0, source="transcript", reason="no assistant text found", transcript_path=tp,
              transcript_bytes=os.path.getsize(tp), payload_keys=sorted(payload.keys()))

raw_len = len(text)
# Exempt: fenced code, blockquotes, paths and URLs (a token containing / or ://).
text = re.sub(r"```.*?```", " ", text, flags=re.S)
text = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith(">"))
text = re.sub(r"\S*(?:/|://)\S*", " ", text)

# The identifier families this harness uses as ledger keys. Each is a prefix that means
# nothing to a reader who does not have the kit open.
#   T-410 T410 T88         tasks            G13 G5 G-6          gaps / gates
#   FR-29 NFR-3            requirements     US4 AS-2 SC-3       user stories, scenarios
#   D15 D3                 decisions        R4 R0 R19           runbook steps / rounds
#   C1 W8 S3               review findings  OR-3 P02 M1         open rulings, priorities, milestones
#   spec 122 / specs 132   kit numbers      SOP-12 T12          misc kit ids
#   phase 6a, round 3, lane B, gate 4, stage 2, step 7, item 3, task 12, story 4, decision 15, finding 2
PREFIXES = r"(?:T|G|FR|NFR|US|AS|SC|D|R|C|W|S|OR|P|M)"
WORDS = r"(?:phase|round|lane|gate|stage|step|item|task|story|stories|decision|finding|scenario|milestone|condition|defect|gap|ticket)"
PATTERNS = [
    ("kit identifier (letters-number)",
     r"(?<![A-Za-z0-9_$])" + PREFIXES + r"-?(?P<n>\d{1,3})(?![\d.%A-Za-z_])"),
    ("spec number as the subject",
     r"\bspecs?\s+(?P<n>\d{3})\b(?!\.)"),
    ("upper-case hyphen id (SOP-12, ACME-FUNNEL-01, KIT-12)",
     r"\b(?P<n>[A-Z]{2,6}(?:-[A-Z]{2,8})?-\d{2,4})\b"),
    ("kit word plus a number or letter (phase 6a, round 3, lane B, gate 4)",
     # The single-letter branch excludes I and A: "gaps I found" and "the step a person runs" are pronoun and article, not a lane letter.
     r"(?i)\b" + WORDS + r"s?\s+(?P<n>\d{1,3}[a-z]?|[B-HJ-Z])(?![\d.%A-Za-z_])"),
]

# Legitimate look-alikes that must pass.
ALLOW = {
    "T0", "T1", "T2", "T3",              # data tiers
    "S3",                                 # storage (when not a finding)
    "D1", "R2",                           # Cloudflare products this harness deploys to
    "M1", "M2", "M3", "M4",               # Apple silicon
}
YEAR_LIKE = re.compile(r"\b(?:19|20)\d{2}\b")

hits = []
for label, rx in PATTERNS:
    for m in re.finditer(rx, text):
        tok = m.group(0).strip()
        if tok in ALLOW:
            continue
        if YEAR_LIKE.fullmatch(m.group("n") or ""):
            continue
        # Postgres 17, Node 24, version 10, page 3, day 1: a plain word before a number is not an
        # identifier; only the bare prefix families and the kit words above are.
        hits.append((label, tok))

seen, uniq = set(), []
for label, tok in hits:
    if tok in seen:
        continue
    seen.add(tok)
    uniq.append((label, tok))

if uniq:
    lines = [f"{label}: {tok!r}" for label, tok in uniq]
    sys.stderr.write(
        "NAME-THE-THING GATE: your final message refers to work by a bare identifier.\n  "
        + "\n  ".join(lines)
        + "\n\nA ticket number is an index into a document you have open and the reader does not; it reads as a\n"
          "complete reference and fails silently when they try to act on it.\n\n"
          "Fix: say WHAT the thing is and what it does, in the sentence. If a file must be named,\n"
          "give its full absolute path (paths are exempt). Inside a fenced block the identifiers\n"
          "may stay.\n")
    leave(2, source=source, text_len=raw_len, hits=[t for _, t in uniq][:20], hit_count=len(uniq))
leave(0, source=source, text_len=raw_len, hits=[], hit_count=0)
PY
