---
description: The conventions for this example vault, copied from the starter vault schema.
type: reference
---
# Wiki schema

Every note has frontmatter with `description` (one sentence, declarative) and `type` (feedback | project | reference | user | learning | source | sop).
`name`, if present, equals the filename stem. Raw sources live in `raw/` and are never edited. Notes cite their raw source as `[[raw/<file>]]`.

Folders: `00-BOARD` is the status record, `10-PROJECTS` holds things with an end, `20-AREAS` holds things that never end, `30-KNOWLEDGE` holds what we learned, `40-SOPS` holds how someone else runs it, `90-ARCHIVE` holds retired notes.

Note titles are sentences a person would say, not database keys. A hard rule is a title that states the rule. See [[MEMORY]] for the index.
