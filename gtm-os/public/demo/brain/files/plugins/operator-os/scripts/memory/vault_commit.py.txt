#!/usr/bin/env python3
"""Commit the vault's finished work by explicit path, one commit per top-level folder.

Why this exists: a vault that is written by many sessions accumulates thousands of uncommitted
changes, because nothing commits it except a session remembering to. This is a committer pointed
at the vault.

Rules, all of them in code:
  - never `add -A`; every path is listed and passed with --literal-pathspecs
  - a file written inside the last --min-age-min minutes is in flight and is left alone
  - a non-empty index at start is another lane's staging: refuse (exit 2), never commit it
  - every candidate text file is scanned with the shared hooks/secret-patterns.txt list; one hit
    refuses the whole run (exit 2) naming the class and the path, never the match
  - one commit per top-level folder so history reads by lane
  - --push verifies origin's head equals HEAD after the push; a mismatch is exit 3
  - a run that finds nothing to commit says so and prints its basis (exit 0)
  - every subprocess return code is checked; stderr rides in the error
  - a JSONL receipt line per run at --receipt

Usage:
  vault_commit.py [--vault DIR] [--min-age-min 60] [--dry-run] [--push] [--receipt FILE]
Exit: 0 committed or nothing to do · 2 refused (index, secret) · 3 git or push failure · 4 setup
Stdlib only. Runs under any Python 3.9+.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _vault_path import default_vault  # noqa: E402

DEFAULT_VAULT = Path(default_vault())
INGEST = Path(__file__).resolve().parents[2] / "hooks" / "secret-patterns.txt"
DEFAULT_RECEIPT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()) / ".operator" / "receipts" / "vault_commit.jsonl"
TRAILER = "Co-Authored-By: Claude <noreply@anthropic.com>"
BINARY_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".docx", ".xlsx", ".pptx", ".zip", ".mp4", ".mp3", ".wav"}


class Refused(Exception):
    exit_code = 2


class GitFailed(Exception):
    exit_code = 3


def git(vault: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(["git", "-C", str(vault), *args], capture_output=True)  # loud-failure-exempt: return code judged on the next line; check=False is used only by the cleanup step inside an error already being raised
    if check and proc.returncode != 0:
        raise GitFailed(
            f"git {' '.join(args[:2])} exited {proc.returncode}: "
            f"{proc.stderr.decode('utf-8', 'replace').strip()[:500]}"
        )
    return proc


def load_secret_patterns(ingest_path: Path) -> dict:
    """Read the shared secret pattern list (one regex per line, # comments) into {label: compiled}."""
    if not ingest_path.exists():
        raise Refused(f"secret pattern source missing: {ingest_path}; the scan cannot run, so nothing is committed")
    patterns = {}
    for line in ingest_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            patterns[line[:24]] = re.compile(line)
        except re.error as exc:
            raise Refused(f"secret pattern {line[:40]!r} is not a valid regex ({exc}); nothing is committed")
    if not patterns:
        raise Refused(f"no secret patterns found in {ingest_path}; the scan cannot run, so nothing is committed")
    return patterns


def porcelain(vault: Path) -> list[tuple[str, str]]:
    out = git(vault, "status", "--porcelain", "-z", "--untracked-files=all").stdout.decode("utf-8", "replace")
    rows = []
    for entry in out.split("\0"):
        if not entry:
            continue
        rows.append((entry[:2], entry[3:]))
    return rows


def top_folder(path: str) -> str:
    return path.split("/", 1)[0] if "/" in path else "(root)"


def collect(vault: Path, min_age_min: int, secrets: dict, now: float) -> tuple[dict, list, list]:
    """Returns (groups, skipped_recent, staged_already). Raises Refused on a secret hit."""
    staged = [p for st, p in porcelain(vault) if st[0] not in (" ", "?")]
    if staged:
        raise Refused(f"index already holds {len(staged)} staged path(s), another lane's work; first: {staged[0]}")
    cutoff = now - min_age_min * 60
    groups: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)
    recent = []
    hits = []
    for st, path in porcelain(vault):
        code = st.strip()
        full = vault / path
        if code != "D":
            try:
                if full.stat().st_mtime > cutoff:
                    recent.append(path)
                    continue
            except FileNotFoundError:
                raise GitFailed(f"status listed {path} but it is not on disk and not marked deleted")
            if full.suffix.lower() not in BINARY_SUFFIXES:
                text = full.read_text(encoding="utf-8", errors="replace")
                for cls, rx in secrets.items():
                    if rx.search(text):
                        hits.append((cls, path))
        groups[top_folder(path)].append((code, path))
    if hits:
        listing = "; ".join(f"{cls}: {p}" for cls, p in hits[:10])
        raise Refused(f"{len(hits)} secret-shaped hit(s), nothing committed. {listing}")
    return dict(groups), recent, staged


def commit_group(vault: Path, folder: str, entries: list[tuple[str, str]], dry_run: bool) -> dict:
    counts = collections.Counter(code for code, _ in entries)
    paths = [p for _, p in entries]
    label = f"{folder}: {len(paths)} files (M {counts.get('M', 0)}, A {counts.get('??', 0)}, D {counts.get('D', 0)})"
    if dry_run:
        return {"folder": folder, "files": len(paths), "sha": None, "dry_run": True}
    with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8", dir=str(vault / ".git")) as fh:
        fh.write("\n".join(paths) + "\n")
        listfile = fh.name
    try:
        git(vault, "--literal-pathspecs", "add", f"--pathspec-from-file={listfile}")
    finally:
        os.unlink(listfile)
    # --no-renames: a renamed note is a delete plus an add; with rename detection on, the index lists it once
    # and a correct staging of a rename read as one path missing ("asked to stage 95, index shows 94")
    staged_now = git(vault, "diff", "--cached", "--no-renames", "--name-only", "-z").stdout.decode("utf-8", "replace").split("\0")
    staged_now = [s for s in staged_now if s]
    if len(staged_now) != len(paths):
        git(vault, "reset", "-q", "--", *paths, check=False)
        raise GitFailed(f"{folder}: asked to stage {len(paths)} paths, index shows {len(staged_now)}; unstaged and stopped")
    msg = f"vault nightly, {label}\n\nCommitted by scripts/memory/vault_commit.py by explicit path; files younger than the in-flight window were left alone.\n\n{TRAILER}"
    git(vault, "commit", "-q", "-m", msg)
    sha = git(vault, "rev-parse", "--short", "HEAD").stdout.decode().strip()
    return {"folder": folder, "files": len(paths), "sha": sha, "dry_run": False}


def push(vault: Path) -> str:
    git(vault, "push", "-q", "origin", "main")
    local = git(vault, "rev-parse", "HEAD").stdout.decode().strip()
    remote = git(vault, "ls-remote", "origin", "refs/heads/main").stdout.decode().split()
    if not remote or remote[0] != local:
        raise GitFailed(f"push returned 0 but origin/main is {remote[0][:12] if remote else 'absent'}, HEAD is {local[:12]}")
    return local[:12]


def write_receipt(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=True) + "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    ap.add_argument("--min-age-min", type=int, default=60)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--receipt", type=Path, default=DEFAULT_RECEIPT)
    ap.add_argument("--ingest", type=Path, default=INGEST, help="file holding the secret regex list")
    a = ap.parse_args(argv)
    started = dt.datetime.now().isoformat(timespec="seconds")
    row = {"started": started, "vault": str(a.vault), "outcome": None, "commits": [], "skipped_recent": 0, "error": None}
    try:
        if not (a.vault / ".git").is_dir():
            print(f"REFUSE: {a.vault} is not a git repository", file=sys.stderr)
            return 4
        secrets = load_secret_patterns(a.ingest)
        groups, recent, _ = collect(a.vault, a.min_age_min, secrets, time.time())
        row["skipped_recent"] = len(recent)
        if not groups:
            row["outcome"] = "nothing-to-commit"
            print(f"nothing to commit: 0 finished changes in {a.vault}; {len(recent)} file(s) inside the {a.min_age_min}-minute window left alone")
            write_receipt(a.receipt, row)
            return 0
        for folder in sorted(groups):
            res = commit_group(a.vault, folder, groups[folder], a.dry_run)
            row["commits"].append(res)
            print(f"{'DRY ' if a.dry_run else ''}{res['folder']}: {res['files']} files {res['sha'] or ''}")
        if a.push and not a.dry_run:
            row["pushed"] = push(a.vault)
            print(f"pushed origin/main = {row['pushed']}")
        row["outcome"] = "dry-run" if a.dry_run else "committed"
        write_receipt(a.receipt, row)
        return 0
    except (Refused, GitFailed) as exc:
        row["outcome"] = "refused" if isinstance(exc, Refused) else "failed"
        row["error"] = str(exc)
        write_receipt(a.receipt, row)
        print(f"{row['outcome'].upper()}: {exc}", file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    sys.exit(main())
