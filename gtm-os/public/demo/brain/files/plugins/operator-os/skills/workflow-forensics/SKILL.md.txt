---
name: workflow-forensics
description: |
  Read-only forensic status check on a spec-kit directory. Given a spec directory under
  specs/, reads its own artifacts (tasks.md, receipts/, git log) and reports whether it is
  actually stalled or abandoned, with a citation (file path or commit SHA) for every claim.
  Never edits code, never touches tasks.md, never opens a fix.

  TRIGGERS - Use this skill when:
  - The operator asks "is spec NNN dead/stalled/abandoned" or "what's the real status of spec NNN"
  - A spec has had no visible activity and someone needs the evidence, not a guess
  - Before reviving old work: confirm what actually shipped vs. what tasks.md claims
  - Do NOT use for code-behavior bugs, that is `diagnose`. This skill diagnoses the
    WORKFLOW (did the work happen, is it recorded, is it wired), not the code.
---

# Workflow Forensics, evidence-grounded spec status, no fixes

> Companion to `diagnose` (code/behavior) and `speckit.analyze` (spec/plan/tasks internal
> consistency). This skill's job: given a finished-looking or long-quiet spec, tell the operator
> what its own paper trail actually proves, nothing more, nothing inferred.

## What this is not

- Not a fixer. You do not edit `tasks.md`, write a receipt, open a branch, or touch code.
- Not a guess. Every claim in the report cites a file path, line, or commit SHA the reader
  can go check themselves. "Looks stalled" is not a finding; "the migration task has no receipt file and
  no commit after 2026-08-10 touches its listed paths" is.
- Not a re-review of task quality. You are not grading whether the work was done well, only whether the record shows it was done, recorded, and connected to the rest of the spec.

## Inputs (read-only)

1. `specs/<NNN-slug>/spec.md`, `plan.md`, `tasks.md`, the stated intent and task list.
2. `specs/<NNN-slug>/receipts/`, the evidence directory, if one exists. Absence of the
   directory itself is a finding, not an error.
3. `git log --all --oneline -- specs/<NNN-slug>/` and, for any code paths tasks.md names,
   `git log --oneline -- <path>`, commit history scoped to the spec's own footprint.
4. `git log -1 --format=%ci -- specs/<NNN-slug>/tasks.md`, last time the task list itself moved.
5. Branch state: `git branch --all | grep <NNN>`, does a branch exist, is it merged
   (`git branch --merged main`), does it still have commits `main` lacks.

Do not read application code to assess correctness, that scope belongs to `diagnose` or
`speckit.analyze`. You may open a file only to confirm a receipt/commit's claimed path exists.

## Procedure

### 1. Load the stated plan
Read `tasks.md`. List every task ID with its status marker (this repo's convention: ⬜ open,
🔒 blocked, 👤 the operator-only, or a checked/struck marker for done, confirm the legend at the top
of the file, conventions vary by spec). Note which tasks claim completion.

### 2. Cross-check each "done" task against a receipt
For every task marked done: does `receipts/` contain a file naming that task ID? If yes,
open it, does it name concrete evidence (a command run, an output, a commit SHA), or is it
a restated intention with no proof? If no receipt file exists for a done-marked task, that
is an **orphaned task**, cite the task ID and the fact that `receipts/` has no matching file.

### 3. Cross-check each receipt against git
For every receipt that names a commit SHA or file path: does `git show <sha>` resolve on
this repo, and does the commit actually touch the paths the task claims? A receipt citing a
SHA that doesn't exist, or a commit that touches unrelated files, is a **false receipt**, name it exactly.

### 4. Establish the timeline
Pull the last commit date touching `specs/<NNN>/` and the last commit date touching any code
path tasks.md names. Compare both to today. A gap with no open task actively blocked on an
external party (a 👤 marker, a named dependency) is the actual "stalled" signal, state the
gap in days and name the last commit.

### 5. Check the branch
If a feature branch for this spec exists and is unmerged: is it ahead of `main`, behind, or
diverged? An unmerged branch with commits `main` never got is a **dead branch**, name the
branch, the commit count, and the divergence.

### 6. Classify

Report ONE of:
- **ACTIVE**, recent commits within a normal working cadence, tasks and receipts line up.
- **BLOCKED**, stalled but every stalled task cites a named external dependency (a person,
  an access grant, an upstream vendor) still open. Name the blocker and where it's named.
- **STALLED**, no commit activity past a threshold you state (default: 14 days with no
  named blocker), open tasks with no blocker marker.
- **ABANDONED**, stalled AND a dead/orphaned branch AND/OR tasks marked done with no
  corroborating receipt or commit, i.e., the record itself doesn't hold together.

Never claim a stronger verdict than the evidence supports. If evidence is mixed (some tasks
solid, some orphaned), report the mix, do not average it into a single clean label.

## Output format

```
SPEC: <NNN-slug>
VERDICT: ACTIVE | BLOCKED | STALLED | ABANDONED

TIMELINE:
- last commit touching specs/<NNN>/: <date> (<sha>)
- last commit touching a code path tasks.md names: <date> (<sha>) or "none found"
- branch: <name or "none">, <merged|unmerged, N commits ahead/behind>

FINDINGS (one line each, cited):
- [orphaned task] T0XX marked done, no file in receipts/ matches, <path checked>
- [missing receipt] T0XX marked done, receipts/T0XX-*.md exists but names no verifiable evidence
- [false receipt] T0XX receipt cites <sha>, git show fails / touches unrelated paths
- [dead branch] <branch> has N commits main lacks, last touched <date>
- [named blocker] T0XX 👤/🔒 <dependency>, still open as of <date>

WHAT THE RECORD PROVES: <1-3 sentences, strictly from the findings above>
WHAT IT DOES NOT PROVE: <name the gap, e.g. "no evidence the deployed workflow was ever activated">
```

## Anti-patterns

- Reading application code to judge whether a fix was "good", not this skill's scope.
- Writing a receipt, filling in a missing one, or nudging a task status, read-only, always.
- Treating a spec with no `receipts/` directory as automatically abandoned, some specs
  predate the receipts convention; say so and rely on git alone.
- Rounding "one task looks thin" up to ABANDONED, or rounding real gaps down to keep the
  read positive, the verdict is only as strong as the weakest cited finding.
