#!/usr/bin/env python3
"""vault-refactor-frontmatter.py, clean headers, footnote metadata.

For every vault note with frontmatter:
  TOP (kept, minimal): description, aliases, type (flattened out of metadata:),
    refresh_due, and for board cards the operational fields the board feed reads
    (status, priority, owner, domain, due, blocked_on, created, lane) kept
    nested under metadata: exactly as the parsers expect.
  DROPPED: name: (redundant - the filename is the name now).
  FOOTER: everything else (node_type, originSessionId, modified, migrated,
    notion_id, status_notion, last_edited, channels, captured, verified, ...)
    moves to one small italic line at the bottom after a rule.

Idempotent: a file with no footer-eligible keys and no name: is left untouched.
Usage: python3 scripts/memory/vault-refactor-frontmatter.py [--dry-run] [--vault PATH]
"""
import argparse
import os
import re

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import require_vault
VAULT = require_vault()
SKIP_DIRS = {".git", ".obsidian", ".vault-meta", "node_modules", "templates"}

# operational card fields the board feed parses from metadata:
CARD_KEEP = {"status", "priority", "owner", "domain", "due", "blocked_on", "created", "lane"}
# fields kept at top for every note
TOP_KEEP = {"description", "refresh_due", "as_of", "type"}
FOOTER_LABEL = "*Meta:"


def process(text, is_card):
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end < 0:
        return None
    fm_lines = text[4:end].split("\n")
    body = text[end + 4:]
    if body.startswith("\n"):
        body = body[1:]

    top = []          # kept top-level lines
    meta_keep = []    # kept nested metadata lines (cards)
    footer = []       # k: v pairs for the footnote
    flat_type = None
    i = 0
    in_meta = False
    changed = False

    def key_of(line):
        m = re.match(r"^(\s*)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$", line)
        return m

    while i < len(fm_lines):
        line = fm_lines[i]
        m = key_of(line)
        if not m:
            # continuation line: attach to whichever bucket last took a line
            (meta_keep if in_meta and meta_keep else top).append(line)
            i += 1
            continue
        indent, key, val = m.groups()
        if not indent:
            in_meta = False
        if key == "metadata" and not indent:
            in_meta = True
            i += 1
            continue
        if in_meta and indent:
            if key == "type":
                flat_type = val.strip()
                changed = True
            elif is_card and key in CARD_KEEP:
                meta_keep.append(line)
            elif key in TOP_KEEP:
                top.append(key + ": " + val)
                changed = True
            else:
                footer.append((key, val.strip().strip('"')))
                changed = True
        else:
            if key == "name":
                changed = True  # dropped
            elif key == "aliases":
                stems = re.findall(r'"([^"]+)"', val) or [val.strip("[]")]
                footer.append(("alias", ", ".join(stems)))
                changed = True
            elif key in TOP_KEEP:
                top.append(line)
            else:
                footer.append((key, val.strip().strip('"')))
                changed = True
        i += 1

    if not changed:
        return None

    out = ["---"]
    # description first, then type, then the rest of top
    desc = [l for l in top if l.lstrip().startswith("description:") or (top and not key_of(l))]
    others = [l for l in top if l not in desc]
    out.extend(desc)
    if flat_type:
        out.append("type: " + flat_type)
    out.extend(others)
    if is_card and meta_keep:
        out.append("metadata:")
        out.extend(meta_keep)
    out.append("---")
    new = "\n".join(out) + "\n\n" + body.lstrip("\n").rstrip() + "\n"

    if footer:
        pairs = " · ".join(f"{k} {v}" for k, v in footer if v)
        if pairs:
            new += "\n---\n" + FOOTER_LABEL + " " + pairs + "*\n"
    return new


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--vault", default=VAULT)
    args = ap.parse_args()
    changed = skipped = 0
    for dirpath, dirs, files in os.walk(args.vault):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for f in files:
            if not f.endswith(".md"):
                continue
            p = os.path.join(dirpath, f)
            rel = os.path.relpath(p, args.vault)
            try:
                text = open(p, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            if FOOTER_LABEL in text.split("\n---\n")[-1] and "name:" not in text[:400]:
                skipped += 1
                continue
            is_card = rel.startswith("00-BOARD/cards/")
            new = process(text, is_card)
            if new is None:
                skipped += 1
                continue
            changed += 1
            if not args.dry_run:
                open(p, "w", encoding="utf-8").write(new)
    print(("DRY RUN - would change" if args.dry_run else "changed"), changed, "files;", skipped, "untouched")


if __name__ == "__main__":
    main()
