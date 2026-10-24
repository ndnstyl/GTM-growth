"""Reduce a Write or Edit tool call to the file content the scanner should judge.

An Edit sends only its new_string, and a fragment's own first lines never contain the file's
`set -euo pipefail`, so scanning the fragment would report a missing error-exit on every edit to a
shell script that already has one. A gate that cries wolf on every edit gets routed around.

stdin: the hook's JSON payload. argv[1]: the target file path.
stdout: the content to scan, which is the file as it will be after the call.

Write carries the whole file already. Edit is applied against what is on disk and the result printed.
When the file cannot be read or the old_string is not in it, fall back to the fragment.
"""
import json
import pathlib
import sys


def merged_content(payload, target):
    ti = payload.get("tool_input") or payload.get("input") or payload
    if not isinstance(ti, dict):
        return None
    if ti.get("content") is not None:
        return ti["content"]
    new = ti.get("new_string")
    if new is None:
        return None
    old = ti.get("old_string")
    if target and old is not None:
        try:
            on_disk = pathlib.Path(target).read_text()
        except (OSError, UnicodeDecodeError):
            on_disk = None
        if on_disk is not None and old in on_disk:
            return on_disk.replace(old, new, -1 if ti.get("replace_all") else 1)
    return new


def main(argv):
    try:
        payload = json.loads(sys.stdin.read())
    except (ValueError, OSError):
        sys.stderr.write("loudfail_merge: payload unreadable, nothing to scan\n")
        return 0
    out = merged_content(payload, argv[1] if len(argv) > 1 else None)
    if out is None:
        return 0
    sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
