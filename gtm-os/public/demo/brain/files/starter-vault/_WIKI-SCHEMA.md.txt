---
description: The conventions for this vault: folders, frontmatter, links, raw sources.
type: reference
---
# Wiki schema

Every note has frontmatter with `description` (one sentence, declarative) and `type` (feedback | project | reference | user | learning | source | sop).
`name`, if present, equals the filename stem. Raw sources live in `raw/` and are never edited. Notes cite their raw source as `[[raw/<file>]]`.

Titles are sentences a person would say, not database keys. A hard rule is a title that states the rule. Link with `[[Note Title]]`; the lint resolves links by file name anywhere in the vault.

Folders: `00-BOARD` status, `10-PROJECTS` things with an end, `20-AREAS` things that never end, `30-KNOWLEDGE` what was learned, `40-SOPS` how someone else runs it, `90-ARCHIVE` retired, `raw/` sources, `templates/` note shapes.

Every new note is added to [[MEMORY]] (or to a folder map that [[MEMORY]] links) in the same turn, or the lint reports it as an orphan.
