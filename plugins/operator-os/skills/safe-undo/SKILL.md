---
name: safe-undo
description: Confirmation-gated revert of exactly one spec's own commits. Cross-checks a spec's tasks.md against git log to identify which commits belong to that spec, then reverts only those via git revert, never a reset, checkout, or blanket rewrite. Use when a spec's work shipped wrong and needs undoing without touching anything else on the tree.
triggers:
  - "undo spec"
  - "revert this spec"
  - "roll back spec"
  - "undo the commits for spec"
  - "/safe-undo"
---

# Safe Undo, scoped revert of one spec's commits

## Governing rules (do not restate, defer to these)

This skill operates entirely inside the repo's existing git-safety rules. It
does not add new permissions and never overrides them:

- `.claude/rules/security.md` rule 3, no `rebase`, `pull`, `checkout`,
  `restore`, `stash`, `reset`, `clean`, `merge`, or `add -A` anywhere under
  this repo or any embedded repo.
- the git rule in `rules/security.md`, same ban list; allowed:
  `status`, `diff`, `log`, `show`, `add <explicit paths>`,
  `commit <explicit paths>` (never a bare `git commit`). A dirty tree or
  conflict is reported, never resolved by rewriting the tree.

`git revert` is not on either ban list, it adds new commits rather than
rewriting history, which is why this skill uses it exclusively. If a revert
produces a conflict, stop and report it per the rules above; do not resolve
it with any banned command.

## What this skill does NOT do

- Never runs `git reset --hard`, `git checkout <commit>`, or any history
  rewrite.
- Never touches commits outside the identified spec's set, even ones that
  touch the same files.
- Never runs a revert without explicit user confirmation of the exact commit
  list. This is not an autonomous-execution skill, treat every revert as a
  destructive action pending sign-off, the same posture the "Autonomy
  Boundary" rule in this repo takes toward destructive ops generally.

## Procedure

### 1. Identify the spec

Ask for or confirm the spec directory, e.g. `specs/012-checkout-redesign/`.
Read its `tasks.md`.

### 2. Build the candidate commit set

Run (read-only, all allowed under the rules above):

```
git log --oneline --all -- specs/<spec-dir>/
```

Cross-check against `tasks.md`:
- Match commit subjects/bodies against task IDs (e.g. `T-17`, `ADV-4`) and
  the spec number itself (commits in this repo are conventionally prefixed
  `<spec-number>: ...`, per recent log entries).
- Also run `git log --oneline --all -- <files tasks.md names as touched>`
  for any implementation paths outside `specs/` that the tasks reference, so
  edits to app code tied to this spec are not missed.
- Discard any commit that also touches unrelated specs or shared
  infrastructure files as a side effect, flag those separately, do not fold
  them into the revert set silently.

### 3. Present the candidate set for confirmation

Show the user, before running anything:
- The exact commit hashes, in chronological order (oldest first, this is
  the order `git revert` needs, since reverts must undo child before parent
  when there are dependencies).
- The task ID or task title each commit maps to.
- Any commit excluded as ambiguous (touches this spec and something else),
  with a one-line reason.
- The exact command that will run.

**Stop here. Do not proceed without an explicit yes.** A "looks right" or
silence is not confirmation, require an explicit go-ahead naming the commit
range or count.

### 4. Run the revert (only after confirmation)

```
git revert --no-commit <hash1> <hash2> ... <hashN>
git status
git diff --staged
```

`--no-commit`, oldest-first, lets you inspect the combined diff before
committing and stop cleanly on a conflict. Confirm the staged diff only
removes the identified spec's changes, then commit with explicit paths per
the repo's convention (never a bare `git commit`):

```
git commit <explicit changed paths> -m "<message>"
```

On a mid-revert conflict: stop, report the conflicting file(s)/commit(s),
let the user decide, never resolve with `checkout`, `reset`, or any banned
command. `git revert --abort` is safe to offer since it only unwinds the
in-progress revert, not prior history.

### 5. After the revert

- Report the new commit hash(es) and which task IDs they undo.
- Note in the spec's own tracking (tasks.md or its receipts, per this repo's
  spec-kit convention) that the listed tasks were reverted, with the date
  and the revert commit hash, so the spec's record stays accurate.
- Do not update the vault or board; that is main-loop-only per
  the project rules, hand the finding back for that.

## Anti-patterns (NEVER)

- Never widen the commit set to "everything since date X", scope is by
  spec identity (tasks.md cross-reference), never by time window.
- Never run the revert commands before the user has confirmed the exact
  hash list.
- Never fall back to `reset --hard` or `checkout` if a revert conflicts;
  report and wait.
- Never bundle an ambiguous (multi-spec) commit into the revert set without
  calling it out explicitly first.
