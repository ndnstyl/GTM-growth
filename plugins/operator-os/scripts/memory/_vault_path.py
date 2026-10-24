"""Where the vault lives, shared by every script in this folder.

OPERATOR_VAULT wins. Otherwise the Claude Code per-project memory folder for the current project
(~/.claude/projects/<project path with non-alphanumerics replaced by "-">/memory).
"""
import os
import re
import sys


def default_vault():
    v = os.environ.get("OPERATOR_VAULT")
    if v:
        return v
    proj = os.path.abspath(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
    slug = re.sub(r"[^A-Za-z0-9]", "-", proj)
    return os.path.join(os.path.expanduser("~"), ".claude", "projects", slug, "memory")


def require_vault():
    v = default_vault()
    if not os.path.isdir(v):
        sys.stderr.write(
            "operator-os: not configured: no vault folder at %s. "
            "Set OPERATOR_VAULT to your vault, or create the folder (see the init-vault skill).\n" % v
        )
        sys.exit(3)
    return v
