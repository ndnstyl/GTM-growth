---
name: init-vault
description: Create a minimal knowledge vault (MEMORY.md index, log, schema, learning template) for this project so the vault search, recall hooks, lint and ingest skills have something to work on. Use when the session start line says the vault is not configured, or the user says "set up the vault" or "init vault".
---

# Initialise the vault

1. Run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/init-vault.sh` (optionally pass a folder path).
2. Report the vault path it printed. The script never overwrites an existing file.
3. If the user wants the vault somewhere else, tell them to set `OPERATOR_VAULT` to that folder in their shell or in `.claude/settings.json` under `env`.

After this, `ingest`, `lint`, `synthesize`, the recall hooks and `vault-search.py` all work on that folder.
