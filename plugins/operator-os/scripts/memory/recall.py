#!/usr/bin/env python3
"""recall.py, a knowledge lookup that can never answer with silence.

WHY THIS EXISTS
  A session can plan for an hour against a fact that is recorded in the vault, because nothing
  distinguished "the corpus does not hold this" from "nobody looked". Both render as an answer
  that does not mention the corpus at all. A corpus a user cannot trust to say "not here" gets
  ignored over time.

  So this resolves every question to exactly ONE state and names which. There is
  no fourth state, and silence is not available:

    ANSWERED     here it is, the tier it came from, and what to read
    ANCHOR_ONLY  the recorded fact exists and the corpus holds no reasoning
                 around it. Reported as an anchor, never as a whole answer.
    ABSENT       checked R0 (n registers, r rows) and R2 (n notes, best score s
                 against floor f). Not recorded. A POSITIVE finding.
    REFUSED      could not check, naming the tier that failed (raised, exit 2)

WHAT IT DELIBERATELY DOES NOT DO
  It does not stop at the first tier that answers. A register row is an ANCHOR
  (what is true); the corpus is CONTEXT (what it means, what was tried). An
  anchor with no context is never dressed up as a complete answer, because a
  confident shallow answer stops the reader digging, and that is worse than the
  silent miss it replaces.

USAGE
  python3 recall.py "who owns example.com"
  python3 recall.py "what did we rule about Acme" --json
  python3 recall.py "a question about nothing" --no-log

EXIT
  0 ANSWERED or ANCHOR_ONLY, 1 ABSENT (a finding, not an error), 2 REFUSED.
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import require_vault
VAULT = require_vault()
REPO = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
SEARCH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault-search.py")
REGISTER_DIRS = ["30-KNOWLEDGE/assets"]
MISS_LOG = os.path.join(REPO, ".operator", "recall_misses.jsonl")
SCORE_FLOOR = 12.0
SEARCH_TIMEOUT_S = 30

DOMAIN = re.compile(r"\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|me|co|dev|ai)\b", re.I)
PROPER = re.compile(r"\b[A-Z][A-Za-z0-9'&.-]{2,}(?:\s+[A-Z][A-Za-z0-9'&.-]{2,})*\b")
STOPWORDS = {"The", "This", "That", "What", "Who", "Why", "How", "When", "Where", "Is", "Are",
             "Do", "Does", "Did", "Can", "Should", "Would", "Our", "We", "It", "A", "An"}


def extract_keys(question):
    """Pull candidate lookup keys out of a question. Domains first, then proper nouns."""
    keys = [d.lower() for d in DOMAIN.findall(question)]
    for match in PROPER.finditer(question):
        token = match.group(0).strip()
        if token in STOPWORDS or token.split()[0] in STOPWORDS:
            continue
        if token.lower() not in [k.lower() for k in keys]:
            keys.append(token)
    return keys


def load_registers(vault):
    """Read every register file.

    A register we cannot read REFUSES the whole lookup. Answering from a partial
    register set is how a wrong answer acquires a confident tone.
    """
    registers = {}
    for rel_dir in REGISTER_DIRS:
        root = os.path.join(vault, rel_dir)
        if not os.path.isdir(root):
            continue
        for name in sorted(os.listdir(root)):
            if not name.endswith(".md") or name == "_map.md":
                continue
            path = os.path.join(root, name)
            try:
                with open(path, encoding="utf-8") as handle:
                    registers[os.path.join(rel_dir, name)] = handle.read()
            except OSError as exc:
                print(f"REGISTER UNREADABLE: {path}: {exc}", file=sys.stderr)
                raise SystemExit(f"REFUSED: register {path} could not be read ({exc}). "
                                 f"Refusing to answer from a partial register set.")
    return registers


def key_pattern(key):
    """Boundary-aware matcher for one key.

    A bare substring match is a trap: the key `example.com` would match the
    row for `someone@example.com's Account`, because an email address contains the
    domain. An anchor is supposed to be the EXACT fact, so a key must not match
    when it is merely embedded in a longer identifier. Left boundary rejects a
    preceding `@`, word character, dot or hyphen; right boundary rejects a
    trailing word character, dot or hyphen.
    """
    return re.compile(r"(?<![\w@.\-])" + re.escape(key) + r"(?![\w.\-])", re.I)


def scan_registers(registers, keys):
    """R0/R1. Boundary-anchored match of a key against register table rows."""
    patterns = [(key, key_pattern(key)) for key in keys]
    hits = []
    rows_scanned = 0
    for rel, text in registers.items():
        for line in text.splitlines():
            if not line.startswith("|") or line.strip().startswith("|---"):
                continue
            rows_scanned += 1
            for key, pattern in patterns:
                if pattern.search(line):
                    hits.append({"register": rel, "key": key, "row": line.strip()})
                    break
    return hits, rows_scanned


def run_search(question):
    """R2. Corpus search.

    A non-zero exit or a timeout REFUSES. It never degrades to the model's own
    memory, which is the exact failure this tool exists to stop.
    """
    if not os.path.isfile(SEARCH):
        raise SystemExit(f"REFUSED: search tool missing at {SEARCH}; R2 cannot be checked")
    try:
        proc = subprocess.run([sys.executable, SEARCH, question], check=True,
                              capture_output=True, text=True, timeout=SEARCH_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        raise SystemExit(f"REFUSED: corpus search exceeded {SEARCH_TIMEOUT_S}s and was killed; "
                         f"R2 is unchecked and no answer is given on partial evidence")
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"REFUSED: corpus search exited {exc.returncode}; R2 unchecked. "
                         f"stderr: {(exc.stderr or '').strip()[:300]}")
    results = []
    corpus_total = None
    for line in proc.stdout.splitlines():
        match = re.match(r"\s*\d+\.\s*\[\s*([\d.]+)\]\s+(.*)", line)
        if match:
            results.append({"score": float(match.group(1)), "path": match.group(2).strip()})
        total = re.match(r"\s*(\d+)\s+notes matched", line)
        if total:
            corpus_total = int(total.group(1))
    if corpus_total is None:
        raise SystemExit("REFUSED: corpus search returned no denominator line, so the size of what "
                         "was searched is unknown and an ABSENT could not be justified")
    return results, corpus_total


def key_presence(vault, keys):
    """Does the corpus mention each key AT ALL? The grounding check.

    WHY THIS IS THE LOAD-BEARING CHECK, found by testing rather than by design:
    asked "what is the warranty period for Zanzibar Marine Coatings", a company
    that does not exist, BM25 returned 8 documents above the score floor. It had
    matched `warranty`, `coatings` and `marine`. A score floor cannot catch that,
    because BM25 scores TERM OVERLAP and the question's subject is an ENTITY.

    A new user asking about something we do not know would have received eight
    confident-looking sources. That is hallucination by retrieval, and it is
    worse than silence: silence makes them dig, confident wrongness does not.

    So: topical overlap is never evidence that an entity is known. If every
    extracted key appears in zero notes, the answer is ABSENT no matter how high
    the scores are.
    """
    patterns = [(key, key_pattern(key)) for key in keys]
    counts = {key: 0 for key in keys}
    for dirpath, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "90-ARCHIVE"]
        for name in files:
            if not name.endswith(".md"):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8", errors="replace") as handle:
                    text = handle.read()
            except OSError as exc:
                print(f"UNREADABLE during grounding check: {path}: {exc}", file=sys.stderr)
                raise SystemExit(f"REFUSED: {path} could not be read during the grounding check, "
                                 f"so an ABSENT could not be justified against a complete corpus")
            for key, pattern in patterns:
                if pattern.search(text):
                    counts[key] += 1
    return counts


def log_miss(question, keys, evidence, enabled):
    if not enabled:
        return None
    os.makedirs(os.path.dirname(MISS_LOG), exist_ok=True)
    row = {"ts": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
           "question": question, "keys": keys, "evidence": evidence}
    with open(MISS_LOG, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(row) + "\n")
    return MISS_LOG


def load_seat_module():
    """Import the seat object. A missing seat module REFUSES rather than
    silently answering with nobody's scope and nobody's certainty floor."""
    seats_dir = os.path.join(REPO, "scripts", "seats")
    if not os.path.isdir(seats_dir):
        raise SystemExit(f"REFUSED: seat declarations missing at {seats_dir}; a --seat lookup "
                         f"cannot run without a declared subject ")
    if seats_dir not in sys.path:
        sys.path.insert(0, seats_dir)
    import seat as seat_module
    return seat_module


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("question")
    ap.add_argument("--vault", default=VAULT)
    ap.add_argument("--floor", type=float, default=SCORE_FLOOR)
    ap.add_argument("--seat", default=None,
                    help="answer as this declared seat: applies its corpus scope and certainty floor")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--no-log", action="store_true", help="do not append to the miss log")
    args = ap.parse_args(argv)

    seat = None
    seat_module = None
    min_notes = 1
    if args.seat:
        seat_module = load_seat_module()
        seat = seat_module.load_seat(args.seat)
        problems = seat_module.validate(seat)
        if problems:
            raise SystemExit("REFUSED: seat is malformed and will not be used: " + "; ".join(problems))
        args.floor = seat["certainty_floor"]["score_floor"]
        min_notes = seat["certainty_floor"]["grounding_min_notes"]

    keys = extract_keys(args.question)
    registers = load_registers(args.vault)
    anchor_hits, rows_scanned = scan_registers(registers, keys)
    results, corpus_total = run_search(args.question)
    out_of_scope = 0
    if seat is not None:
        in_scope_results = [r for r in results if seat_module.in_scope(seat, r["path"])]
        out_of_scope = len(results) - len(in_scope_results)
        results = in_scope_results
    top = results[0]["score"] if results else 0.0
    context_hits = [r for r in results if r["score"] >= args.floor]
    presence = key_presence(args.vault, keys) if keys else {}
    known_keys = [k for k, n in presence.items() if n > 0]
    unknown_keys = [k for k, n in presence.items() if n == 0]

    evidence = {
        "R0_registers": len(registers), "R0_rows_scanned": rows_scanned,
        "R0_anchor_hits": len(anchor_hits),
        "R2_corpus_notes_matched": corpus_total, "R2_top_score": top,
        "R2_floor": args.floor, "R2_above_floor": len(context_hits),
        "keys_extracted": keys, "key_presence": presence,
        "keys_unknown_to_corpus": unknown_keys,
    }

    # Grounding gates the score. A question whose every named subject is unknown to
    # the corpus is ABSENT however well its topic words scored.
    if keys and not known_keys:
        state = "ABSENT"
    elif anchor_hits and not context_hits:
        state = "ANCHOR_ONLY"          # never dressed up as a complete answer
    elif anchor_hits or context_hits:
        state = "ANSWERED"
    else:
        state = "ABSENT"

    # Seat certainty floor. A seat that may not see hedges gets
    # NOT_ESTABLISHED with a name to ask, never a qualified figure: a hedge in the
    # hands of a seat that cannot detect error becomes a number.
    if seat is not None:
        best_presence = max(presence.values()) if presence else 0
        under_grounded = bool(keys) and best_presence < min_notes
        if under_grounded or state == "ANCHOR_ONLY":
            if not seat.get("may_see_hedges"):
                state = "NOT_ESTABLISHED"
        evidence["seat"] = seat["seat"]
        evidence["seat_floor"] = args.floor
        evidence["seat_min_notes"] = min_notes
        evidence["out_of_scope_hits_dropped"] = out_of_scope
        evidence["best_key_presence"] = best_presence

    miss_path = log_miss(args.question, keys, evidence,
                         enabled=(state == "ABSENT" and not args.no_log))

    if args.json:
        print(json.dumps({"state": state, "question": args.question, "evidence": evidence,
                          "anchors": anchor_hits[:10], "context": context_hits[:10],
                          "miss_logged": miss_path}, indent=1))
    else:
        print(f"STATE: {state}")
        if seat is not None:
            print(f"  seat      : {seat['seat']} ({seat['role']}), tier {seat['tier_clearance']}, "
                  f"floor {args.floor}, min_notes {min_notes}, "
                  f"{out_of_scope} hit(s) dropped as out of scope")
        print(f"  keys extracted: {keys if keys else '(none)'}")
        print(f"  R0 anchor : {len(registers)} register(s), {rows_scanned} rows scanned, "
              f"{len(anchor_hits)} hit(s)")
        print(f"  R2 context: {corpus_total} notes matched, top score {top:.2f} "
              f"against floor {args.floor}, {len(context_hits)} above")
        if keys:
            print("  grounding : " + ", ".join(
                f"{k}={presence[k]} note(s)" for k in keys) )
        if unknown_keys:
            print(f"  ! the corpus does not mention: {unknown_keys}")
        for hit in anchor_hits[:6]:
            print(f"    ANCHOR [{hit['key']}] {hit['row'][:150]}")
        for hit in context_hits[:6]:
            print(f"    CONTEXT [{hit['score']:.1f}] {hit['path']}")
        if state == "ANCHOR_ONLY":
            print("\n  The corpus holds the recorded fact and NO surrounding reasoning. "
                  "Report it as an anchor, not as the whole answer.")
        if state == "NOT_ESTABLISHED":
            print(f"\n  Not established at this seat. Ask {seat['escalation_target']}.")
            print("  This seat does not receive qualified figures, because a hedge quoted onward "
                  "becomes a number.")
        if state == "ABSENT":
            if unknown_keys:
                print(f"\n  Not recorded. The corpus contains no mention of {unknown_keys}. "
                      f"Any documents listed above matched on topic words only and are NOT "
                      f"evidence about that subject.")
            else:
                print("\n  Not recorded. Nothing scored above the floor.")
            print(f"  This is a finding, not an error. Logged: {miss_path}")

    return {"ANSWERED": 0, "ANCHOR_ONLY": 0, "NOT_ESTABLISHED": 1, "ABSENT": 1}[state]


if __name__ == "__main__":
    sys.exit(main())
