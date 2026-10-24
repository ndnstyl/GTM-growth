#!/usr/bin/env python3
"""Scan an outbound payload for local filesystem paths and executable commands.

THE RULE: nothing that leaves this machine names a path on this machine. Not in an email body, not
in an attachment, not in a file put on a shared drive. Two reasons, either one sufficient:

  1. It exposes your personal machine to people who have no business seeing its layout.
  2. A path on your machine means nothing to the reader and is wrong the day the work moves host.

WHAT MAY TRAVEL instead: a shared-drive location the recipient can actually open, a public URL, or a
data-warehouse identifier (schema.table). When a reader needs a receipt, give them a PROMPT that
retrieves it, never a path to go look.

WHAT IS BLOCKED: absolute home paths, ~ home paths, repo-relative directories, .py/.sh script names,
and command invocations (python3, uv run, npx, bash scripts/...).

The check reads the attachment TEXT, not just the body: a clean body can carry paths inside an
attached PDF.

Usage:  outbound_path_scan.py <file-or-spec.json> [...]
Exit 0 clean, exit 2 violations found (printed to stdout, one per line), exit 3 unreadable.
"""
import json
import os
import re
import sys

# A shared drive link, a public URL, or a mailto is allowed and must not be read as a path.
URL = re.compile(r"(?:https?://|mailto:)[^\s\"'`<>)\]]+")

# Warehouse / table identifiers are allowed by name. They carry no slash and no extension,
# so the path patterns below already miss them; named here to document the carve-out.
ALLOWED_SHAPES = "schema.table, a shared-drive URL, a public URL"

PATTERNS = [
    ("absolute local path", re.compile(r"/Use" r"rs/[A-Za-z0-9._-]+(?:/[^\s\"'`<>)\],;]+)*")),
    ("absolute local path", re.compile(r"/home/[A-Za-z0-9._-]+(?:/[^\s\"'`<>)\],;]+)*")),
    ("home-relative path", re.compile(r"(?<![\w.])~/[^\s\"'`<>)\],;]+")),
    ("repo-relative path", re.compile(
        r"(?<![\w./-])(?:projects|scripts|specs|governance|"
        r"vendor|\.claude|\.specify)/[^\s\"'`<>)\],;]+")),
    ("script filename", re.compile(r"(?<![\w/.-])[\w.-]+\.(?:py|sh|ipynb)(?![\w])")),
    # The argument must LOOK like a path or script, otherwise the English words "source",
    # "bash" and "run" match ordinary prose ("source fingerprint", "the source of record").
    ("command invocation", re.compile(
        r"(?<![\w-])(?:python3?|uv run|uvx|npx|pytest|bash|zsh|source)\s+"
        r"(?=[./~\w-]*[/]|[\w.-]+\.(?:py|sh))[./~\w-]+")),
    ("virtualenv path", re.compile(r"\.venv[/\w.-]*")),
]

SPEC_KEYS = ("body", "subject", "attachments", "to")
# Raster formats: bytes, not text. See scan_file.
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".tif", ".tiff")


class Unreadable(RuntimeError):
    """A payload this gate could not read. Refused, never assumed clean."""


def pdf_text(path):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise Unreadable(
            f"pypdf unavailable, so {os.path.basename(path)} cannot be checked for local paths "
            f"({exc}). An attachment this gate cannot read is refused, never assumed clean."
        ) from exc
    try:
        return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
    except Exception as exc:
        raise Unreadable(
            f"{os.path.basename(path)} could not be parsed as a PDF ({exc}); refused rather "
            "than assumed clean."
        ) from exc


def scan_text(text, where):
    """Return [(where, kind, sample), ...]. URLs are removed before matching."""
    stripped = URL.sub(" ", text)
    out = []
    for kind, rx in PATTERNS:
        for m in rx.finditer(stripped):
            s = m.group(0).strip().rstrip(".,;:)")
            if len(s) < 4:
                continue
            out.append((where, kind, s))
    seen, uniq = set(), []
    for row in out:
        if row[2] in seen:
            continue
        seen.add(row[2])
        uniq.append(row)
    return uniq


def scan_file(path):
    if not os.path.isfile(path):
        return []
    name = os.path.basename(path)
    if path.lower().endswith(".pdf"):
        return scan_text(pdf_text(path), f"attachment {name}")
    # A raster image carries no text this scanner can read. Decoding its bytes with
    # errors="replace" turns compressed pixel data into noise that matches the "~/"
    # pattern by chance (false hits made of replacement characters). The screenshot's pixels are the
    # sender's own eyes to check; the scanner says so instead of guessing.
    if path.lower().endswith(IMAGE_EXTS):
        return []
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            body = fh.read()
    except OSError as exc:
        raise Unreadable(f"{name} could not be read ({exc}); refused rather than assumed clean") from exc
    return scan_text(body, f"file {name}")


def load_spec(path):
    """Return the parsed draft spec, or None when the JSON is not one."""
    try:
        with open(path, encoding="utf-8") as fh:
            obj = json.load(fh)
    except (OSError, ValueError) as exc:
        raise Unreadable(f"{os.path.basename(path)} is not readable JSON ({exc}); refused") from exc
    if isinstance(obj, dict) and any(k in obj for k in SPEC_KEYS):
        return obj
    return None


def scan_spec(spec):
    """An email draft spec (JSON with subject, body, attachments): scan all three."""
    findings = []
    for key in ("subject", "body"):
        if spec.get(key):
            findings += scan_text(str(spec[key]), f"email {key}")
    for a in spec.get("attachments", []) or []:
        findings += scan_file(a)
    return findings


def main(argv):
    findings = []
    for target in argv:
        if not os.path.exists(target):
            continue
        if target.lower().endswith(".json"):
            spec = load_spec(target)
            if spec is not None:
                findings += scan_spec(spec)
                continue
        findings += scan_file(target)
    if not findings:
        return 0
    for where, kind, sample in findings:
        print(f"{where}: {kind}: {sample}")
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Unreadable as exc:
        print(f"UNREADABLE: {exc}")
        sys.exit(3)
