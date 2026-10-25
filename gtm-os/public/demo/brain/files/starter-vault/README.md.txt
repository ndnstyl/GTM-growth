---
description: How to use the starter vault: folders, frontmatter contract and the capture, ingest, search, lint loop.
type: reference
---
# Starter vault

An empty, working knowledge vault for the Operator OS method. Copy this folder wherever you keep notes (any folder works; it is plain markdown and opens in Obsidian), then point the plugin at it:

```
export OPERATOR_VAULT=/path/to/your/vault
```

Or let the plugin make a minimal one for you with `/operator-os:init-vault`. This starter is the fuller version: the full folder layout, the templates, and the schema.

## What the folders are for

| Folder | Holds | Rule of thumb |
|---|---|---|
| `00-BOARD/` | the status record: board, north star, queue, one card per piece of work | status lives here before it goes in an email |
| `10-PROJECTS/` | work with an end | a project has a goal, a gate and a status |
| `20-AREAS/` | responsibilities that never end | marketing, sales, operations, finance |
| `30-KNOWLEDGE/` | what you learned: concepts, references, people | one idea per note, titled as a sentence |
| `40-SOPS/` | how someone else runs it | three parts: by hand, what the assistant does, what is being built |
| `90-ARCHIVE/` | retired notes | lint ignores it; links into it are reported |
| `raw/` | sources exactly as they arrived | never edited; notes cite them as `[[raw/<file>]]` |
| `templates/` | note shapes | copy, fill, delete the prompts |

`MEMORY.md` is the index. It loads into every session, so it stays short: one line per note, a hook under about 160 characters, under 24,400 bytes in total. The plugin's write-time hook warns you before it passes the cap.

## The frontmatter contract

Every note starts with `description` (one declarative sentence) and `type` (`feedback`, `project`, `reference`, `user`, `learning`, `source` or `sop`). `name`, if present, must equal the filename. `refresh_due: YYYY-MM-DD` marks a fact that goes stale. The lint script checks all of it.

## The loop

1. **Capture** the moment something is corrected, decided or diagnosed: `/operator-os:distill`.
2. **Ingest** a source dropped in `raw/`: `/operator-os:ingest`.
3. **Search** from the shell: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-search.py "query" --snippets`.
4. **Lint** weekly: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-lint.py`. Zero broken links and zero orphans is the bar.

See `examples/example-vault/` in this repository for a fictional company with the method in motion.
