#!/usr/bin/env python3
"""vault-reachability.py, measure how much of the vault a session can actually reach.

WHY THIS EXISTS
  Capture is not retrieval. A session can spend an hour planning around a fact that is recorded in
  hundreds of vault files without ever seeing it. Nothing was lost
  and nothing was corrupt. The fact simply was not within reach of a session
  that did not already know to search for it.

  A session boots holding MEMORY.md and nothing else. Everything past that costs
  a deliberate read. So two numbers matter and neither was ever computed:

    hop 1   what a session holds at boot, before it decides to open anything
    all     what it could reach by following links, at any depth

  Coverage is MEASURED, never asserted -- the same rule the warehouse lane
  already follows ([[Coverage Is Measured by a Day Scan, Never Asserted From a
  Start Date]]). A falling number is the alarm. Vault: [[The Index Has No
  Entities]].

  Deliberately NOT part of vault-lint.py: that file carries pre-existing
  silent-failure findings that block edits to it, and this check earns its own
  schedule anyway.

USAGE
  python3 scripts/memory/vault-reachability.py
  python3 vault-reachability.py --json .operator/vault_reach/report.json
  python3 scripts/memory/vault-reachability.py --min-total 85 --min-hop1 6

EXIT
  0 clean, 1 a floor was breached or a note was unreadable, 2 the vault itself
  could not be read. Read-only. Never modifies the vault.
"""

import argparse
import datetime
import json
import os
import re
import sys

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import require_vault
VAULT = require_vault()
ROOT_INDEX = "MEMORY.md"
SKIP_DIRS = {".obsidian", ".git", "node_modules", ".vault-meta", "90-ARCHIVE"}
MAX_DEPTH = 12

FENCE = re.compile(r"```.*?```", re.S)
CODE_SPAN = re.compile(r"`+[^`]*`+")
WIKILINK = re.compile(r"\[\[([^\]|#\n]+?)(?:[|#][^\]]*)?\]\]")


def load_vault(root):
    """Read every .md under root.

    An unreadable note is reported to stderr the moment it happens and carried
    into the exit code. It is never skipped quietly: a note dropped from the
    numerator while it still counts in the denominator would understate
    coverage, and one dropped from both would overstate it.
    """
    if not os.path.isdir(root):
        raise SystemExit(f"REFUSED: vault path is not a directory: {root}")
    docs = {}
    unreadable = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for name in files:
            if not name.endswith(".md"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), root)
            try:
                with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
                    docs[rel] = fh.read()
            except OSError as exc:
                print(f"UNREADABLE NOTE (counted in the denominator, absent from the "
                      f"numerator): {rel}: {exc}", file=sys.stderr)
                unreadable.append(f"{rel}: {exc}")
    if not docs:
        raise SystemExit(f"REFUSED: no .md files found under {root}. Refusing to report 0% "
                         f"coverage from an empty read, which would look like the vault failed")
    return docs, unreadable


def outbound(text, stems):
    body = CODE_SPAN.sub("", FENCE.sub("", text))
    out = set()
    for match in WIKILINK.finditer(body):
        base = match.group(1).strip().rstrip("\\").split("/")[-1]
        out.update(stems.get(base, ()))
    return out


def walk(docs):
    """BFS from the index. Returns (hop1, reachable, depth_used, still_expanding)."""
    stems = {}
    for rel in docs:
        stems.setdefault(os.path.basename(rel)[:-3], []).append(rel)
    if ROOT_INDEX not in docs:
        raise SystemExit(f"REFUSED: {ROOT_INDEX} is not in the vault. It is the only entry point a "
                         f"session gets at boot, so there is nothing to measure reachability from")
    seen = {ROOT_INDEX}
    frontier = {ROOT_INDEX}
    hop1 = set()
    depth = 0
    while frontier and depth < MAX_DEPTH:
        depth += 1
        nxt = set()
        for rel in frontier:
            for tgt in outbound(docs[rel], stems):
                if tgt not in seen:
                    seen.add(tgt)
                    nxt.add(tgt)
        if depth == 1:
            hop1 = set(nxt)
        frontier = nxt
    seen.discard(ROOT_INDEX)
    return hop1, seen, depth, bool(frontier)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default=VAULT)
    ap.add_argument("--json", default=None, help="write the measurement to this path for trending")
    ap.add_argument("--min-total", type=float, default=85.0, help="floor for all-hops coverage")
    ap.add_argument("--min-hop1", type=float, default=6.0, help="floor for boot-time coverage")
    args = ap.parse_args(argv)

    docs, unreadable = load_vault(args.vault)
    hop1, seen, depth, still_expanding = walk(docs)

    total = len(docs)
    pct1 = 100.0 * len(hop1) / total
    pctall = 100.0 * len(seen) / total
    unreachable = sorted(set(docs) - seen - {ROOT_INDEX})

    by_folder = {}
    for rel in unreachable:
        folder = os.path.dirname(rel) or "."
        by_folder[folder] = by_folder.get(folder, 0) + 1

    today = datetime.date.today().isoformat()
    print(f"# vault-reachability, {today}, {total} notes, {args.vault}")
    print(f"  hop 1, what a session holds at boot:   {len(hop1):>5} / {total} = {pct1:5.1f}%")
    print(f"  all hops, reachable by following links:{len(seen):>5} / {total} = {pctall:5.1f}%")
    print(f"  unreachable by any link path:          {len(unreachable):>5}")
    print(f"  walk depth used: {depth}")
    if by_folder:
        print("\n  unreachable by folder:")
        for folder, count in sorted(by_folder.items(), key=lambda kv: -kv[1])[:12]:
            print(f"    {count:>5}  {folder}")

    problems = []
    if still_expanding:
        problems.append(f"walk hit the depth cap at {MAX_DEPTH} and was still expanding, so the "
                        f"coverage above is a FLOOR and not the total")
    if unreadable:
        problems.append(f"{len(unreadable)} notes could not be read; first: {unreadable[0]}")
    if pctall < args.min_total:
        problems.append(f"all-hops coverage {pctall:.1f}% is below the {args.min_total}% floor, so "
                        f"{len(unreachable)} notes are captured and cannot be found by following links")
    if pct1 < args.min_hop1:
        problems.append(f"hop-1 coverage {pct1:.1f}% is below the {args.min_hop1}% floor. A session "
                        f"boots holding only {ROOT_INDEX}, so hop 1 is the whole doorway")

    if args.json:
        payload = {
            "as_of": today, "vault": args.vault, "notes_total": total,
            "hop1": len(hop1), "hop1_pct": round(pct1, 2),
            "reachable": len(seen), "reachable_pct": round(pctall, 2),
            "unreachable": len(unreachable), "unreachable_by_folder": by_folder,
            "depth_used": depth, "hit_depth_cap": still_expanding,
            "unreadable": unreadable, "problems": problems,
        }
        parent = os.path.dirname(os.path.abspath(args.json))
        os.makedirs(parent, exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=1)
        print(f"\n  measurement written: {args.json}")

    if problems:
        print("\nPROBLEMS")
        for problem in problems:
            print(f"  ! {problem}")
        return 1
    print("\nRead-only run; nothing was modified. Coverage is within both floors.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
