---
name: install-rules
description: Copy all 18 operator-os rule files into this project's .claude/rules/ so Claude Code loads them. Use when the user says "install the rules", "install operator-os rules", or the session start line says rules are not installed.
---

# Install the operator-os rules

A Claude Code plugin cannot ship rule files directly, so the rules live in the plugin's `rules/` folder
and this skill copies them into the project.

1. Run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/install-rules.sh` (pass rule names to install only some, `--force` to overwrite).
2. Report which files were copied and which were skipped because they already existed.
3. Tell the user the rules load automatically from the next session, and that they can edit the copies freely.

The rules are plain markdown. Delete any you do not want from `.claude/rules/`.
