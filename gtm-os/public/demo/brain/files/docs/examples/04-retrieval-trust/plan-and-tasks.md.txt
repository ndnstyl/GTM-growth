# Plan and tasks: retrieval trust

## Approach

1. Build the evaluation sets first: 50 answerable questions with the expected note, 20 unanswerable ones. The sets are the definition of done.
2. Make recall involuntary with a prompt-submit hook and a subagent-start hook; test that a subagent in a fresh context gets the titles.
3. Add the tier label and the loud-miss sentence to the answer path.
4. Make every retrieval failure a named error; plant a dead search service and confirm the reply says so.
5. Add per-area maps and a nightly lint for orphans (notes with no map line, no inbound link).

## Tasks

- [ ] Task 01 Evaluation sets: 50 answerable, 20 unanswerable
- [ ] Task 02 Prompt-submit recall hook with a latency budget; log every run
- [ ] Task 03 Subagent-start recall injection (subagents are memory-blind otherwise)
- [ ] Task 04 Tier label on answers; the loud-miss sentence
- [ ] Task 05 Failure classes: index missing, service down, timeout; each a named error
- [ ] Task 06 Dated recall with volatile-fact stamps; contradiction surfacing
- [ ] Task 07 Area maps and the nightly orphan lint
- [ ] Task 08 Run the sets; record the numbers
- [ ] Task 09 Handoff SOP for adding a note so it will be found

## Gates

- G1: answerable-set hit rate at least 90 percent. CHECK: the eval runner. EXPECT: the printed rate.
- G2: unanswerable-set loud-miss rate 100 percent. CHECK: the eval runner. EXPECT: 20 of 20.
- G3: a dead search service is announced. CHECK: stop the service, ask a question. EXPECT: a named error in the reply.
