#!/usr/bin/env python3
"""index_expiry.py, which MEMORY.md ⏰ lines have outlived their note.

A root index line is earned by a live deadline (⏰) or a hard rule. This lists the ⏰
lines whose first wikilinked note carries a `refresh_due:` (top level or under
metadata:) earlier than today, has none, is unreadable, or does not exist, so a human
can demote them to the owning `_map.md`. Read-only: it never edits the index.
Python 3.9-clean.

    python3 scripts/memory/index_expiry.py [--vault DIR] [--as-of YYYY-MM-DD]

Exit 0 with the list on stdout; exit 2 if the index or vault is missing (a check that
cannot run must not read as a clean one).
"""
import argparse
import datetime as dt
import os
import re
import sys

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import require_vault
VAULT = require_vault()
LINK_RX = re.compile(r"\[\[([^\]|#]+)")
DUE_RX = re.compile(r"^\s*refresh_due:\s*[\"']?(\d{4}-\d{2}-\d{2})", re.M)
FM_RX = re.compile(r"\A---\n(.*?)\n---", re.S)


def record(rows, line_no, stem, why):
    """Every ⏰ line needing a decision is written to the report; nothing is skipped."""
    rows.append((line_no, stem, why))


def index_notes(vault):
    """basename stem -> relative path, first wins (duplicates are lint's problem)."""
    out = {}
    for dirpath, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("90-ARCHIVE", "node_modules")]
        for f in files:
            if f.endswith(".md"):
                out.setdefault(f[:-3], os.path.relpath(os.path.join(dirpath, f), vault))
    return out


def refresh_due(vault, rel):
    """The note's refresh_due date, None when it has none. Raises OSError when the
    note cannot be read; the caller records that row by name."""
    with open(os.path.join(vault, rel), encoding="utf-8", errors="replace") as fh:
        head = fh.read(6000)
    m = FM_RX.match(head)
    if not m:
        return None
    d = DUE_RX.search(m.group(1))
    return d.group(1) if d else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default=VAULT)
    ap.add_argument("--as-of", default=dt.date.today().isoformat())
    args = ap.parse_args()
    index = os.path.join(args.vault, "MEMORY.md")
    if not os.path.isfile(index):
        sys.exit("index_expiry: %s missing, cannot run" % index)
    notes = index_notes(args.vault)
    if not notes:
        sys.exit("index_expiry: no notes under %s, cannot run" % args.vault)
    with open(index, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    clock = sum(1 for ln in lines if "⏰" in ln)
    rows = []
    for n, ln in enumerate(lines, 1):
        if "⏰" not in ln:
            continue
        links = LINK_RX.findall(ln)
        if not links:
            record(rows, n, "(no link)", "no note linked")
            continue
        stem = links[0].strip()
        rel = notes.get(stem)
        if not rel:
            record(rows, n, stem, "note not found")
            continue
        try:
            due = refresh_due(args.vault, rel)
        except OSError as e:
            record(rows, n, stem, "note unreadable: %s" % e)
            continue
        if due is None:
            record(rows, n, stem, "no refresh_due on the note")
        elif due < args.as_of:
            record(rows, n, stem, "refresh_due %s passed" % due)
    print("MEMORY.md ⏰ lines: %d; needing a decision as of %s: %d" % (clock, args.as_of, len(rows)))
    for n, stem, why in rows:
        print("  line %3d  %-60s  %s" % (n, stem[:60], why))
    if rows:
        print("Demote each to its owning _map.md (main-loop write) or refresh the note's verified/refresh_due.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
