#!/usr/bin/env python3
"""Push the knowledge vault to its canonical remote home and verify it landed.

If your vault lives on a server or a second machine, a note that exists only on one laptop does not
exist. This is the one tool that moves a vault write to the remote:

  vault_push.py            push, verify by checksum, write a receipt
  vault_push.py --if-dirty push only when a vault file changed since the last good push
  vault_push.py --quiet    one line on stdout instead of the receipt

Configuration (environment):
  OPERATOR_VAULT          local vault folder (default: the per-project Claude memory folder)
  OPERATOR_VAULT_REMOTE   rsync/ssh destination, e.g. user@host:/path/to/vault  (REQUIRED)
  Unset OPERATOR_VAULT_REMOTE = "not configured": prints one line and exits 3.

Contract: rsync --update (newest wins) never deletes; after the copy a checksum dry run in the same
direction must list zero files. Exit 0 ok, 1 transfer or verify failure, 3 not configured or the
remote is unreachable. A receipt per run lands under .operator/receipts/vault-push/, plus last_ok as
the marker --if-dirty compares against. A failure also writes ALERT_vault-push.md at the vault root;
a success removes that alert.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vault_path import default_vault  # noqa: E402

VAULT_DIR = default_vault()
VAULT = VAULT_DIR.rstrip("/") + "/"
REMOTE = os.environ.get("OPERATOR_VAULT_REMOTE", "")
PROJECT = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
LOG = PROJECT / ".operator" / "receipts" / "vault-push"
MARKER = LOG / "last_ok"
ALERT = pathlib.Path(VAULT) / "ALERT_vault-push.md"
EXCLUDES = ["--exclude", ".DS_Store", "--exclude", ".obsidian/workspace*",
            "--exclude", "ALERT_*",
            # the vault's git history is written in one place only; copying .git between two machines by
            # newest-wins would mix two histories into one corrupt one
            "--exclude", ".git/"]


def run(cmd, timeout=900):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)  # loud-failure-exempt: every caller grades rc and carries stderr into the receipt


def vault_dirty_since(marker: pathlib.Path) -> bool:
    if not marker.exists():
        return True
    since = marker.stat().st_mtime
    for root, dirs, files in os.walk(VAULT):
        dirs[:] = [d for d in dirs if d != ".obsidian"]
        for f in files:
            if f == ".DS_Store":
                continue
            try:
                if os.stat(os.path.join(root, f)).st_mtime > since:
                    return True
            except FileNotFoundError:  # loud-failure-exempt: a file deleted mid-walk is not a dirty vault; the push itself re-walks
                continue
    return False


def write_alert(reason: str) -> None:
    ALERT.parent.mkdir(parents=True, exist_ok=True)
    ALERT.write_text(
        "# ALERT: vault push to the remote failed\n\n"
        f"- when: {dt.datetime.now().isoformat(timespec='seconds')}\n- reason: {reason}\n\n"
        "A note that exists only on one machine does not exist. "
        "Re-run vault_push.py once the remote is reachable; this alert clears on the next good push.\n")


def main(argv: list[str]) -> int:
    if_dirty = "--if-dirty" in argv
    quiet = "--quiet" in argv
    if not REMOTE or ":" not in REMOTE:
        print("vault_push: not configured: set OPERATOR_VAULT_REMOTE to user@host:/path/to/vault", file=sys.stderr)
        return 3
    if not os.path.isdir(VAULT):
        print(f"vault_push: not configured: no vault folder at {VAULT}", file=sys.stderr)
        return 3
    host = REMOTE.split(":", 1)[0]
    LOG.mkdir(parents=True, exist_ok=True)
    if if_dirty and not vault_dirty_since(MARKER):
        if not quiet:
            print("vault_push: nothing changed since the last good push")
        return 0
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = REMOTE.rstrip("/") + "/"
    rec: dict = {"at": ts, "src": VAULT, "dest": dest, "mode": "update"}
    probe = run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, "true"], timeout=40)
    if probe.returncode != 0:
        rec["error"] = f"remote unreachable: {probe.stderr.strip()[:200]}"
        rec["ok"] = False
        (LOG / f"push_{ts}.json").write_text(json.dumps(rec, indent=1))
        write_alert(rec["error"])
        print(f"vault_push: {rec['error']}", file=sys.stderr)
        return 3
    cp = run(["rsync", "-a", "--update", "--itemize-changes", *EXCLUDES, VAULT, dest])
    rec["rsync_rc"] = cp.returncode
    rec["files_sent"] = sum(1 for l in cp.stdout.splitlines() if l.startswith("<f"))
    if cp.returncode != 0:
        rec["rsync_stderr"] = cp.stderr.strip()[:300]
    vf = run(["rsync", "-anc", "--update", "--itemize-changes", *EXCLUDES, VAULT, dest])
    left = [l for l in vf.stdout.splitlines() if l.startswith("<f")]
    rec["verify_rc"] = vf.returncode
    rec["still_differ_after_verify"] = len(left)
    rec["ok"] = cp.returncode == 0 and vf.returncode == 0 and not left
    (LOG / f"push_{ts}.json").write_text(json.dumps(rec, indent=1))
    if not rec["ok"]:
        reason = (f"rsync rc={cp.returncode} verify rc={vf.returncode}, {len(left)} file(s) still differ: "
                  f"{left[:3]} {cp.stderr.strip()[:200]}")
        write_alert(reason)
        print(f"vault_push: {reason}", file=sys.stderr)
        return 1
    MARKER.write_text(ts)
    if ALERT.exists():
        ALERT.unlink()
    print(f"vault_push: ok, {rec['files_sent']} file(s) sent, 0 differ after verify, receipt push_{ts}.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
