# Learning Capture Discipline

**Long, high-token sessions are the norm.** Auto-compaction will compress learnings out of context before session-end capture mechanisms fire. Capture continuously, not at session-end.

## When to capture (mandatory triggers)

Within the **same or next turn** after any of these:

1. **User correction.** the operator corrects approach, framing, naming, stance, or scope. Capture as `feedback`.
2. **Bug diagnosed and fixed.** Non-trivial bug you traced root cause for. Capture as `learning`.
3. **Pattern recognized.** Reusable structure (pitch framing, deliverable shape, deploy gotcha, naming convention). Capture as `learning`.
4. **External data verified or contradicted.** Researcher data corrected by the operator's ground truth, or backed by independent vectors. Capture as `learning`.
5. **Architectural decision.** Naming, structure, framing, or strategic call made jointly with the operator that has cross-project relevance. Capture as `decision`.
6. **Operational trap surfaced.** Deploy issue, build issue, cache issue, configuration issue with non-obvious root cause. Capture as `learning`.

## Canonical store rule

The auto-memory wiki (the vault, `$OPERATOR_VAULT`) is the CANONICAL store for learnings. If you keep
the vault on a server or second machine, every vault write made elsewhere is pushed there and verified
by checksum in the same turn, by `${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault_push.py` (configure it with
`OPERATOR_VAULT_REMOTE`; unconfigured, it prints a one-line "not configured" notice). A note that exists
only on one laptop does not exist.

## Raw-source discipline 

A wiki page without provenance is an opinion without receipts. For every NEW learning captured:
- If it came from a session exchange: paste the 3-10 line triggering excerpt (the operator's words plus the moment of correction/decision) into `raw/session-<topic>_<YYYY-MM-DD>.md` in the wiki, and cite it from the page with `[[raw/session-<topic>_<YYYY-MM-DD>]]`.
- If it came from an external source (article, transcript, research report): drop the source into `raw/` first, then write the page citing it. Deep-research reports ALWAYS land in `raw/` and get an `/ingest`.
- `name:` in frontmatter is snake_case matching the filename stem exactly (kebab-case breaks the Obsidian graph).
- Do NOT retroactively backfill raw sources for older pages; forward-only.

## The store rule (single canonical store)

Every committed learning goes to the vault:

**Auto-memory** (`$OPERATOR_VAULT/`)
- Write markdown file with frontmatter: `name`, `description`, `metadata.type` in {user, feedback, project, reference}
- Update `MEMORY.md` index with one-line entry under the right section (one line, hook under ~160 chars; MEMORY.md must stay under 24,400 bytes or it truncates on load)

## Batch cadence

- For efficiency, accumulate 2-4 candidates and ship as a batch when a logical break occurs (end of work block, milestone shipped, before moving to next task)
- Do NOT defer batches past 20-30 substantive iterations or ~30 minutes of active work, whichever comes first
- Long-session checkpoint rule: if conversation has produced >5 substantive iterations since last capture, batch and ship before continuing

## What NOT to capture

- Ephemeral session state (chunk hashes, build IDs, current task progress)
- Project-tactic-only details that don't generalize
- Already-indexed items (check `MEMORY.md` before writing)
- Status updates (local session logs via `session-log.sh` Stop hook)

## Recovery: if compaction has already fired

If you realize learnings were generated pre-compaction and never captured:

1. Scan the summary + remaining context for traces
2. Surface candidates to the operator: "I have N learning candidates from earlier in this session, want me to commit?"
3. Let the operator confirm before writing, do NOT speculate from compressed memory

## Failure mode: batched-to-session-end

If you wait for session-end to capture, you will lose ~60-80% of the signal in long sessions to compaction. Treat session-end as a backstop, not the primary capture moment.

## The standard

The distill is the asset. The session is the labor. Capture continuously.
