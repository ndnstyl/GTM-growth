#!/usr/bin/env python3
"""vault-rename.py, apply a human-naming map to the vault.

Map file: tab-separated lines  <rel path>\t<old stem>\t<new title>
For each row: rename the file to "<new title>.md" in place, set frontmatter
`name:` to the new stem, add `aliases: ["<old stem>"]`, and rewrite EVERY
wikilink to the old stem across the whole vault ([[old]], [[old|label]],
[[path/old]], [[old#sec]]).

Safety: refuses to run on a dirty map (duplicate targets, missing sources,
collisions with existing files). --dry-run prints the plan. Run vault-lint
afterward; a git checkpoint before running is the rollback.

Usage:
  python3 scripts/memory/vault-rename.py MAP.tsv [--dry-run] [--vault PATH]
"""
import argparse
import os
import re
import sys

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import require_vault
VAULT = require_vault()
SKIP_DIRS = {".git", ".obsidian", ".vault-meta", "node_modules"}
BAD = re.compile(r'[\\/:*?"<>|\n\t]')


def load_map(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for i, ln in enumerate(fh, 1):
            ln = ln.rstrip("\n")
            if not ln.strip():
                continue
            parts = ln.split("\t")
            if len(parts) != 3:
                sys.exit(f"map line {i}: expected 3 tab-separated columns, got {len(parts)}")
            rel, old, new = (p.strip() for p in parts)
            if BAD.search(new):
                sys.exit(f"map line {i}: illegal filename character in title: {new!r}")
            rows.append((rel, old, new))
    return rows


def validate(rows):
    errs = []
    seen_new = {}
    for rel, old, new in rows:
        src = os.path.join(VAULT, rel)
        if not os.path.isfile(src):
            errs.append(f"missing source: {rel}")
        if os.path.basename(rel) != old + ".md":
            errs.append(f"stem mismatch: {rel} vs {old}")
        key = new.lower()
        if key in seen_new:
            errs.append(f"duplicate target title: {new!r} ({rel} and {seen_new[key]})")
        seen_new[key] = rel
        dst = os.path.join(VAULT, os.path.dirname(rel), new + ".md")
        if os.path.exists(dst) and os.path.abspath(dst) != os.path.abspath(src):
            errs.append(f"target exists: {new}.md (for {rel})")
        if old == new:
            errs.append(f"no-op row: {rel}")
    return errs


def fix_frontmatter(text, old, new):
    # name: -> new stem; add aliases with the old stem (create frontmatter fields safely)
    def name_repl(m):
        return f"name: {new}"
    text2, n = re.subn(r"^name:\s*.*$", name_repl, text, count=1, flags=re.M)
    if n == 0 and text.startswith("---"):
        text2 = text.replace("---\n", f"---\nname: {new}\n", 1)
    if re.search(r"^aliases:", text2, re.M):
        text2 = re.sub(r"^aliases:\s*\[", f'aliases: ["{old}", ', text2, count=1, flags=re.M)
    else:
        text2 = re.sub(r"^(name:.*)$", rf'\1\naliases: ["{old}"]', text2, count=1, flags=re.M)
    return text2


def main():
    global VAULT
    ap = argparse.ArgumentParser()
    ap.add_argument("map")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--vault", default=VAULT)
    args = ap.parse_args()
    VAULT = args.vault

    rows = load_map(args.map)
    errs = validate(rows)
    if errs:
        print(f"MAP INVALID ({len(errs)} problems):")
        for e in errs[:40]:
            print("  ", e)
        sys.exit(2)

    stem_map = {old: new for _, old, new in rows}
    print(f"map ok: {len(rows)} renames")
    if args.dry_run:
        for rel, old, new in rows[:20]:
            print(f"  {old}  ->  {new}")
        print("  … dry run, nothing changed")
        return

    # 1. rewrite wikilinks vault-wide (old stem -> new title), all forms
    link_re = re.compile(r"\[\[([^\]\n]+)\]\]")
    rewritten_files = 0
    rewritten_links = 0
    for dirpath, dirs, files in os.walk(VAULT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for f in files:
            if not f.endswith(".md"):
                continue
            p = os.path.join(dirpath, f)
            try:
                text = open(p, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            hits = 0

            def repl(m):
                nonlocal hits
                inner = m.group(1)
                # split target vs alias/anchor
                target, sep1, rest = inner.partition("|")
                anchor = ""
                if "#" in target:
                    target, _, anchor = target.partition("#")
                    anchor = "#" + anchor
                base = target.split("/")[-1].strip()
                if base in stem_map:
                    hits += 1
                    prefix = target[: len(target) - len(target.split("/")[-1])]
                    return "[[" + prefix + stem_map[base] + anchor + sep1 + rest + "]]"
                return m.group(0)

            new_text = link_re.sub(repl, text)
            if hits:
                open(p, "w", encoding="utf-8").write(new_text)
                rewritten_files += 1
                rewritten_links += hits

    # 2. rename files + frontmatter
    for rel, old, new in rows:
        src = os.path.join(VAULT, rel)
        dst = os.path.join(VAULT, os.path.dirname(rel), new + ".md")
        text = open(src, encoding="utf-8", errors="replace").read()
        open(src, "w", encoding="utf-8").write(fix_frontmatter(text, old, new))
        os.rename(src, dst)

    print(f"done: {len(rows)} files renamed, {rewritten_links} wikilinks rewritten in {rewritten_files} files")
    print("now run: python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-lint.py")


if __name__ == "__main__":
    main()
