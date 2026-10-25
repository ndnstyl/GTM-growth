# Harness Autonomy Hardening (case study: Harbor & Pine Home Services)

**Status**: Built | **Created**: 2026-03-02 | **Owner**: Dana Ortiz, owner-operator (fictional)
**Input**: "I am answering every question. If we need more guardrails and better hooks, engineer them. Else run toward the goal."

## The problem in one paragraph

Harbor & Pine's harness had every piece of autonomy (hooks, gates, receipts, specialist agents, a status board) but each piece was built for one moment: one approval per write, one check per command. Run end to end toward a goal they became a stream of questions. During a workflow clean-up, the write gate stopped the same approved change five times. It also stopped file edits and searches whose text merely contained the name of a gated tool. A move plan promised "runs unattended" and then needed a keyboard, a phone and two browser clicks nobody had listed. The owner's day was spent answering.

## User stories

### Story 1: One approval per goal, not per write (P1)

The owner approves a body of work once ("today's workflow clean-up on the office server") and the agent completes every write inside that lane. Every write is still logged, and still refused outside the lane or after the window closes.

**Independent test**: replay the clean-up session against the new gate: one approval minted, then a deploy, two switch-offs, three deletions and one re-deploy all pass; a CRM write in the same session is still refused; the audit log has one line per use.

**Acceptance**:
1. **Given** a lane approval for "workflow server, office" with a 4-hour window, **When** the agent deploys, switches two off and deletes three, **Then** none asks the owner, each is logged with lane, time and subject, and the remaining budget is visible.
2. **Given** that approval, **When** the agent attempts a write on a different platform, **Then** the gate refuses and names the missing lane.
3. **Given** the window has passed, **When** the next write is attempted, **Then** the gate refuses, names the expired approval, and the agent stops at a named gate instead of retrying.
4. **Given** no approval, **When** the agent runs a read, an edit, a search, or a commit whose text contains a gated tool's name, **Then** nothing is refused, because the gate keys on the tool's invocation, not on words.

### Story 2: Every human touch is named before the move (P1)

Before any move or cutover, the plan lists each step a person must perform, who, what they need in hand, and what the agent can verify remotely afterward. Nothing is called "unattended" if it needs a hand.

**Independent test**: generate the checklist for the current equipment and confirm it names the disk unlock, the router join and the remote-access re-approval, each with an owner and a remote check; removing disk encryption from the inventory removes the unlock step.

### Story 3: A remote call that stops answering fails fast (P2)

An ops script calling a box that has stopped answering fails within a named number of seconds with the reason, never hangs.

## Requirements

- **REQ-01**: Approvals are scoped to a lane (platform plus environment), carry a window and a use budget, and are minted only by the owner.
- **REQ-02**: The gate matches the invocation of a gated tool (the command at command position, or the tool name), never a word inside a message, commit text or search pattern.
- **REQ-03**: Every use of an approval appends one audit row.
- **REQ-04**: A plan cannot claim "unattended" for a step the inventory marks as needing a person.
- **REQ-05**: Every remote call carries its own timeout and ends in a named error.

## Success criteria

- **SC-001**: In the replayed session the owner is asked once, not five times.
- **SC-002**: Zero false refusals on the 40 read-only commands in the replay set; zero missed refusals on the 12 planted writes.
- **SC-003**: The move checklist names every hands-on step found in a dry run.

## What the case study teaches

The fix is not "ask less". It is to move the question to the one moment it belongs, the start of the goal, and to make the gate precise enough that a word in a sentence can never trigger it. Precision is what makes autonomy safe.
