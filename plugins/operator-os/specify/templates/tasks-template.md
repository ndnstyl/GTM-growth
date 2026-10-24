# Tasks: [FEATURE NAME]

**Input**: spec.md and plan.md in `specs/[NNN]-[feature-name]/`
**Tests**: include test tasks when the spec asks for them, and always for anything touching money, consent, or a platform write.

## Format: `- [ ] T### [P?] [Story] Description with absolute file path`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: which user story the task serves (US1, US2). Setup, foundational and polish tasks carry none.
- Use absolute paths.

## Delegation

Tasks are unassigned by default. When one is delegated, name the agent seat (researcher, implementer, reviewer, and so on), open the delegation with `[task_type=X]`, and state the budget: expected deliverable, expected duration, and the token ceiling at which the agent stops and reports. Tasks that need a human are marked in the task text: workflow testing and activation, outward sends, payments, production deploys, database migrations, platform writes.

## Phase 1: Setup

- [ ] Task 01 Create the structure per the plan
- [ ] Task 02 Add the pass/fail ledger (gates file) for this kit before real work starts

## Phase 2: Foundation (blocks every story)

- [ ] Task 03 [what every story depends on]

Checkpoint: foundation proven by its check, not by a claim.

## Phase 3: Story 1 (P1), the MVP

- [ ] Task 04 [P] [US1] Test for [behavior] in /absolute/path
- [ ] Task 05 [US1] Implement [behavior] in /absolute/path
- [ ] Task 06 [US1] Failure path: [what raises, what is refused, who sees the alert]

Checkpoint: Story 1 works alone and its independent test passes.

## Phase 4: Story 2 (P2)

- [ ] Task 07 [US2] ...

## Final phase: Polish and handoff

- [ ] Task NN Write the handoff SOP (manual today, automation today, what is being built)
- [ ] Task NN Schedule the walkthrough with the owner and put the date on the card
- [ ] Task NN Update the status card and add one changelog line

## Dependencies

Setup, then Foundation, then stories in priority order. Within a story: tests, then models, then services, then surfaces.
