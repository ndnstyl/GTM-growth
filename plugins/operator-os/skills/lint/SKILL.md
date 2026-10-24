---
name: lint
description: "Health-check the LLM Wiki. Deterministic pass first (vault-lint.py in this plugin: broken wikilinks, orphans, frontmatter contract, duplicate basenames, overdue refresh_due, index drift, MEMORY.md byte budget), then LLM judgment on top (near-duplicates, semantic staleness, uncited claims, missing entity pages). Produces a punch-list for the operator to approve. Implements the Karpathy LLM Wiki lint pattern."
---

# /lint, Wiki health check

## Architecture

Code checks what code can check; the LLM judges what needs judgment. The
deterministic pass is `${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-lint.py` (stdlib, read-only, ~0.1s,
exit 0/1/2 = clean/warnings/critical). Adapted from the claude-obsidian
deterministic-lint pattern (MIT).

## When to invoke

- The operator says `/lint`, `/lint quick`, or `/lint full`
- Weekly cadence, schedule the deterministic pass (cron, launchd or a scheduled agent) and
  keep the report wherever you keep reports
- Ad-hoc after a big ingest session
- Before a major handoff (e.g., before sharing the vault with a client or teammate)

## Modes

| Mode | Coverage | When |
|---|---|---|
| `/lint quick` | Deterministic pass only (script) | Weekly / after ingests |
| `/lint full` | Script + all LLM judgment checks below | Monthly OR pre-handoff |
| `/lint cite` | Uncited-claim audit (client vaults only) | Before client meeting |

## Step 1, Deterministic pass (always)

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-lint.py --max-list 25
# client vault: add --vault /path/to/vault
# reproducible freshness cutoff: --as-of YYYY-MM-DD
```

Script checks: MEMORY.md byte budget (24,400B load cap), broken wikilinks,
orphans, frontmatter contract (name/description/metadata.type, name == stem),
duplicate basenames, overdue `refresh_due:` dates, root-index drift, log.md
age, stub notes. `raw/`, `templates/`, and `00-BOARD/` are exempt from
frontmatter/orphan checks (board hygiene is its own cleanup).

Then the index-expiry pass: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/index_expiry.py`
lists every MEMORY.md ⏰ line whose linked note has no `refresh_due:`, a passed one, or
no note at all. Each row is a demotion candidate (move the line verbatim to the owning
`_map.md`) or a refresh candidate (re-verify the note and set new dates). A root line is
earned by a live deadline or a hard rule, nothing else; the turn recall feeder finds
everything that lives in a `_map.md`.

## Step 2, LLM judgment checks (`full` mode)

### Near-duplicate detection
No embeddings needed at this vault size. Use retrieval + reading:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-search.py "<topic of note>" --top 5
```
For notes flagged by similar names/descriptions in MEMORY.md/_maps, READ both
candidates and judge: (a) merge, (b) sharpen the distinction, (c) leave alone.
The operator picks, never auto-merge.

### Semantic staleness
Pages >90 days unmodified containing dated language ("currently", "recently",
"as of", "this quarter") or volatile facts (access states, vendor configs)
without a `refresh_due:` field. Surface as re-verification candidates and
propose adding `verified:` / `refresh_due:` frontmatter per the freshness
convention in `_how-this-works`.

### Missing entity detection
Terms/people appearing 3+ times across notes with no page of their own.
Surface as creation candidates. (Respect the no-colleague-dossiers rule.)

### Uncited-claim audit (`cite`, client vaults)
Every claim derived from a raw source must cite `[[raw/...]]`. Find factual
paragraphs without citations. Surface as audit risk, NEVER fabricate a
citation to silence the warning; surface the gap.

## Output format

Punch-list grouped by severity (CRITICAL / WARNING / INFO / Auto-fixable with
sign-off). Wait for the operator's go/no-go on each auto-fixable item. NEVER
auto-execute fixes without approval.

## Append to log.md after lint

```markdown
## [YYYY-MM-DD] lint | {quick|full|cite} | vault: {vault-name}
- Deterministic: exit {0|1|2}, {broken} broken links, {orphans} orphans, {dupes} dupes
- Judgment: near-dups {n}, stale {n}, missing entities {n}
- Auto-fixed (the operator-approved): {list}
- Open items: {list}
```

## Constraints

- NEVER auto-delete files (always confirm)
- NEVER auto-merge near-duplicates (the operator picks the merge)
- NEVER fabricate citations to fix uncited-claim warnings
- Always append the lint entry to `log.md` even if the punch-list is empty

## Anti-patterns

- Re-implementing the deterministic checks by hand in-session (run the script)
- Auto-fixing without the operator's review (breaks trust)
- Flagging near-duplicates without surfacing both pages' content (the operator can't judge blind)
- Skipping the log append (breaks the chronological audit trail)
