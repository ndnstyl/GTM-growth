#!/usr/bin/env python3
"""vault-lint.py, deterministic health check for the auto-memory vault.

Code checks what code can check; the LLM lint (/lint skill) handles judgment
calls (near-duplicates, semantic staleness, merge candidates) on top of this.

Adapted from the claude-obsidian deterministic-lint pattern
(AgriciDaniel/claude-obsidian, MIT).

Checks:
  1. MEMORY.md byte budget (hard 24,400, truncates on load past that)
  2. Broken wikilinks (recursive, basename-resolved, code spans stripped)
  3. Orphan notes (no inbound link and no MEMORY.md/_map mention)
  4. Frontmatter contract (description + type required; name optional, must == stem when present)
  5. Duplicate basenames (ambiguous Obsidian links)
  6. Overdue refresh_due: dates (volatile-fact freshness convention)
  7. Root files missing from the MEMORY.md index
  8. log.md last-entry age
  9. Empty / stub files (<80 bytes of body)

Read-only. Never modifies the vault. Exit 0 = clean, 1 = warnings, 2 = critical.

Usage:
  python3 scripts/memory/vault-lint.py [--vault PATH] [--as-of YYYY-MM-DD] [--max-list N]
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import sys

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import require_vault
VAULT = require_vault()
MEMORY_LIMIT = 24400
SKIP_DIRS = {".obsidian", ".git", "node_modules", ".vault-meta", "90-ARCHIVE"}
# No frontmatter/orphan/stub requirements for these areas (raw = immutable
# sources; 00-BOARD = operational record with its own conventions, scrubbed by
# its own cleanup, not wiki lint):
LENIENT_PREFIXES = ("raw/", "templates/", "00-BOARD/")
DUPE_EXEMPT_STEMS = {"_map", "README", "index"}
FM_TYPES = {"feedback", "project", "reference", "user", "learning", "source", "sop"}
INDEX_SKIP_STEMS = {"MEMORY", "log", "DECISIONS"}
FENCE = re.compile(r"```.*?```", re.S)
CODE_SPAN = re.compile(r"`+[^`]*`+")
WIKILINK = re.compile(r"\[\[([^\]|#\n]+?)(?:[|#][^\]]*)?\]\]")

def read(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def frontmatter(text):
    m = re.match(r"---\s*\n(.*?)\n---", text, re.S)
    return m.group(1) if m else None


def fm_key(fm, key):
    """Read a frontmatter key, top-level first, else nested under metadata:."""
    if not fm:
        return None
    m = re.search(r"^" + re.escape(key) + r":\s*(.+?)\s*$", fm, re.M)
    if m:
        return m.group(1).strip("\"'")
    meta_m = re.search(r"^metadata:\s*\n((?:[ \t]+.+\n?)+)", fm, re.M)
    if meta_m:
        m2 = re.search(r"^\s+" + re.escape(key) + r":\s*(.+?)\s*$", meta_m.group(1), re.M)
        if m2:
            return m2.group(1).strip("\"'")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default=VAULT)
    ap.add_argument("--as-of", default=None, help="YYYY-MM-DD for reproducible freshness checks")
    ap.add_argument("--max-list", type=int, default=25)
    ap.add_argument("--assert", dest="assert_list", action="append", default=[],
                     metavar="name=value", help="repeatable; exit 0 only if every asserted count matches")
    args = ap.parse_args()
    today = (datetime.date.fromisoformat(args.as_of) if args.as_of else datetime.date.today())
    root = args.vault

    critical, warn, info = [], [], []
    counts = {}

    # -- walk ------------------------------------------------------------
    md = {}          # rel -> text
    all_files, all_base = set(), set()
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for f in files:
            rel = os.path.relpath(os.path.join(dirpath, f), root)
            all_files.add(rel)
            all_base.add(f)
            if f.endswith(".md"):
                try:
                    md[rel] = read(os.path.join(root, rel))
                except OSError as e:
                    warn.append(f"unreadable: {rel} ({e})")
    stems = {}
    for rel in md:
        stems.setdefault(os.path.basename(rel)[:-3], []).append(rel)

    # -- 1. MEMORY.md budget --------------------------------------------
    mem_rel = "MEMORY.md"
    mem_text = md.get(mem_rel, "")
    size = len(mem_text.encode("utf-8"))
    pct = round(size / MEMORY_LIMIT * 100)
    if size > MEMORY_LIMIT:
        critical.append(f"MEMORY.md {size}B, OVER the {MEMORY_LIMIT}B load cap by {size - MEMORY_LIMIT}B (truncates!)")
    elif pct >= 90:
        warn.append(f"MEMORY.md {size}B = {pct}% of the {MEMORY_LIMIT}B cap, start pruning hooks")
    else:
        info.append(f"MEMORY.md budget OK: {size}/{MEMORY_LIMIT}B ({pct}%)")

    # -- 2. broken wikilinks + inbound map ------------------------------
    md_stems = set(stems)
    inbound = {s: 0 for s in md_stems}
    broken = []
    # MEMORY.md is checked here: it is the one file every session
    # loads whole, so a pointer that resolves to nothing there is the most expensive broken
    # link in the vault, and it was the only one the checker could not report. Measured
    # before the change: 338 wikilinks in the index, exactly 1 unresolvable, so un-skipping
    # costs one line of output and catches the class. Trap: a gate whose scope excludes the
    # only file that matters.
    skip_link_files = {"00-HOME/_WIKI-SCHEMA.md", "00-HOME/_how-this-works.md",
                       "_WIKI-SCHEMA.md", "_how-this-works.md"}
    for rel, text in md.items():
        scan_broken = not (rel in skip_link_files or rel.startswith(("templates/", "raw/")))
        body = CODE_SPAN.sub("", FENCE.sub("", text))
        for m in WIKILINK.finditer(body):
            target = m.group(1).strip().rstrip("\\")
            base = target.split("/")[-1]
            if base in md_stems:
                if base not in stems or rel not in stems.get(base, []):
                    inbound[base] += 1
                continue
            if target in md_stems:
                inbound[target] += 1
                continue
            if target in all_files or (target + ".md") in all_files or base in all_base:
                continue
            if scan_broken:
                broken.append(f"{rel} -> [[{target}]]")
    # links FROM MEMORY.md / maps still count as inbound for orphan purposes
    counts["broken_wikilinks"] = len(broken)
    if broken:
        warn.append(f"broken wikilinks: {len(broken)}")
        warn.extend("  " + b for b in broken[: args.max_list])
        if len(broken) > args.max_list:
            warn.append(f"  … and {len(broken) - args.max_list} more")
    else:
        info.append("broken wikilinks: 0")

    # -- 3. orphans ------------------------------------------------------
    orphans = []
    for stem, rels in stems.items():
        rel = rels[0]
        if rel.startswith(LENIENT_PREFIXES) or stem.startswith("_") or stem in INDEX_SKIP_STEMS:
            continue
        if stem.endswith("_map") or stem.startswith(("n8n_", "system_")):
            continue
        if inbound.get(stem, 0) == 0 and stem not in mem_text:
            orphans.append(rel)
    counts["orphans"] = len(orphans)
    if orphans:
        warn.append(f"orphans (no inbound link, not in MEMORY.md): {len(orphans)}")
        warn.extend("  " + o for o in sorted(orphans)[: args.max_list])
        if len(orphans) > args.max_list:
            warn.append(f"  … and {len(orphans) - args.max_list} more")
    else:
        info.append("orphans: 0")

    # -- 4. frontmatter contract ----------------------------------------
    # Schema (00-HOME/_WIKI-SCHEMA.md): description + type required.
    # name is OPTIONAL; if present, must equal the filename stem. type must be
    # one of FM_TYPES. Board cards additionally nest operational fields under
    # metadata: (status/priority/owner/...), that block is orthogonal to this
    # check and never required outside 00-BOARD/cards/. A bottom footer line
    # `*Meta: ...*` carries everything else and is not part of frontmatter.
    fm_missing, fm_incomplete, fm_mismatch, fm_bad_type = [], [], [], []
    for rel, text in md.items():
        if rel.startswith(LENIENT_PREFIXES) or os.path.basename(rel).startswith("_"):
            continue
        stem = os.path.basename(rel)[:-3]
        if stem in INDEX_SKIP_STEMS or stem.endswith("_map"):
            continue
        fm = frontmatter(text)
        if fm is None:
            fm_missing.append(rel)
            continue
        nm = re.search(r"^name:\s*(.+?)\s*$", fm, re.M)
        has_desc = re.search(r"^description:", fm, re.M)
        type_m = re.search(r"^\s*type:\s*(\S+)", fm, re.M)
        if not (has_desc and type_m):
            fm_incomplete.append(rel)
            continue
        type_val = type_m.group(1).strip("\"'")
        if type_val not in FM_TYPES:
            fm_bad_type.append(f"{rel} (type: {type_val})")
        if nm and nm.group(1).strip("\"'") != stem:
            fm_mismatch.append(f"{rel} (name: {nm.group(1)})")
    for label, bucket in (("missing frontmatter", fm_missing),
                          ("incomplete frontmatter (description/type required)", fm_incomplete),
                          ("frontmatter type not in schema enum", fm_bad_type),
                          ("frontmatter name present but ≠ filename stem", fm_mismatch)):
        if bucket:
            warn.append(f"{label}: {len(bucket)}")
            warn.extend("  " + b for b in sorted(bucket)[: args.max_list])
            if len(bucket) > args.max_list:
                warn.append(f"  … and {len(bucket) - args.max_list} more")
        else:
            info.append(f"{label}: 0")

    # -- 5. duplicate basenames -----------------------------------------
    dupes = {s: r for s, r in stems.items() if len(r) > 1 and s not in DUPE_EXEMPT_STEMS}
    counts["duplicate_basenames"] = len(dupes)
    if dupes:
        warn.append(f"duplicate basenames (ambiguous [[links]]): {len(dupes)}")
        for s, r in sorted(dupes.items())[: args.max_list]:
            warn.append(f"  {s}: " + ", ".join(sorted(r)))
    else:
        info.append("duplicate basenames: 0")

    # -- 6. refresh_due overdue -----------------------------------------
    overdue, upcoming = [], []
    for rel, text in md.items():
        fm = frontmatter(text)
        if not fm:
            continue
        m = re.search(r"^\s*refresh_due:\s*[\"']?(\d{4}-\d{2}-\d{2})", fm, re.M)
        if not m:
            continue
        try:
            due = datetime.date.fromisoformat(m.group(1))
        except ValueError:
            warn.append(f"unparseable refresh_due in {rel}: {m.group(1)}")
            continue
        if due <= today:
            overdue.append(f"{rel} (due {due})")
        elif (due - today).days <= 7:
            upcoming.append(f"{rel} (due {due})")
    counts["refresh_due_overdue"] = len(overdue)
    if overdue:
        critical.append(f"refresh_due OVERDUE, re-verify these facts: {len(overdue)}")
        critical.extend("  " + o for o in sorted(overdue))
    if upcoming:
        info.append("refresh_due within 7 days: " + "; ".join(sorted(upcoming)))
    if not overdue and not upcoming:
        info.append("refresh_due: none overdue")

    # -- 7. root files missing from MEMORY.md ----------------------------
    missing_idx = []
    for rel in md:
        if "/" in rel:
            continue
        stem = rel[:-3]
        if stem in INDEX_SKIP_STEMS or stem.startswith("_") or stem.startswith(("n8n_", "system_")):
            continue
        if stem not in mem_text:
            missing_idx.append(rel)
    counts["root_notes_missing_index"] = len(missing_idx)
    if missing_idx:
        warn.append(f"root notes absent from MEMORY.md index: {len(missing_idx)}")
        warn.extend("  " + x for x in sorted(missing_idx)[: args.max_list])
    else:
        info.append("root notes all indexed: OK")

    # -- 8. log.md age ---------------------------------------------------
    try:
        mtime = os.path.getmtime(os.path.join(root, "log.md"))
        age = (datetime.datetime.now() - datetime.datetime.fromtimestamp(mtime)).days
        (warn if age > 14 else info).append(f"log.md last modified {age}d ago" + (", stale?" if age > 14 else ": OK"))
    except OSError:
        warn.append("log.md missing")

    # -- 9. stubs ---------------------------------------------------------
    stubs = []
    for rel, text in md.items():
        if rel.startswith(LENIENT_PREFIXES):
            continue
        body = re.sub(r"^---.*?---", "", text, flags=re.S).strip()
        if len(body) < 80:
            stubs.append(f"{rel} ({len(body)}B body)")
    counts["stub_notes"] = len(stubs)
    if stubs:
        warn.append(f"stub/near-empty notes: {len(stubs)}")
        warn.extend("  " + s for s in sorted(stubs)[: args.max_list])
    else:
        info.append("stub notes: 0")

    # -- 11. links into 90-ARCHIVE -----------------------------------------
    archive_root = os.path.join(root, "90-ARCHIVE")
    archive_basenames = set()
    if os.path.isdir(archive_root):
        for dirpath, dirs, files in os.walk(archive_root):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for f in files:
                archive_basenames.add(f)
    archive_links, ambiguous_archive_links = [], []
    if archive_basenames:
        for rel, text in md.items():
            body = CODE_SPAN.sub("", FENCE.sub("", text))
            for m in WIKILINK.finditer(body):
                target = m.group(1).strip().rstrip("\\")
                base = target.split("/")[-1]
                candidates = {base} if base.endswith(".md") else {base, base + ".md"}
                if not (candidates & archive_basenames):
                    continue
                # resolve the basename to its live file set too; a basename that
                # exists both live and under 90-ARCHIVE is ambiguous, not an
                # archive link (review item 10)
                lives_elsewhere = bool(candidates & all_base)
                if lives_elsewhere:
                    ambiguous_archive_links.append(f"{rel} -> [[{target}]]")
                else:
                    archive_links.append(f"{rel} -> [[{target}]]")
    counts["links_into_90_archive"] = len(archive_links)
    counts["ambiguous_archive_link"] = len(ambiguous_archive_links)
    if archive_links:
        warn.append(f"links into 90-ARCHIVE: {len(archive_links)}")
        warn.extend("  " + x for x in archive_links[: args.max_list])
        if len(archive_links) > args.max_list:
            warn.append(f"  … and {len(archive_links) - args.max_list} more")
    else:
        info.append("links into 90-ARCHIVE: 0")
    if ambiguous_archive_links:
        warn.append(f"ambiguous archive link: {len(ambiguous_archive_links)}")
        warn.extend("  " + x for x in ambiguous_archive_links[: args.max_list])
        if len(ambiguous_archive_links) > args.max_list:
            warn.append(f"  … and {len(ambiguous_archive_links) - args.max_list} more")
    else:
        info.append("ambiguous archive link: 0")

    # -- report -----------------------------------------------------------
    print(f"# vault-lint, {today}, {len(md)} notes, vault: {root}")
    for title, bucket in (("CRITICAL", critical), ("WARNING", warn), ("INFO", info)):
        print(f"\n## {title} ({sum(1 for x in bucket if not x.startswith('  '))})")
        for line in bucket:
            print(line)
    print("\nRead-only run; nothing was modified. Fixes go through the operator (lint punch-list flow).")

    if args.assert_list:
        all_ok = True
        print("\n## ASSERT")
        for item in args.assert_list:
            name, _, val = item.partition("=")
            try:
                expected = int(val)
            except ValueError:
                expected = val
            actual = counts.get(name)
            ok = actual == expected
            all_ok = all_ok and ok
            print(f"{name}: expected={expected} actual={actual} {'PASS' if ok else 'FAIL'}")
        sys.exit(0 if all_ok else 1)

    sys.exit(2 if critical else (1 if any(not w.startswith("  ") for w in warn) else 0))


if __name__ == "__main__":
    main()
