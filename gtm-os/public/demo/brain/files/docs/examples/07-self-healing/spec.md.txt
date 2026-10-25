# Self-Healing: deterministic remediation bound to health signals (case study: Harbor & Pine Home Services)

**Status**: Built, two rules live | **Created**: 2026-08-02 | **Owner**: Dana Ortiz (fictional)
**Input**: "Health checks must not just be a notification. Build in actionable agents that listen for failures and execute the fix without a human in the loop. Deterministic as much as possible, and only when absolutely necessary given to an agent."

## The problem in one paragraph

The reporting system noticed its own failures in five places (a health tab, a feed-health file, an alert file, the scheduler's log, a status panel) and did nothing about any of them. The people who see the consequences are the call floor and leadership, who cannot read those surfaces and cannot describe a failure accurately when it happens. The failure report that reaches the owner is "the system isn't working". Without a self-correcting layer, the person who built the system becomes its only operator.

On one Tuesday morning eight things were broken at once. Each row states one fault, one remedy class, and whether it is a rule or an owned ask:

| # | What the floor saw | Fault | Class | Rule or ask |
|---|---|---|---|---|
| 1 | Overview page showed one red error | A page component was missing from the local component library | restore a missing file from the local cache | rule |
| 2 | Nothing visible; numbers frozen for two days | A table's month was never stamped, so a safety guard rejected the new month each cycle | seed a missing stamp, with snapshot and reversal | rule |
| 3 | Status panel: engine down, start button failed | The start routine's environment could not find an installed program | repair the environment, then start only the dev processes | rule |
| 4 | One tab three days behind | A weekend run was missed; the gap guard refuses to skip a day and nothing backfills | publish the missing days in order under the target job's lock | rule |
| 5 | Two reference tables nine days behind | Declared weekly, but no weekly schedule existed | none at run time; a missing schedule is a build defect | ask (owner) |
| 6 | Another tab four days behind | Its upstream producer was removed by a deliberate ruling and nothing took over | none; re-enabling reverses a ruling | ask (owner) |
| 7 | 96 failure lines a day in a log | A feed for a terminated vendor was still polled | none at run time; retiring a feed edits a tracked file | ask (owner) |
| 8 | Every target withheld | The goals table was last quarter's | none; a business input | ask (sales lead) |

Four are rules. Four are asks with a named owner, and the system must say so instead of showing a blank or a zero.

## User stories

### Story 1: The system fixes what it recognizes, and proves it (P1)

A known failure signal appears. Within one cycle the system matches it to a rule, checks the rule's preconditions, takes the target's lock, runs the deterministic remedy, re-checks the signal, verifies the fix held, and writes a receipt. If the signal persists, it reverses the remedy and escalates.

**Independent test**: plant fault 2 (an unstamped month). Within one cycle the stamp is seeded, the guard accepts the month, the signal clears, and the receipt shows the snapshot taken first.

### Story 2: What it cannot fix, it says out loud with an owner (P1)

For faults 5 to 8 the status surface shows the plain-English cause, the owner, and what would settle it. It never shows a blank or a zero.

### Story 3: A remedy can never make things worse (P1)

Every remedy declares its preconditions, a snapshot, a reversal, a bound on attempts (one automatic attempt per cause, three per day), and the lock it must hold. A remedy may not edit a tracked file, reverse a ruling, write to a vendor platform, or contact a person.

### Story 4: The rules are data, not code paths (P2)

A rule is a row: signal pattern, preconditions, remedy script, verify check, reversal, owner. Adding one does not touch the engine.

## Requirements

- **REQ-01**: The signal-to-rule match is deterministic; an agent is invoked only when no rule matches and a human has opted a signal class into agent triage.
- **REQ-02**: Remedies run under the same lock as the job they touch.
- **REQ-03**: A remedy that re-checks and still sees the signal is reversed and escalated, never retried silently.
- **REQ-04**: Every run writes a receipt: signal, rule, preconditions seen, actions, verify result, reversal if any.
- **REQ-05**: A remedy is forbidden from editing a tracked file (FR for rows 5 to 8: those are asks).

## Success criteria

- **SC-001**: The four rule faults, replayed, clear without a human in under one cycle each.
- **SC-002**: The four ask faults show an owner and a cause on the status surface, never a blank.
- **SC-003**: Over 30 days, zero remedies reversed because they made a signal worse, and every reversal is explained in its receipt.

## What the case study teaches

Sorting failures into "has a deterministic fix" and "needs an owner" is the whole design. The two lists stay honest because the rule that forbids a remedy from changing a ruling or a tracked file forces every judgment call onto the owned list.
