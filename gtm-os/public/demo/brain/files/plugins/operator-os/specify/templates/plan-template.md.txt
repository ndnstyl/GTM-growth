# Implementation Plan: [FEATURE]

**Kit folder**: `specs/[NNN]-[feature-name]/` | **Date**: [DATE] | **Spec**: spec.md

## Summary

[The primary requirement and the approach, in five sentences.]

## Technical context

**Language and runtime**: [versions]
**Dependencies**: [existing only, or each new one with its licence and why]
**Storage**: [database, files, or none]
**Testing**: [framework and the command that runs it]
**Target environment**: [where it runs; which host is production]
**Constraints**: [latency, cost, rate limits, data tier walls]
**Scale**: [volumes]

## Constitution check

Answer each before research; re-check after design. A "no" needs an entry in Complexity tracking.

- [ ] Every failure path ends in a raised error, a visible refused state, or an alert row
- [ ] No platform write outside the write gate; no vendor call outside the governor
- [ ] Data tiers named; nothing above T2 reaches a consumer AI tool
- [ ] Structured numbers come from a warehouse query, not from reasoning
- [ ] A handoff SOP is a task in this plan
- [ ] `owned_paths` do not collide with another active kit

## Project structure

```text
specs/[NNN]-[feature]/
  spec.md
  plan.md          (this file)
  research.md      decisions and rejected alternatives, each with the evidence
  data-model.md    entities, grain, keys
  contracts/       interface contracts
  quickstart.md    the five-minute proof that it works
  tasks.md         the breakdown
```

Source layout: [the real directories this feature touches, as absolute paths]

## Verification plan

For each requirement, the command that goes red if it is not true, and what it must print. A check that cannot fail proves nothing; add a positive control beside every absence claim.

## Complexity tracking

Fill only if the constitution check has violations that must be justified.

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| | | |
