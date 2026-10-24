<!-- contents:start -->
## Contents

- [Step-by-step execution](#step-by-step-execution)
  - [Step 1: Define the candidate set](#step-1-define-the-candidate-set)
  - [Step 2: Cluster](#step-2-cluster)
  - [Step 3: Surface patterns](#step-3-surface-patterns)
  - [Step 4: Present to the operator](#step-4-present-to-the-operator)
  - [Step 5: Execute](#step-5-execute)
  - [Step 6: Append log entry](#step-6-append-log-entry)
  - [Step 7: Report to the operator](#step-7-report-to-the-operator)
<!-- contents:end -->

## Step-by-step execution

### Step 1: Define the candidate set

Read all files in scope. Note their frontmatter (especially `metadata.type`, `status`, `last_verified`, tags).

For each file, extract:
- Wikilinks (outbound + inbound)
- Numeric claims (dollars, percentages, dates, counts)
- Quoted statements (especially from people pages)
- Action items + commitments
- Open questions

### Step 2: Cluster

Group candidate pages by:
- **Entity co-occurrence**, pages that link to the same 2+ entities
- **Conceptual overlap**, pages that link to the same 2+ concepts
- **Numeric consistency**, pages stating the same metric (cross-check for contradictions)
- **Temporal proximity**, pages from the same time window discussing the same topic

### Step 3: Surface patterns

For each cluster, write a candidate finding:

```markdown
### Pattern: [name]

**Evidence:** [3-5 source pages backing this]
**Strength:** [low / medium / high based on data point count]
**Type:** [recurring-theme / contradiction / missing-page / metric-drift]

**The pattern:**
[2-3 sentences describing what emerged]

**Why it matters:**
[Operational or strategic implication]

**Candidate concept page:**
- Title: [proposed]
- Frontmatter: [type, owner, status]
- Section structure: [proposed]

**Action:**
[ ] Create new concept page
[ ] Update existing concept page: [link]
[ ] No action; pattern is decorative not load-bearing
[ ] Flag contradiction for the operator review
```

### Step 4: Present to the operator

Surface findings as a punch-list, ranked by leverage:

```markdown
## /synthesize report, {YYYY-MM-DD}, scope: {scope}

### HIGH leverage (act this week)
- {Pattern 1}: {strength}, {recommended action}

### MEDIUM leverage (act this month)
- {Pattern N}

### INFO (consider next quarter)
- {Pattern N}

### Contradictions surfaced
- {page A} claims X; {page B} claims Y, which is current?

### Missing entities (3+ mentions, no page)
- {Entity name} mentioned in {N} pages, create page?

### Suggested next sources to ingest
- {Topic gap}, what would close this?
```

**Execute without asking**:
- Creating new concept pages
- Appending to existing pages

**Still gated, because these destroy or adjudicate rather than add:**
- Merging or deduplicating pages (a merge deletes a page)
- Rewriting or deleting existing content
- Resolving a contradiction that is not clearly sequential self-correction, surface it,
  the operator adjudicates

### Step 5: Execute

For each additive action, and each gated action the operator approved:
- Create or update wiki page
- Add `[[wikilinks]]` to evidence pages
- Update [[MEMORY.md]] (general vault) or [[index.md]] (client vault) if new page

### Step 6: Append log entry

```markdown
## [YYYY-MM-DD] synthesize | scope: {scope}

- Pages scanned: {count}
- Patterns surfaced: {count}
- New concept pages created: {list}
- Pages updated: {list}
- Contradictions adjudicated: {list}
- Open questions raised: {list}
- Notes: {brief}
```

### Step 7: Report to the operator

Tight summary:
- Patterns surfaced (with counts)
- Actions executed
- Open items needing the operator decision
- Suggested next sources to ingest (gaps in coverage)
