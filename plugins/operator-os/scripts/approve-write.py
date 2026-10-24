#!/usr/bin/env python3
"""approve-write.py: the operator mints a one-use approval for one gate in the platform-write registry.

Run it YOURSELF with the "!" prefix in Claude Code so it is not an agent tool call:
    !python3 "${CLAUDE_PLUGIN_ROOT}/scripts/approve-write.py" <gate-id> [--subject-sha SHA] [--ttl SECONDS] [--uses N]

--subject-sha pins the token to the exact call the gate denied (the denial message prints the command to
run). Without it the token says "*" and covers any call to that gate, so prefer the pinned form.
Exit codes: 0 minted, 2 usage or unknown gate, 3 state directory unwritable.
"""
import argparse
import json
import os
import sys
import time
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))


class MintError(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def registry_path(project):
    explicit = os.environ.get("OPERATOR_PLATFORM_WRITES")
    candidates = [explicit] if explicit else []
    candidates += [os.path.join(project, ".operator", "platform-writes.json"),
                   os.path.join(HERE, "..", "hooks", "platform-writes.json")]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    raise MintError("no platform-write registry found; create .operator/platform-writes.json first", 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("gate")
    ap.add_argument("--subject-sha", default="*")
    ap.add_argument("--ttl", type=int, default=900)
    ap.add_argument("--uses", type=int, default=1)
    args = ap.parse_args()
    project = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    reg = registry_path(project)
    with open(reg, encoding="utf8") as f:
        gates = {g["id"] for g in json.load(f).get("gates", [])}
    if args.gate not in gates:
        raise MintError(f"unknown gate {args.gate!r}; the registry at {reg} has: {sorted(gates) or 'no gates'}", 2)
    if args.ttl < 1 or args.uses < 1:
        raise MintError("--ttl and --uses must be positive", 2)
    state = os.path.join(project, ".operator")
    approvals = os.path.join(state, "approvals")
    receipts = os.path.join(state, "receipts")
    try:
        os.makedirs(approvals, exist_ok=True)
        os.makedirs(receipts, exist_ok=True)
        name = f"{args.gate}__{uuid.uuid4().hex[:12]}.json"
        token = {"gate": args.gate, "subject_sha": args.subject_sha, "expires_at": int(time.time()) + args.ttl,
                 "uses_left": args.uses, "consumed": []}
        with open(os.path.join(approvals, name), "w", encoding="utf8") as f:
            json.dump(token, f, indent=1)
        with open(os.path.join(receipts, "write_gate.jsonl"), "a", encoding="utf8") as f:
            f.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "event": "minted",
                                "gate": args.gate, "file": name, "subject_sha": args.subject_sha,
                                "ttl": args.ttl, "uses": args.uses}) + "\n")
    except OSError as e:
        raise MintError(f"cannot write approval state under {state}: {e}", 3) from e
    print(f"minted {args.gate} approval {name}: {args.uses} use(s), {args.ttl}s, call {args.subject_sha}")


if __name__ == "__main__":
    try:
        main()
    except MintError as e:
        print(f"approve-write: {e}", file=sys.stderr)
        sys.exit(e.code)
