"""Built-in silent-failure scanner for the block-silent-failure hook.

usage: loudfail_scan.py <py|sh> <relative-path>   (content on stdin)
exit 0 = clean, 1 = findings (JSON list on stdout), 2 = could not run.

Patterns (deliberately few, high-signal):
  py: bare `except:`; `except ...:` whose body is only pass/continue/return None
  sh: `|| true`
  both: a `loud-failure-exempt` marker with no reason after it is itself a finding.
A line carrying `# loud-failure-exempt: <reason>` passes.
"""
import json
import re
import sys

EXEMPT = re.compile(r"loud-failure-exempt:\s*(\S.*)$")
EXEMPT_BARE = re.compile(r"loud-failure-exempt:?\s*$")


def scan_py(lines):
    out = []
    for i, line in enumerate(lines):
        if EXEMPT.search(line):
            continue
        if re.match(r"\s*except\s*:", line):
            out.append({"line": i + 1, "pattern": "bare-except", "detail": "bare `except:` swallows every error"})
            continue
        if re.match(r"\s*except\b[^:]*:\s*$", line):
            nxt = next((l for l in lines[i + 1:i + 4] if l.strip()), "")
            if re.match(r"\s*(pass|continue|return\s+None|return\s*)\s*(#.*)?$", nxt):
                out.append({"line": i + 1, "pattern": "swallowed-exception", "detail": "exception caught and dropped"})
    return out


def scan_sh(lines):
    out = []
    for i, line in enumerate(lines):
        if EXEMPT.search(line):
            continue
        if re.search(r"\|\|\s*true\b", line) and not line.lstrip().startswith("#"):
            out.append({"line": i + 1, "pattern": "or-true", "detail": "`|| true` hides a failing command"})
    return out


def main(argv):
    if len(argv) < 3 or argv[1] not in ("py", "sh"):
        sys.stderr.write("usage: loudfail_scan.py <py|sh> <path>\n")
        return 2
    lines = sys.stdin.read().splitlines()
    findings = scan_py(lines) if argv[1] == "py" else scan_sh(lines)
    for i, line in enumerate(lines):
        if EXEMPT_BARE.search(line):
            findings.append({"line": i + 1, "pattern": "exempt-without-reason", "detail": "exemption marker has no reason"})
    if findings:
        sys.stdout.write(json.dumps(findings))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
