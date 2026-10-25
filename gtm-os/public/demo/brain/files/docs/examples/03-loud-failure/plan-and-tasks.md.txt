# Plan and tasks: loud failure

## Approach

1. Build the register first, because the count is the baseline and the proof of progress.
2. Build the write-time gate with a test file of planted violations per language and per class.
3. Clean the governed lanes before the rest: consent and contact paths first.
4. Add the process census and the five-minute supervisor tree for long jobs and delegated agents.
5. Fix the class, not the instance: each fix removes a pattern, not one line.

## Tasks

- [ ] Task 01 Register scanner: classify by component taxonomy, severity, language, owner; emit counts
- [ ] Task 02 Planted-violation tests: one per class per language; the scanner finds every one
- [ ] Task 03 Write-time gate (Write and Edit) quoting the rule; test that reformatting does not satisfy it
- [ ] Task 04 Exemption marker with required reason; count exemptions separately
- [ ] Task 05 Clean the consent and contact-permission lane to zero
- [ ] Task 06 Clean the data-pull lanes (transfer, lookup, call classes)
- [ ] Task 07 Process census: orphan, stalled, spinning, over-budget, death-loop rows; peer watch between hosts
- [ ] Task 08 Supervisor decision tree with declared budgets for every long task
- [ ] Task 09 Detached-process gate: no background launches that outlive the session
- [ ] Task 10 Handoff SOP and a training module proposal

## Gates

- G1: the register finds every planted violation. CHECK: run it on the planted set. EXPECT: all detected, none missed.
- G2: a planted stall is reported. CHECK: start a consumer on a signal that never arrives. EXPECT: a STALLED row within one cycle.
- G3: governed lanes at zero un-exempted rows. CHECK: the register filtered to those lanes. EXPECT: 0.
