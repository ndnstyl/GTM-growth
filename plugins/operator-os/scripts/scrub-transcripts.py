#!/usr/bin/env python3
"""Scan (and optionally redact) live secrets in Claude Code session transcripts.

~/.claude/projects/<project>/*.jsonl is a verbatim log of every session, including raw tool output.
A secret printed during a session sits there in plaintext. This tool reads the shared
hooks/secret-patterns.txt and reports files that contain a match. With --apply it rewrites each
affected file in place (atomic temp file + rename), replacing each match with [REDACTED].

usage: scrub-transcripts.py [--apply] [--dir DIR]
exit 0 = ran (prints "files affected: N"), exit 2 = could not run.
Redacting the log does NOT rotate the credential. Rotate at the source.
"""
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PATTERNS = os.path.join(HERE, "..", "hooks", "secret-patterns.txt")


def load_patterns():
    pats = []
    try:
        with open(PATTERNS, encoding="utf8") as f:
            for line in f:
                line = line.rstrip("\n")
                if line.strip() and not line.startswith("#"):
                    pats.append(re.compile(line))
    except OSError as e:
        sys.stderr.write(f"scrub-transcripts: cannot read {PATTERNS}: {e}\n")
        sys.exit(2)
    return pats


def default_dir():
    proj = os.path.abspath(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    slug = re.sub(r"[^A-Za-z0-9]", "-", proj)
    return os.path.join(os.path.expanduser("~"), ".claude", "projects", slug)


def main(argv):
    apply = "--apply" in argv
    d = default_dir()
    if "--dir" in argv:
        d = argv[argv.index("--dir") + 1]
    if not os.path.isdir(d):
        print(f"scrub-transcripts: not configured: no transcript folder at {d}")
        return 0
    pats = load_patterns()
    affected = 0
    total = 0
    for root, _dirs, files in os.walk(d):
        for name in files:
            if not name.endswith(".jsonl"):
                continue
            p = os.path.join(root, name)
            try:
                with open(p, encoding="utf8", errors="surrogateescape") as f:
                    text = f.read()
            except OSError as e:
                sys.stderr.write(f"scrub-transcripts: unreadable {p}: {e}\n")
                continue
            new, n = text, 0
            for rx in pats:
                new, c = rx.subn("[REDACTED]", new)
                n += c
            if n:
                affected += 1
                total += n
                if apply:
                    fd, tmp = tempfile.mkstemp(dir=root)
                    with os.fdopen(fd, "w", encoding="utf8", errors="surrogateescape") as out:
                        out.write(new)
                    os.replace(tmp, p)
    print(f"files affected: {affected}")
    print(f"totals: {total} match(es), mode={'apply' if apply else 'report-only'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
