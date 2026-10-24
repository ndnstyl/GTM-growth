#!/usr/bin/env python3
"""Does a gated pattern match something this command RUNS, or something it merely QUOTES?

`platform-write-gate.sh` matches a regex against the whole Bash command string. A command string
carries two different things: the words that will be executed, and literal data that happens to be
inside it. The regex cannot tell them apart, so on 2026-09-21 it denied a `pbcopy` of a command for
the operator to run, a heredoc appending a sentence to a board card that described a failed upload, and
`r2 object put --help`, while the day's only real platform write (a 108 MB R2 upload driven from
inside a Python script) never reached it at all. Three refusals of mentions, one miss of an act.

This module answers the narrower question the gate actually cares about: after a pattern has already
matched, does it still match once the literal data is removed?

USE
    printf '%s' "$CMD" | python3 command_scope.py --pattern '<regex>'
      exit 0  MENTION   the pattern survives only in data; the gate may downgrade to allow
      exit 1  EXEC      the pattern is in executable position; the gate must deny
      exit 2  UNKNOWN   could not be parsed with confidence; the gate must deny

Exit 2 is not an error path, it is the design: anything this module cannot read confidently stays
denied, so a parsing gap can never open a gate. The gate calls this ONLY on a command a regex has
already matched, so a command that was never going to be denied pays nothing for it, and the only
possible effect is turning a deny into an allow that gets logged as such.

HOW A SEGMENT IS CLASSIFIED
    inert sink (echo, printf, cat, tee, pbcopy, jq, ...)  contributes NOTHING. Its arguments are
        data by definition: it cannot execute them. This is what makes quoting a command safe.
    anything else  contributes its argv AND any heredoc body it is fed, because a non-inert
        command may well run what it is handed (`bash <<EOF`, `xargs`, an unknown script reading
        stdin). Conservative on purpose.
    a heredoc with an UNQUOTED delimiter always contributes its body regardless of the sink,
        because the shell performs command substitution inside it before anything else sees it.
    a segment carrying --help or -h contributes nothing: it prints usage and writes nothing.

A segment whose command word is dynamic (`$CMD`, `${x}`, backticks) makes the whole answer UNKNOWN.
"""
from __future__ import annotations

import argparse
import re
import shlex
import sys

# Commands that cannot execute their arguments. Writing a file is fine here: this gate is about
# writes to a PLATFORM, not to the local disk, so `tee`, `sed -i` and friends are inert for it.
INERT = {
    "echo", "printf", "cat", "bat", "tee", "pbcopy", "pbpaste", "head", "tail", "wc", "jq", "yq",
    "sort", "uniq", "tr", "rev", "cut", "paste", "fold", "nl", "od", "strings", "column", "expand",
    "less", "more", "diff", "comm", "join", "base64", "shasum", "md5", "sha256sum", "true", "false",
}

# Never treated as inert even if someone adds them above by accident: these run what they are given.
INTERPRETERS = {
    "bash", "sh", "zsh", "dash", "ksh", "fish", "eval", "exec", "source", ".",
    "python", "python2", "python3", "node", "deno", "bun", "ruby", "perl", "php", "osascript",
    "xargs", "env", "sudo", "doas", "nohup", "timeout", "time", "ssh", "watch", "parallel",
}

CONTROL = {"|", "||", "&&", ";", "&", "(", ")", "{", "}", "\n"}
DYNAMIC = re.compile(r"[$`]")


class Unknown(Exception):
    """Parsing was not confident. The caller must deny."""


def split_heredocs(command: str) -> tuple[str, list[tuple[str, bool]]]:
    """Strip heredoc bodies out of the command text.

    Returns the command with bodies removed, and a list of (body, delimiter_was_quoted). A quoted
    delimiter ('EOF', "EOF", \\EOF) means the shell does no substitution inside the body, so the
    body is pure data unless it is fed to something that executes it. An unquoted delimiter means
    the shell expands `$(...)` and backticks inside the body before the sink ever runs, so that
    body is executable no matter what the sink is.
    """
    bodies: list[tuple[str, bool]] = []
    out_lines: list[str] = []
    lines = command.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.search(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1", line)
        if not m:
            out_lines.append(line)
            i += 1
            continue
        quoted = bool(m.group(1)) or "\\" in line[m.start():m.start() + 3]
        delim = m.group(2)
        out_lines.append(line[:m.start()])        # keep the command part, drop the << token
        body: list[str] = []
        i += 1
        closed = False
        while i < len(lines):
            if lines[i].strip() == delim:
                closed = True
                i += 1
                break
            body.append(lines[i])
            i += 1
        if not closed:
            raise Unknown(f"heredoc <<{delim} is never closed")
        bodies.append(("\n".join(body), quoted))
    return "\n".join(out_lines), bodies


def segments(text: str) -> list[list[str]]:
    """Split into pipeline/list segments and tokenize each into argv."""
    lex = shlex.shlex(text, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    try:
        tokens = list(lex)
    except ValueError as e:                      # unbalanced quote, bad escape
        raise Unknown(f"cannot tokenize: {e}") from e
    segs: list[list[str]] = [[]]
    for t in tokens:
        if t in CONTROL or all(c in "|&;()" for c in t):
            segs.append([])
        else:
            segs[-1].append(t)
    return [s for s in segs if s]


def head_of(argv: list[str]) -> str:
    """The command word, skipping leading VAR=value assignments. Raises Unknown if dynamic."""
    for tok in argv:
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", tok):
            continue
        if DYNAMIC.search(tok):
            raise Unknown(f"command word is dynamic: {tok!r}")
        return tok.rsplit("/", 1)[-1]
    raise Unknown("no command word in segment")


def executable_text(command: str) -> str:
    """The parts of `command` that will actually be run, as one string to re-match against."""
    stripped, bodies = split_heredocs(command)
    segs = segments(stripped)
    heads = [head_of(argv) for argv in segs]

    # `echo 'npx wrangler pages deploy' | bash` must NOT be a mention. An inert command's output
    # is only data while nothing downstream executes it, and a pipeline hands that output straight
    # to the next command. So if ANY segment on this command line is an interpreter, nothing here
    # is data: the whole thing is live. Found by test_echo_piped_into_a_shell_is_exec, which
    # reported MENTION before this check existed.
    if any(h in INTERPRETERS for h in heads):
        return command

    parts: list[str] = []
    feeds_executor = False
    for argv, head in zip(segs, heads):
        if "--help" in argv or "-h" in argv:
            continue                              # prints usage, writes nothing
        if head in INERT:
            continue                              # its arguments are data, not commands
        feeds_executor = True
        parts.append(" ".join(argv))
    for body, quoted in bodies:
        # An unquoted delimiter substitutes before anything runs, so its body is always live.
        # A quoted body is live only if some non-inert command in this command line could run it.
        if not quoted or feeds_executor:
            parts.append(body)
    return "\n".join(parts)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pattern", required=True)
    ap.add_argument("--command", default=None, help="default: read the command from stdin")
    a = ap.parse_args(argv)
    command = a.command if a.command is not None else sys.stdin.read()
    try:
        rx = re.compile(a.pattern, re.IGNORECASE)
    except re.error as e:
        print(f"UNKNOWN: pattern does not compile: {e}", file=sys.stderr)
        return 2
    if not rx.search(command):
        # The caller should only ever call us on a match. If it does not match, say so loudly
        # rather than quietly reporting MENTION and teaching the caller to trust us wrongly.
        print("UNKNOWN: the pattern does not match the command at all", file=sys.stderr)
        return 2
    try:
        live = executable_text(command)
    except Unknown as e:
        print(f"UNKNOWN: {e}", file=sys.stderr)
        return 2
    if rx.search(live):
        print("EXEC")
        return 1
    print("MENTION")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
