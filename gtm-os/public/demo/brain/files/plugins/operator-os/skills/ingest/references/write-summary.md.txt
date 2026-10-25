# Write the SOURCE summary page

## Dedup check first, before creating any page

Before writing a new page, hash the source content (sha256 of the raw file/text).
Check existing pages' `metadata.source` (and, where present, a stored source hash)
for a match or near-match:

- **Exact or near-duplicate source** (same file re-ingested, or the same content
  ingested from a different angle/URL): do NOT create a second page. Merge instead, append a dated `## Re-ingested ({YYYY-MM-DD})` note to the existing page citing
  the new raw path, and skip Steps 5-7 for a fresh page.
- **Genuinely new source**: proceed normally.
- This dedup check is about duplicate *sources*, not conflicting *claims* between
  two different sources, for a real claim-level conflict between primary-tier
  sources, see the precedence gate in `decide-shape.md` (Gate 2), which is a hard
  stop, not a merge.

**Any vault-write failure (create or append) fails silently and never blocks the
main ingest task.** Note the failed write in the Step 8 report so the operator can retry
manually; do not raise, retry-loop, or halt the ingest over it. (This is
infrastructure failure, distinct from the precedence hard stop below, which is a
truth conflict and MUST surface, never silently resolve.)

Filename: **the human title**, e.g. `Weekend Performance and Budget Meeting (2026-08-24).md`.
⚠ Corrected 2026-08-24: this said `{type}_{slug}.md` per `_WIKI-SCHEMA.md`, which spec 126
superseded when it renamed ~1,550 notes to human titles. Do NOT author a `name` field; the
vault watcher injects one as `name: ""` and you must set it to the filename stem afterward
or `vault-lint.py` flags it.

Required frontmatter:
```yaml
---
description: "One-sentence summary"
metadata:
  type: reference  # or feedback / project / user
  source: raw/path/to/source-file
  source_date: YYYY-MM-DD  # when source was authored
  ingested_date: YYYY-MM-DD  # today
---
```

Page body structure:
```markdown
# {Source title}

**Source:** [[raw/source-file]]
**Author/origin:** {who}
**Date:** {when source was authored}
**Ingested:** {today}

## Summary
{2-4 paragraphs capturing the source's argument or content}

## Key claims
- {Claim 1} (cited from source location if relevant)
- {Claim 2}
- {Claim 3}

## Connections
- Reinforces: [[other-page]] (because...)
- Contradicts: [[other-page]] (because...)
- Extends: [[other-page]] (because...)

## Open questions raised
- {Question 1}
- {Question 2}

## Notes
{the operator's reactions, my reactions, anything that doesn't fit above}

## Related
[[entity-page-1]] [[entity-page-2]] [[concept-page-3]]
```
