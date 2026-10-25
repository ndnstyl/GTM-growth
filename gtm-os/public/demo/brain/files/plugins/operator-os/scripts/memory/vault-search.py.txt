#!/usr/bin/env python3
"""vault-search.py, local BM25 retrieval over the auto-memory vault.

Stdlib only. Zero egress. No cached index: the vault (~1000 notes, ~5 MB) is
scored live per query, so results can never be stale.

Pattern adapted from AgriciDaniel/claude-obsidian (MIT) wiki-retrieve,
minus the index cache and model rerank we don't need at this scale.
See [[reference_claude_obsidian_vault_system]].

Usage:
  python3 scripts/memory/vault-search.py "quarantine silent mail loss"
  python3 scripts/memory/vault-search.py "meta pixel custody" --top 10
  python3 vault-search.py "pricing" --dir 10-PROJECTS --snippets

Retrieval output is a pointer, not evidence: READ the returned notes before
citing them.
"""

import argparse
import math
import os
import re
import sys
import unicodedata

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import require_vault
VAULT = require_vault()
SKIP_DIRS = {".obsidian", ".git", "node_modules", ".vault-meta", "templates"}
K1, B = 1.5, 0.75
TITLE_WEIGHT = 3  # filename + frontmatter name/description tokens count extra

TOKEN = re.compile(r"[a-z0-9]+")
FENCE = re.compile(r"```.*?```", re.S)


def tokenize(text):
    text = unicodedata.normalize("NFKD", text.lower())
    return TOKEN.findall(text)


def load_notes(root, subdir=None, include_archive=False):
    base = os.path.join(root, subdir) if subdir else root
    skip = SKIP_DIRS if include_archive else (SKIP_DIRS | {"90-ARCHIVE"})
    notes = []
    for dirpath, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in skip and not d.startswith(".")]
        for f in files:
            if not f.endswith(".md"):
                continue
            path = os.path.join(dirpath, f)
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except OSError:
                continue
            notes.append((os.path.relpath(path, root), text))
    return notes


def best_snippet(text, qtokens, width=240):
    """Return the paragraph with the densest query-token hits."""
    body = FENCE.sub("", text)
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    best, best_hits = "", 0
    qset = set(qtokens)
    for p in paras:
        hits = sum(1 for t in tokenize(p) if t in qset)
        if hits > best_hits:
            best, best_hits = p, hits
    best = re.sub(r"\s+", " ", best)
    return (best[:width] + "…") if len(best) > width else best


def main():
    ap = argparse.ArgumentParser(description="BM25 search over the memory vault")
    ap.add_argument("query")
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--dir", help="limit to a vault subdirectory, e.g. 20-AREAS")
    ap.add_argument("--vault", default=VAULT)
    ap.add_argument("--snippets", action="store_true", help="show best-matching paragraph")
    ap.add_argument("--include-archive", action="store_true",
                     help="also search 90-ARCHIVE (excluded by default)")
    args = ap.parse_args()

    qtokens = tokenize(args.query)
    if not qtokens:
        sys.exit("empty query after tokenization")
    if not (1 <= args.top <= 100):
        sys.exit("--top must be between 1 and 100")

    notes = load_notes(args.vault, args.dir, args.include_archive)
    if not notes:
        sys.exit(f"no notes found under {args.vault}" + (f"/{args.dir}" if args.dir else ""))

    docs, df = [], {}
    for rel, text in notes:
        toks = tokenize(text)
        # weight the identity fields: filename stem + first frontmatter lines
        head = os.path.basename(rel)[:-3].replace("_", " ").replace("-", " ")
        m = re.match(r"---\n(.*?)\n---", text, re.S)
        if m:
            head += " " + m.group(1)
        toks += tokenize(head) * TITLE_WEIGHT
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        for t in set(tf):
            df[t] = df.get(t, 0) + 1
        docs.append((rel, text, tf, len(toks)))

    n = len(docs)
    avgdl = sum(d[3] for d in docs) / n
    scored = []
    for rel, text, tf, dl in docs:
        s = 0.0
        for t in qtokens:
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * tf[t] * (K1 + 1) / (tf[t] + K1 * (1 - B + B * dl / avgdl))
        if s > 0:
            scored.append((s, rel, text))
    scored.sort(key=lambda x: -x[0])

    if not scored:
        print("0 results (honest no-hit, try different terms or grep).")
        return
    for i, (s, rel, text) in enumerate(scored[: args.top], 1):
        print(f"{i:2d}. [{s:6.2f}] {rel}")
        if args.snippets:
            snip = best_snippet(text, qtokens)
            if snip:
                print(f"      {snip}")
    print(f"\n{len(scored)} notes matched. Read before you cite, retrieval is a pointer, not evidence.")


if __name__ == "__main__":
    main()
