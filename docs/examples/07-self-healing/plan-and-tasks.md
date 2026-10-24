# Plan and tasks: self-healing

## Approach

1. Table every current failure signal with its one fault and one remedy class. Anything needing judgment becomes an ask with an owner, immediately.
2. Build the engine to read rules as data: signal pattern, preconditions, remedy, verify, reversal, owner.
3. Ship two rules first (restore a missing file; seed a missing stamp) and let them run for a week before adding more.
4. Add the status surface for asks: cause, owner, what would settle it.
5. Add the escalation path: a persisting signal reverses the remedy and files an alert row.

## Tasks

- [ ] Task 01 Signal inventory: eight faults, class, rule or ask
- [ ] Task 02 Rule schema and loader; reject a rule with no reversal
- [ ] Task 03 Engine: match, preconditions, lock, snapshot, remedy, re-check, receipt
- [ ] Task 04 Attempt bounds: one per cause, three per day, then stop and report
- [ ] Task 05 Rule 1: restore a missing component from the local cache
- [ ] Task 06 Rule 2: seed a missing month stamp, with snapshot and reversal
- [ ] Task 07 Planted-fault tests for each rule, including one where the remedy fails and is reversed
- [ ] Task 08 Status surface for owned asks
- [ ] Task 09 Forbid tracked-file edits, ruling reversals, platform writes and contact in any remedy (checked at load)
- [ ] Task 10 Handoff SOP: how the operations lead adds a rule

## Gates

- G1: planted unstamped month clears in one cycle. CHECK: plant, wait one cycle, read the receipt. EXPECT: signal cleared, snapshot first.
- G2: a failing remedy is reversed. CHECK: plant a remedy whose verify fails. EXPECT: reversal in the receipt and an alert row.
- G3: a rule that edits a tracked file is rejected at load. CHECK: load one. EXPECT: a named refusal.
