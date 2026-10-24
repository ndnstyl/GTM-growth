# Version Control, CI and the Release Line (case study: Harbor & Pine Home Services)

**Status**: Built | **Created**: 2026-07-14 | **Owner**: Dana Ortiz (fictional)
**Input**: "A real CI/CD pipeline needs to be in full effect. There needs to be version control of the office server and the build, and if we ever need to refactor we need clean branches and versions. The backup drive is the most current snapshot and must stay that way, holding only the latest."

## The problem in one paragraph

Until July the repository had one real line of work: a branch named for a feature that every session committed to and nobody had pushed. The hosted trunk ended at an empty trigger commit. No release had ever been tagged. The office server got its code from a bundle on a backup drive, and the backup drive kept thirty days of sets, so it was doing the version-history job that the hosted repository should have done while the hosted repository did nothing.

## One job per thing

| Thing | Its one job |
|---|---|
| Hosted trunk (`main`) | Every commit that passed the gates; the only source the office server ever pulls from |
| Tags `vX.Y.Z` on the trunk | The releases: what a box runs, what the changelog describes, what a refactor branches from |
| Kit branches (separate worktrees) | Isolated work that must not land half-done: refactors, migrations, risky features, merged by pull request |
| The backup drive | The most current good snapshot of data stores and the vault, exactly one set, never history |

## Rulings that bind this kit

- Explicit-path commits only. No rebase, pull, checkout, restore, stash, reset, clean, merge or add-all on the shared tree, because it carries other sessions' uncommitted work. Branch work that needs a different tree happens in a worktree, never by switching the shared one.
- A push, a branch-protection change, a deploy key, a token, a release page: each is a write outside this machine. Pushes of this repository are authorized; the rest need the owner.
- The owner creates and holds every identity. No agent mints a key or a token.
- The fail-closed secret gate is never bypassed. A refusal means the file changes, not the gate.

## User stories

### Story 1: The trunk is `main` and every session lands on it (P1)

Every session commits to the trunk. A commit passes the local pre-commit gates and the hosted CI gates. The trunk is protected: no force push, no deletion, CI green before a pull request merges.

**Independent test**: the symbolic ref on the laptop reads the trunk; a test commit from any session lands and shows a green check; a force push is refused by the host.

### Story 2: Nothing finished sits uncommitted at the end of a build day (P1)

Two seats own the pipeline. The **committer** finds every finished change, leaves work modified in the last hour alone ("in flight"), refuses credentials, data artifacts and runtime state, and commits by explicit path in coherent per-kit commits with plain-word messages. It never pushes. The **verifier** pushes, reads CI and secret-scan results, and classifies every red.

**Independent test**: leave one finished file, one in-flight file and one planted credential uncommitted; the committer commits the first, skips the second, refuses the third and reports all three.

### Story 3: A red has exactly one owner (P1)

Environmental reds (the runner lacks a tool, a test opens a machine-local path, a step is misordered) belong to the verifier, who fixes the workflow with the reason beside the change. A lane's regression belongs to that lane: the verifier moves the step to a known-red list with the owner and notes the failing assertion on the lane's card; it never edits a suite to pass. A secret-scan hit is allowlisted only when it reads as a fixture or placeholder, with the reason beside the entry; anything that could be a real value is rotated, never allowlisted.

### Story 4: Health is a number (P1)

A health script prints and exits non-zero unless: zero uncommitted finished work, zero unpushed commits, the newest CI gate job green, the newest secret scan green. Known-red is reported, never counted.

### Story 5: Releases cut themselves from the changelog (P2)

Each closed kit adds one line under "Unreleased" naming the kit and its state, never a commit. One command turns that section into the next version, tags it, and cuts the release.

### Story 6: The backup holds one set (P2)

The nightly backup prunes to the single newest verified set; history lives in the repository, not on the drive.

## Requirements

- **REQ-01**: The trunk is protected on the host.
- **REQ-02**: The committer's refusal list is code (path patterns), not a reminder.
- **REQ-03**: The verifier's loop is bounded: four rounds, then a written receipt with what is still red and who owns it.
- **REQ-04**: Every fix is an explicit-path commit; the staged set is verified empty before `add`.
- **REQ-05**: A workflow edit that could not be run locally is pushed with that stated in the commit body.

## Success criteria

- **SC-001**: At the end of any build day the health script exits 0.
- **SC-002**: Over 30 days, zero force pushes, zero bypassed scans, zero secrets in history.
- **SC-003**: Every release tag has a changelog section whose lines each name a kit.

## What the case study teaches

Splitting commit from verify makes each seat small enough to run on a cheap model and impossible to run unsafely: the one that touches files never pushes, and the one that pushes never edits a test.
