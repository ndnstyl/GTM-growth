#!/usr/bin/env python3
"""recall_turn.py, vault recall feeder for the main loop's own turns.

Reads a UserPromptSubmit payload on stdin, decides whether the message is a domain
pivot, and if so prints a hookSpecificOutput block with the top vault notes as
TITLES with their verified dates (never snippets). Every degraded path names itself
on the turn; nothing here can block a turn.

Why titles: vault filenames are declarative sentences by design, so five
titles at ~140 chars each carry more signal than five 600-char snippets and cost a
tenth of the tokens. Why a pivot rule: a message is not a query; "yes, do that" has
nothing to retrieve, and injecting on every turn is a bad token trade.

Pipeline: content terms -> pivot check against session state -> BM25 (vault-search.py,
top 20, briefs and raw/ excluded) -> optional local rerank (OPERATOR_RERANK_URL; skipped when unset) with a deadline ->
newer-verified-first tie-break on sibling titles -> <=5 lines -> receipt line.

Loud failure: every failure goes through record(), which puts it in the injected block
AND the receipt row. Exit code is always 0 because a recall feeder must never stop a
turn; the block is the alarm. Python 3.9-clean (system python3 runs hooks).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import default_vault  # noqa: E402

REPO = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
VAULT = default_vault()
SEARCH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault-search.py")
STATE_DIR = os.environ.get("OPERATOR_RECALL_STATE", os.path.join(REPO, ".operator", "recall-state"))
RERANK_URL = os.environ.get("OPERATOR_RERANK_URL", "")
MARKER = "VAULT RECALL (turn)"

TOP_RAW = 20
TOP_KEEP = 5
MIN_TERMS = 3
PIVOT_JACCARD = 0.5          # >= this overlap with the last query = same subject, skip
SIBLING_JACCARD = 0.4        # title overlap at which the newer verified note wins
RERANK_DEADLINE_S = 2.5
SEARCH_DEADLINE_S = 3.0
TURN_DEADLINE_S = 5.0
BLOCK_CAP_CHARS = 800

TOKEN = re.compile(r"[a-z0-9]+")
STOP = set("""
a an the and or but if then else so of to in on at for from by with without as is are was were be
been being do does did done doing have has had having can could should would will shall may might
must i me my we our you your he she it its they them their this that these those there here what
which who whom whose when where why how not no yes ok okay please just also very more most some any
all each every both few many much such own same other another again ever never now then once about
into onto over under up down out off than too only via per re let lets make made making get got
give gives gave go goes went going come comes came take takes took put set run runs ran need needs
want wants know knows think thinks see sees look looks check checks pull pulls open opens send sends
tell tells say says said use uses used using like still already yet back next last first one two
three thing things way ways something anything nothing everything cant dont didnt
""".split())
PATHISH = re.compile(r"(?:/[A-Za-z0-9_.\-]+){2,}|--?[a-zA-Z][\w-]*|\[task_type=[a-z_]*\]")


class RecallError(RuntimeError):
    """A named failure inside one stage; the caller records it on the turn."""


def record(status, message):
    """The one place a degraded path is written down. It lands in the injected block
    (the reader sees it this turn) and in the receipt row (the log sees it later)."""
    status.append(message)
    return message


def tokenize(text):
    text = unicodedata.normalize("NFKD", (text or "").lower())
    return TOKEN.findall(text)


def content_terms(prompt):
    """Terms worth searching on: no stopwords, no paths, no flags, no 1-2 char tokens.
    Digit runs are kept only at >= 4 chars (account ids, zip codes, numbers)."""
    cleaned = PATHISH.sub(" ", prompt or "")
    seen, uniq = set(), []
    for t in tokenize(cleaned):
        if t in STOP or len(t) < 3 or (t.isdigit() and len(t) < 4):
            continue
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq[:40]


def jaccard(a, b):
    a, b = set(a), set(b)
    if not a and not b:
        return 1.0
    return len(a & b) / float(len(a | b))


# ---------------------------------------------------------------- state
def state_path(session_id):
    sid = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id or "nosession")[:80]
    return os.path.join(STATE_DIR, sid + ".json")


def load_state(session_id, status):
    """Absent state = first turn of the session (a ruled, expected absence).
    A present-but-unreadable state file is recorded, never hidden."""
    p = state_path(session_id)
    if not os.path.exists(p):
        return {}
    try:
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        record(status, "recall: session state unreadable (%s), treating as a pivot" % str(e)[:80])
        return {}


def save_state(session_id, state):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = state_path(session_id) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh)
    os.replace(tmp, state_path(session_id))


def receipt(row):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(os.path.join(STATE_DIR, "log.jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=True) + "\n")


# ---------------------------------------------------------------- retrieval
HIT_RX = re.compile(r"^\s*(\d+)\.\s+\[\s*([0-9.]+)\]\s+(.+?)\s*$")


def bm25(query, vault, top=TOP_RAW):
    """Run vault-search.py as the one BM25 implementation. Returns [(score, rel, snippet)].
    Raises RecallError (named) on non-zero exit; TimeoutExpired propagates to the caller."""
    cmd = [sys.executable, SEARCH, query, "--top", str(top), "--snippets", "--vault", vault]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=SEARCH_DEADLINE_S, check=True)
    except subprocess.CalledProcessError as e:
        raise RecallError("vault-search exit %d: %s" % (e.returncode, (e.stderr or e.stdout or "").strip()[:200]))
    hits, cur = [], None
    for line in proc.stdout.splitlines():
        m = HIT_RX.match(line)
        if m:
            cur = [float(m.group(2)), m.group(3), ""]
            hits.append(cur)
        elif cur is not None and line.startswith("      ") and not cur[2]:
            cur[2] = line.strip()
    return [tuple(h) for h in hits if not (h[1].startswith("00-BOARD/briefs/") or h[1].startswith("raw/"))]


FM_RX = re.compile(r"\A---\n(.*?)\n---", re.S)


def note_meta(vault, rel):
    """title, description, verified (top level or under metadata:). Raises RecallError
    when the note cannot be read; the caller records it and keeps the title."""
    title = os.path.basename(rel)[:-3] if rel.endswith(".md") else os.path.basename(rel)
    try:
        with open(os.path.join(vault, rel), encoding="utf-8", errors="replace") as fh:
            head = fh.read(6000)
    except OSError as e:
        raise RecallError("note unreadable %s: %s" % (rel, e))
    desc, verified = "", ""
    m = FM_RX.match(head)
    if m:
        fm = m.group(1)
        d = re.search(r"^\s*description:\s*[\"']?(.*?)[\"']?\s*$", fm, re.M)
        if d:
            desc = d.group(1)[:300]
        v = re.search(r"^\s*verified:\s*[\"']?(\d{4}-\d{2}-\d{2})", fm, re.M)
        if v:
            verified = v.group(1)
    return title, desc, verified


def rerank(query, docs, top_n):
    """POST to the local reranker. Returns indexes in ranked order. Raises RecallError,
    named, on unreachable, slow, or empty; the caller records it on the turn."""
    body = json.dumps({"query": query, "documents": docs, "top_n": top_n}).encode("utf-8")
    req = urllib.request.Request(RERANK_URL, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=RERANK_DEADLINE_S) as r:
            out = json.load(r)
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise RecallError("reranker unreachable: %s" % str(getattr(e, "reason", e))[:80])
    idx = [int(x["index"]) for x in out.get("results", [])]
    if not idx:
        raise RecallError("reranker returned no results")
    return idx


def freshness_order(items):
    """Stable pass: a later item that shares >= SIBLING_JACCARD title tokens with an
    earlier one and is verified later moves above it (the newer note wins the tie)."""
    out = list(items)
    changed = True
    while changed:
        changed = False
        for i in range(len(out) - 1):
            a, b = out[i], out[i + 1]
            if (a["verified"] and b["verified"] and b["verified"] > a["verified"]
                    and jaccard(tokenize(a["title"]), tokenize(b["title"])) >= SIBLING_JACCARD):
                out[i], out[i + 1] = b, a
                changed = True
    return out


# ---------------------------------------------------------------- the turn
def run(payload, vault=VAULT):
    """Returns (block_text_or_None, receipt_row). Every failure is recorded into the
    block and the row; callers rely on that instead of exceptions."""
    t0 = time.time()
    session = payload.get("session_id", "") or ""
    prompt = payload.get("prompt", "") or ""
    row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "session": session[:40], "feeder": "turn"}
    status = []

    if MARKER in prompt:
        row.update(skip="marker_present")
        return None, row

    terms = content_terms(prompt)
    row["terms"] = terms[:20]
    if len(terms) < MIN_TERMS:
        row.update(skip="too_few_terms")
        return None, row

    state = load_state(session, status)
    last = state.get("last_terms", [])
    overlap = jaccard(terms, last)
    row["overlap"] = round(overlap, 2)
    if last and overlap >= PIVOT_JACCARD:
        row.update(skip="same_subject")
        return None, row

    query = " ".join(terms)
    hits = []
    try:
        hits = bm25(query, vault)
    except subprocess.TimeoutExpired:
        record(status, "recall: FAILED, vault search past %.0fs deadline" % SEARCH_DEADLINE_S)
    except RecallError as e:
        record(status, "recall: FAILED, %s" % e)
    row["candidates"] = len(hits)

    if not hits and not status:
        state["last_terms"] = terms
        save_state(session, state)
        row.update(skip="no_hits")
        return None, row

    items = []
    for score, rel, snip in hits:
        try:
            title, desc, verified = note_meta(vault, rel)
        except RecallError as e:
            record(status, "recall: %s" % e)
            title, desc, verified = os.path.basename(rel)[:-3], "", ""
        items.append({"rel": rel, "title": title, "desc": desc, "verified": verified,
                      "bm25": score, "doc": " | ".join(x for x in (title, desc, snip) if x)})

    if items:
        if not RERANK_URL:
            items = items[:TOP_KEEP]
            row["rerank"] = "not configured"
        else:
            try:
                order = rerank(query, [it["doc"] for it in items], TOP_KEEP)
                items = [items[i] for i in order if i < len(items)]
                row["rerank"] = "ok"
            except RecallError as e:
                record(status, "recall: %s, keyword order" % e)
                items = items[:TOP_KEEP]
                row["rerank"] = "down"
        items = freshness_order(items)

    elapsed = time.time() - t0
    if elapsed > TURN_DEADLINE_S:
        record(status, "recall: past %.0fs turn deadline (%.1fs)" % (TURN_DEADLINE_S, elapsed))

    lines = []
    for it in items:
        when = "verified %s" % it["verified"] if it["verified"] else "no verified date"
        # The title IS the filename, so print the folder, not the full path:
        # five full paths overran the 800-char cap and dropped the fifth note.
        lines.append("- %s (%s) [%s]" % (it["title"], when, os.path.dirname(it["rel"]) or "."))

    block = None
    if lines or status:
        head = "## %s: pointers, not evidence. Read a note before citing it; the newer verified date wins a tie." % MARKER
        body = "\n".join([head] + lines + status)
        if len(body) > BLOCK_CAP_CHARS:
            body = body[:BLOCK_CAP_CHARS - 20].rstrip() + "\n- (cut at cap)"
        block = body

    state["last_terms"] = terms
    state["last_injected"] = [it["rel"] for it in items]
    save_state(session, state)
    row.update(injected=[it["rel"] for it in items], status=status, ms=int(elapsed * 1000))
    return block, row


def emit(block, as_json):
    if as_json:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": block}}))
    else:
        print(block)


def main():
    ap = argparse.ArgumentParser(description="turn recall feeder (UserPromptSubmit)")
    ap.add_argument("--vault", default=VAULT)
    ap.add_argument("--dry-run", action="store_true", help="print the block as text, state and log under TMPDIR")
    args = ap.parse_args()
    if args.dry_run:
        global STATE_DIR
        STATE_DIR = os.path.join(os.environ.get("TMPDIR", "/tmp"), "operator-recall-dryrun")

    late = []   # failures found before/after run(); recorded into the block below
    raw = sys.stdin.read()
    payload = {}
    if raw.strip():
        try:
            payload = json.loads(raw)
        except ValueError as e:
            record(late, "recall: payload not JSON (%s), treated as raw prompt" % str(e)[:60])
            payload = {"prompt": raw}
    if not isinstance(payload, dict):
        record(late, "recall: payload not an object, treated as raw prompt")
        payload = {"prompt": str(payload)}

    block, row = run(payload, vault=args.vault)
    try:
        receipt(row)
    except OSError as e:
        record(late, "recall: receipt not written (%s)" % e)
    if late:
        block = "\n".join([block or "## %s" % MARKER] + late)
    if block:
        emit(block, as_json=not args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
