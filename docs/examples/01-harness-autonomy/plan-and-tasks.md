# Plan and tasks: harness autonomy

## Approach

1. Replay the real session first and count every ask. The count is the baseline (five asks for one approved piece of work).
2. Change the gate's matcher from "text contains the tool name" to "the tool is invoked at command position". Prove it with a planted-violation test set in both directions: writes that must be refused, and reads whose text names a gated tool that must pass.
3. Add lane approvals: gate id, platform, environment, window, use budget. The approval is a file minted by the owner's own command; the gate verifies it against a log row so a hand-written file is a forgery.
4. Add a human-touch inventory per box; the move checklist is generated from it, not typed.
5. Put a timeout on every remote call in the ops scripts and test it against a deliberately dead host.

## Tasks

- [ ] Task 01 Replay the clean-up session; record each ask and its cause as the baseline
- [ ] Task 02 Planted-violation test set: 12 writes that must be refused, 40 reads and edits that must pass
- [ ] Task 03 Rewrite the matcher to key on invocation; run Task 02 red then green
- [ ] Task 04 Lane approvals with window and budget; mint script run by the owner only
- [ ] Task 05 Audit row per use; a report that lists remaining budget per lane
- [ ] Task 06 Human-touch inventory and the generated move checklist
- [ ] Task 07 Timeout wrapper for remote calls; test against a dead host
- [ ] Task 08 Replay the session again; the owner is asked once
- [ ] Task 09 Handoff SOP and walkthrough scheduled with the operations lead

## Gates

- G1: replay asks the owner exactly once. CHECK: the replay harness prints the ask count. EXPECT: 1.
- G2: a write on another platform in the same session is refused. CHECK: planted write. EXPECT: exit 2 naming the lane.
- G3: the move checklist lists the disk unlock. CHECK: grep the generated file. EXPECT: one line with an owner.
