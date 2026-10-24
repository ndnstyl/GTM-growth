---
name: grill
description: |
  Interview the operator relentlessly about a plan, decision, or idea until every branch of it is
  settled. Frontier-rounds mechanic: each round asks every question whose prerequisites are
  already answered, with a recommended answer per question.

  TRIGGERS - Use this skill when:
  - The operator says "grill me", "stress-test this", "poke holes in this", "/grill"
  - An idea is heading toward a spec kit but is still loose (grill BEFORE writing the spec)
  - A position is owed to a colleague, a client or a vendor and the reasoning has not been pressure-tested
  - A budget, vendor, or architecture call is about to be committed on one pass of thinking

  Do NOT use for: work already specified precisely (go build it), or post-hoc QA of a
  finished deliverable (that is adversarial review).
---

# Grill, frontier-rounds interrogation

> Adapted from Matt Pocock's `grilling` / `grill-me` skills. Tailored: vault
> recall replaces cold questioning, researchers fetch facts, and the output feeds this
> harness's existing lanes (spec, email draft, status board).

Interview the operator until you reach a shared understanding. Map the subject as a **design
tree**: every decision branches into the decisions that hang off it.

## Before round one (this harness's additions)

1. **Recall the vault first.** Run `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-search.py "<topic>" --snippets`
   and check MEMORY.md. A question the vault already answers is not a question; it is a
   recall failure. Fold what you find into your recommended answers, cited as `[[note-name]]`.
2. **Triage silently.** If the subject is a task someone handed the operator, name the verdict
   (CORE / SERVE-AND-HANDOFF / DECLINE) per the `triage` skill before grilling how to do it.
   The best answer to some frontier questions is "this is not yours to answer."
3. **Classify the data tier.** If the subject touches your two most sensitive data tiers, say so up front and
   keep the session inside the data-handling rules.

## The mechanic

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are
already settled: the questions you can ask NOW without guessing at answers you have not
heard yet. Ask the whole frontier in one round, numbered, each with your recommended
answer. Then wait.

Format a round like so:

```
❓ **Q1 - <question title>**: <question body, may include multiple choices>

➡️ <your recommended answer, with the receipt: a vault note, a measured number, or "no evidence either way">

---

❓ **Q2 - ...**
```

Each answered round reshapes the tree: settled decisions push the frontier outward and
unblock questions that depended on them. Recompute the frontier and ask the next round.
A question whose answer depends on another question still open THIS round belongs to a
LATER round.

**Finding facts is your job, never the operator's.** When a frontier question needs a fact from
the environment (a file, a data export, the mailbox, a live config), dispatch a `researcher`
subagent with `[task_type=content_research]` (or read it yourself if trivial). Do not
block the round on it: only the questions downstream of that fact wait; ask the rest of
the frontier now. The **decisions** are the operator's: put each to them and wait.

**Recommended answers are mandatory.** The operator's standing rule is execute-don't-ask; a bare
question violates it, a question with a defended recommendation respects it. Recommend
from evidence, and say when the recommendation is a coin flip.

**Stopping the loop.** The default stop is an empty frontier: no eligible question left
to ask. Optionally, run a second stop condition alongside it: after each round, score
measured ambiguity (how much of the tree is still genuinely open, not just unasked) on a
0-10 scale and state the number in your own recap. If the operator sets a threshold, stop the
loop once the score drops below it even if a few low-stakes leaves remain unvisited, and
say which leaves you left open and why they did not clear the bar. Default is no
threshold, keep going to an empty frontier unless the operator asks for the numeric stop.

## LITE mode

Not every ask needs the full tree. When the subject is small or the operator says "quick", run
ONE round only: max 5 numbered questions, each with a recommended answer, inline A/B/C
options where that is faster than prose. Prioritize in this order, dropping from the
bottom when you are out of questions: scope, then format, then audience, then
constraints. Skip the frontier mechanic entirely, skip "Done" step 1-3 as a separate
message, and go straight to work once the operator answers. If a LITE round surfaces a branch
that genuinely needs the full tree, say so and ask before switching modes.

## Grillable and ungrillable

Some questions cannot be answered by talking. "How should this feel?" and "which layout?"
need something to react to. When you hit one, say so, park it, and propose the cheapest
artifact that would settle it (a prototype, a one-page mock, a 10-row sample pull).
Talking through an ungrillable question is where sessions balloon.

"I don't know" is a real answer. Record it as an open item with who/what would settle it,
the same shape as a `NO ACTION YET` compass entry. Never fill it with a guess.

## Done

The session ends when the loop above stops, frontier empty, or ambiguity score under
threshold if the operator set one. Before finalizing, run one more check, then close out in one
message:

1. **Scope check.** Look at the settled tree as a whole and ask whether it is actually
   one spec. Split it along SPIDR-style dimensions, Spike (an unknown that needs a
   research pass before anything else), Path (a distinct user/data flow), Interface (a
   distinct surface: API, UI, report), Data (a distinct schema or dataset), Rules (a
   distinct policy/compliance layer), and say plainly if two or more of those dimensions
   are tangled into what was framed as one ask. If it should split, say so and propose
   the boundary before handing off; do not silently proceed with one oversized spec.
2. **The settled tree** in brief: each decision and its one-line rationale.
3. **The open items**: each with what would settle it, who, and by when.
4. **The handoff**: route to the lane the result belongs in, and ask before acting:
   - a build → a spec (same conversation; the context IS the value)
   - a position/email → your email-draft and voice tooling, if you have them
   - a ruling worth keeping → vault capture per rules/learning-capture.md
   - a status change → update your status board

Do not act on the outcome until the operator confirms the shared understanding is real.

## It is working if

- The operator disagrees with at least one recommendation. A session with zero pushback was a
  session they did not need.
- Later rounds visibly build on earlier answers.
- The session surfaces a decision they were making implicitly.
- At the end he could defend every choice to someone who was not there.
