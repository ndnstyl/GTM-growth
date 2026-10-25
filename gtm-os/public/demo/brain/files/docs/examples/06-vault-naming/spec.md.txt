# Vault Human Naming: every note named for a person, not a database (case study: Harbor & Pine Home Services)

**Status**: Built | **Created**: 2026-05-02 | **Owner**: Dana Ortiz (fictional)
**Ruling**: "The name of the file has to make sense to me. I am a human, not an AI. That is clutter for no reason. Rename every single one."

## What is wrong

About 1,700 vault notes carried machine names: `card_unified-reporting-platform-117`, `learning_a_default_value_holds_two_populations_so_no_rate_over_it_means_anything`. Type prefixes, snake_case, kit-number suffixes. The filename is the owner's primary interface in the vault and in the notes app, and it read like clutter.

## The naming convention (v1; the owner may retitle any file afterward, which is the point)

Title Case, real spaces, plain words. The folder already carries the type, so the filename stops repeating it.

| Type today | New pattern | Example |
|---|---|---|
| `card_*` | `<Short Title>`, with the kit number only when it identifies | `Unified Reporting Platform (Kit 117).md` |
| `learning_*` | the lesson stated plainly | `A Short Page Is Not the Last Page.md` |
| `feedback_*` | the rule as the owner gave it | `Execute, Don't Ask.md` |
| `reference_*` | what it is | `Product Canon.md` |
| `raw/session-*` | `Session - <topic> (YYYY-MM-DD)` | `Session - Naming Rules (2026-05-01).md` |

Hard rules: at most 60 characters where possible; no em dashes; no type prefixes; numbers only when they identify (kit numbers, dates).

## Continuity guarantees (what makes a 1,700-file rename safe)

1. **A vault checkpoint immediately before execution** is the one-command rollback.
2. **Frontmatter name** updated to the new stem so the lint contract holds.
3. **An alias of the old stem** added to every renamed note: the notes app resolves old links, search still matches the old machine name, and any repository file that cites the old name keeps resolving through search.
4. **Every wikilink rewritten** from the rename map in the same pass (about 8,000), plus the root index, every area map, the queue and the priority ruling.
5. **The gate**: the lint's broken-wikilink count must be at or below the pre-migration count, with zero NEW breaks, or the run rolls back automatically to the checkpoint.

## User stories

### Story 1: The rename map is proposed, not applied (P1)

A dry run writes the old-to-new map with collisions flagged. Nothing on disk changes.

**Independent test**: the dry run lists every note once, flags duplicate targets, and a diff of the vault before and after is empty.

### Story 2: The migration is atomic (P1)

Checkpoint, rename, rewrite links, run lint, compare counts. Any new break restores the checkpoint and reports which link broke.

**Independent test**: plant one deliberately unresolvable link in the map; the run rolls back and the vault is byte-identical to the checkpoint.

### Story 3: Old names keep working (P2)

Search for an old machine name returns the renamed note through its alias.

### Story 4: New notes follow the convention without effort (P2)

The distill skill and the lint both know the pattern; lint warns on a prefixed or snake_case filename.

## Requirements

- **REQ-01**: A rename never changes a note's content except its frontmatter name, its aliases and links.
- **REQ-02**: Collisions are resolved by adding the distinguishing context in parentheses, never by overwriting.
- **REQ-03**: The rename tool refuses to run without a fresh checkpoint.
- **REQ-04**: Machine-readable paths in scripts and rules that cite old names are found by search and fixed in the same pass.

## Success criteria

- **SC-001**: Zero new broken links; the pre-existing ones are on a punch list.
- **SC-002**: 100 percent of renamed notes carry an alias of the old stem.
- **SC-003**: The owner can find the right note by title from the root index without search.

## What the case study teaches

A mass rename is safe when the rollback is one command and the success test is a count the tool computes itself. A rename migration also breaks every machine-readable path that cites an old name, so search the codebase for them in the same pass.
