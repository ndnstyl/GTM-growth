# Feature Specification: [FEATURE NAME]

**Kit folder**: `specs/[NNN]-[feature-name]/`
**Created**: [DATE]
**Status**: Draft | Active | Complete
**Owner**: [the person who owns the outcome]
**owned_paths**: [files and folders this kit may modify; another active kit may not touch them]

## The outcome, in one paragraph

[What changes for the operator or the customer when this ships, in plain words. Sell the destination, not the mechanism.]

## User scenarios and testing *(mandatory)*

Order stories by importance. Each story must be independently testable: ship only one and you still have something of value.

### Story 1: [Brief title] (Priority: P1)

[The journey in plain language.]

**Why this priority**: [the value]
**Independent test**: [how to prove this story alone works and delivers value]

**Acceptance scenarios**:
1. **Given** [state], **When** [action], **Then** [outcome]
2. **Given** [state], **When** [action], **Then** [outcome]

### Story 2: [Brief title] (Priority: P2)

[...]

### Edge cases

- What happens when [boundary condition]?
- What happens when [the dependency is down, the input is empty, the input is huge]?
- Which failure path ends in a raised error, a visible refused state, or an alert row? (Name each one; none may end silently.)

## Requirements *(mandatory)*

- **REQ-01**: The system MUST [specific, testable capability]
- **REQ-02**: The system MUST [...]
- **REQ-03**: [NEEDS CLARIFICATION: mark anything unknown instead of guessing]

### Key entities *(if data is involved)*

- **[Entity]**: [what it represents, its grain, its owner]

## Data and boundaries

- Data tier of every input (see the data-handling rule): [T0 | T1 | T2 | T3]
- Platform writes this kit performs, each behind the write gate: [none | list]
- Vendor API calls, each with a governor registry row: [none | list]

## Success criteria *(mandatory)*

Measurable, technology-agnostic.

- **SC-001**: [metric a person can check]
- **SC-002**: [metric]

## Definition of done

- [ ] Every acceptance scenario passes
- [ ] The pass/fail ledger (gates file) is fully evidenced
- [ ] The handoff SOP exists, in three parts (manual today, automation today, what is being built)
- [ ] The status card is updated and the changelog has one line
