---
name: task-observer
description: >
  Runs for the whole duration of any task-oriented session (tool use, multi-step work,
  deliverables). Watches for signals that a skill should be created, improved or simplified, and
  logs them without interrupting the work. Also triggers on explicit mentions of skill
  observations, the observation log, or a skill-improvement review. Load once at session start,
  not on first mention.
---

# Task Observer: continuous skill discovery and improvement

Adapted from **task-observer ("One Skill to Rule Them All")** by Eoghan Henn, [rebelytics.com](https://rebelytics.com), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Canonical source: https://github.com/rebelytics/one-skill-to-rule-them-all. This version is rewritten and re-scoped for a Claude Code project: the paths, the default taxonomy and the review lane are changed, and it is condensed. The mechanics (numbering discipline, log-write safety, staging-only edits) are the load-bearing rules the source proved out, credited here rather than copied verbatim.

Skills improve best from friction noticed during real work, not from a separate "let's go improve a skill" session. This skill formalizes that noticing so it survives past the session that produced it.

## Where this lives in your project

- Log: `.claude/skill-observations/log.md`
- Cross-cutting principles: `.claude/skill-observations/cross-cutting-principles.md`
- Last review timestamp: `.claude/skill-observations/last-review-date.txt`
- Archive: `.claude/skill-observations/archive/log-[YYYY-MM-DD].md`
- Staged (not yet installed) skill edits: `.claude/skill-observations/skill-updates/[date]/[skill-name]/`

Anchor these on the project root, not a worktree or ephemeral clone. If you are running inside one, warn before writing and re-anchor first.

## Boundary with the vault

This log is scoped to **skill and methodology files**: SKILL.md content, agent definitions, rule files. Domain, business and operations learnings go to the vault under the learning-capture rule. When a signal is genuinely both, log it here for the skill-file side and let the learning-capture triggers handle the vault side.

## Session start protocol

1. If the log or principles file does not exist, create them. Create `last-review-date.txt` with the literal value `never`; never write a real date at setup, because a date means a review actually ran.
2. Scan OPEN observations and active principles; hold them in awareness, do not surface them unprompted.
3. If the last review is `never` or over 7 days old AND there are OPEN observations, offer the review in one line and proceed with the actual task unless the operator opts in. Never gate work on this.
4. Note the log's modification time. If it changed in the last few hours, another session may be writing to it: re-read before every append, never trust a remembered "current number".

## When to observe

The whole session: execution, post-task feedback and methodology discussion. User feedback in review phases is often the highest-signal input. Inactive only for casual conversation and quick factual questions with no tools or deliverables.

## What to watch for

- **New-skill signal:** a reusable multi-step workflow no skill covers; a methodology the user explains that nothing captures; a recurring task with the same shape; the user describing a settled process ("I always do it this way").
- **Improve-existing-skill signal:** the agent violates a documented rule (the skill needs enforcement, not louder wording); a correction reveals a missing rule or edge case; a better workflow emerges; an undocumented use case; a correction that generalizes beyond one session.
- **Simplify signal:** a section never relevant across many sessions; a rule from one unvalidated observation; a workflow users consistently shortcut; contradictory rules; a rule the agent keeps failing to follow (convert it to a structural check or drop it). Ask "what can we remove" as deliberately as "what should we add".
- **Do NOT log:** one-off corrections that do not generalize; preferences already captured; tool bugs unrelated to methodology.

## How to log

Append **silently, same turn or next**. Never batch mentally for later. The write is the enforcement mechanism.

- **Checkpoint after every third completed todo:** write either the pending observations or an explicit `no observations` marker.
- **Deliverable-event flush:** whenever you present a finished deliverable, flush pending observations first, piggybacking on a tool call you are already making.

**Numbering discipline, every append:**

1. Find the highest existing number in the file itself, never from session memory.
2. Immediately before appending, confirm your number does not already exist. If it does, increment past all existing numbers and log a meta-observation: that signals a parallel-session collision.
3. After appending, count occurrences of your number; if more than one, a parallel writer collided, so renumber your entry to max+1.

**Log-write safety: never let a mutation span entry boundaries.** The log is shared state across concurrent sessions. A greedy pattern over the whole file can silently swallow everything from one match to the end. When mutating the log programmatically (status changes, archival, renumbering):

1. Re-read the live log immediately before any write-back and merge in anything new; never write back a stale snapshot.
2. Isolate the target entry (split on the `### Observation N:` headers and edit one chunk) or use a strictly line-anchored substitution. Never a multi-line greedy pattern across the whole file.
3. Assert a structural invariant: count the headers before and after. Unchanged for a status-only edit, changed by exactly the expected amount for an append or archive. Fail loudly if it is off.
4. Keep a pre-write backup.
5. After writing, confirm every entry number this session wrote still exists exactly once.

**Format:** always `### Observation NNN:`, appended to the end, never mid-file. The first field of every new entry is `**Status:** OPEN`; a statusless entry is invisible to a status-filtered review.

```markdown
### Observation [N]: [Short descriptive title]

**Status:** OPEN
**Date:** [date]
**Session context:** [what was being worked on]
**Skill:** [existing skill name, or "New skill candidate: [working name]"]
**Phase/Area:** [which part of the skill or workflow]

**Issue:** [What happened, specific enough to understand weeks later without the conversation.]

**Suggested improvement:** [Concrete change: the section or rule for an existing skill; scope and key components for a new one.]

**Principle:** [The generalizable takeaway. The most important field.]
```

If an observation depends on session-local evidence (a transcript excerpt, a specific output), save it to a file first and add a **Reference file:** line. An observation whose evidence dies with the session is incomplete.

Cite an observation number only from its literal header line; a grep line number is not an id.

## Taxonomy

Default every observation to **internal** (your own business system) unless the skill is one you vendor or intend to share. Mark shared skills explicitly so a review treats them with the upstream's licence in mind.

## Archival on write

On every log write, first move entries resolved before today (`ACTIONED (date)` or `DECLINED (date)`) to the archive file, keeping the log header there too. Entries resolved today stay until tomorrow. Archival is read, filter, rewrite: the highest-risk mutation this file undergoes, so follow the full log-write safety sequence, and verify the post-write count equals pre-write minus exactly what was archived.

## Surfacing protocol

Default: end of session, as a grouped summary: improvements grouped by skill, new-skill candidates listed separately, one sentence each plus a suggested type. Surface earlier only when an observation needs input to be complete or a skill is producing wrong output right now. Default to log-and-defer; once the operator shows a standing preference to defer, stop asking.

## Acting on observations

Act only in three contexts: (1) a comprehensive review (weekly, scheduled, or the 7-day fallback); (2) an explicit request ("update X skill", "act on observation N"); (3) an in-session correction when a skill is producing wrong output right now. Otherwise: log, do not act.

Small, clearly additive, low-risk changes (a new rule, a clarification, a factual fix) can be applied directly by the main loop. Substantial changes (restructuring, a new skill) are staged under `skill-updates/` and reviewed, matching the main-loop-only write pattern: an observation is a draft, not an autonomous write. If an observation's principle applies to skills generally, propose it for the cross-cutting principles file.

## The weekly review (short form)

1. Read OPEN observations; group by skill.
2. For each group decide ACTION, DECLINE or DEFER with a one-line reason; write the decision and date into the entry.
3. Stage any substantial edit; apply any small one.
4. Verify a restructured skill dropped no content (diff the section list before and after).
5. Write the real date to `last-review-date.txt` only after the review ran.

## Quick reference

| Question | Answer |
|---|---|
| When do I observe? | The whole session, including feedback and reflection |
| How do I log? | Silently, immediately, appended to the end, with the numbering discipline |
| When do I surface? | End of session, or earlier only if the observation needs input now |
| Status line? | Mandatory `**Status:** OPEN` as the first field |
| Small fix or substantial? | Additive: apply directly. Restructure or new skill: stage it |
| Rewriting the log? | Backup, re-read live and merge, bounded mutation, verify count, confirm your entries survived |
