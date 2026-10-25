# Identify and update related pages

For each entity/concept the source touches:

**If page exists:**
- Read the page
- Identify where the new source's claims fit
- Append (don't overwrite) with a "## From {source-title} ({YYYY-MM-DD})" subsection OR integrate into existing sections with `[[source-page]]` citation
- Preserve original claims even if new source contradicts; flag contradictions explicitly

**If page doesn't exist AND the entity/concept is mentioned 2+ times AND it's significant:**
- Create the page following the appropriate prefix convention (`person_*`, `org_*`, `concept_*`, etc.)
- Include frontmatter, brief overview, first reference (which is the source you just ingested)

For client vaults: EVERY claim derived from the source MUST cite back to `[[raw/source-file]]`. Bonus-tied accuracy depends on this trail.
