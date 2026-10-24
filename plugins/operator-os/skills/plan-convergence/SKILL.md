---
name: plan-convergence
description: |
  Optional adversarial-review gate for a finished plan.md, run after speckit.plan and
  before speckit.tasks. Dispatches 2-3 independent reviewer subagents in parallel, each
  through a distinct critical lens, then replans against HIGH-severity findings and
  re-reviews until the plan converges (no open HIGH findings) or a round cap hits.

  TRIGGERS - Use this skill when:
  - The operator explicitly says "run plan-convergence", "/plan-convergence", or "stress-test this
    plan" after a plan.md exists
  - A plan carries unusually high stakes (migration, new agent seat, consumer-facing
    automation, anything touching T0/T1 data) and the operator wants adversarial review before
    speckit.tasks

  Do NOT use automatically on every spec kit, this is opt-in, invoked explicitly, never
  auto-inserted into the speckit.plan → speckit.tasks handoff. Do NOT use on a plan that
  is still loose (grill first) or on already-implemented work (an adversarial review instead).
---

# Plan Convergence, adversarial review before task breakdown

> Adopted 2026-08-26 from the GSD-core evaluation (`.claude/skill-observations/log.md`,
> Observation 4): a plan that is internally consistent can still be wrong, and catching
> that before task-breakdown is far cheaper than catching it after implementation.
> `speckit.analyze` checks plan/spec/tasks consistency; this skill checks whether the
> plan itself is *sound*. The two are complementary, not redundant.

## Scope and when this runs

This is a **gate you invoke**, not a step spec-kit runs for you. Every spec still gets
`speckit.plan` → (optionally, this) → `speckit.tasks`. Skipping this skill is always
valid; nothing downstream checks whether it ran.

Preconditions: `specs/<NNN>-<slug>/plan.md` exists and is the operator-approved as a plan (not a
draft still being grilled). If plan.md does not exist yet, stop and point back to
`speckit.plan`.

## The loop

### Round setup

Pick 2-3 **distinct critical lenses**, chosen for what the plan actually touches (do not
run all three by default if one lens is clearly irrelevant):

- **Feasibility**, can this actually be built with the stated tools/access/timeline; are
  there load-bearing assumptions about APIs, credentials, or data that do not hold.
- **Risk**, what breaks in production, what's the blast radius, what's irreversible,
  what's the security/compliance exposure (route T0/T1 or consumer-touch findings through
  `data-handling.md` / `opsec-gate.md` framing).
- **Completeness**, does the plan cover every requirement in spec.md, every edge case
  implied by it, every dependency between its own steps; what did it silently drop.

A fourth lens (e.g. cost, reversibility) is fine if the plan warrants it, pick lenses by
relevance, not by habit.

### Dispatch (parallel, one Agent call per lens)

Dispatch all chosen lenses **in the same response**, one `Agent` tool call per lens, each
tagged `[task_type=code_review]` (or `security_audit` for the risk lens on T0/T1-touching
plans). Each subagent gets:

- The plan file path and the spec it implements (paths only, let it read, per
  prompt-engineering.md's context-dumping anti-pattern).
- Its assigned lens, stated explicitly, and an instruction to review ONLY through that
  lens, do not let a feasibility reviewer wander into completeness commentary.
- The required output shape: a list of findings, each tagged `HIGH` / `MEDIUM` / `LOW`
  severity, with the specific plan section it concerns and why it's wrong (not just "this
  seems risky", a falsifiable claim about what breaks and how).
- Explicit independence: each lens reviews the plan cold, not the other lenses' output.
  Do not let one subagent see another's findings mid-round, that is convergence theater,
  not independent review.

### Severity gate

Only **HIGH** severity findings block. MEDIUM and LOW findings get logged in the round
summary but never stop the loop, they're worth a look during implementation, not worth
a replan cycle. Do not let a reviewer's tone or confidence substitute for the stated
severity; hold every subagent to naming HIGH explicitly, not implying it.

### Replan

If any lens returned a HIGH finding: update plan.md to resolve it (edit the plan itself,
not a side note), then re-run the SAME set of lenses against the revised plan as the next
round. A finding resolved in round N is not re-litigated in round N+1 unless the fix
introduced a new problem, say so if a reviewer flags that.

### Stop conditions

Stop when either hits first:

1. **Converged**, the latest round returns zero HIGH findings across all lenses.
2. **Round cap**, 3 rounds completed (default; state the cap up front, adjustable if
   the operator sets one explicitly). If the cap hits with HIGH findings still open, do NOT
   silently ship the plan, report the unresolved HIGH findings to the operator as open items,
   same shape as a `grill` "I don't know" entry: what's unresolved, why round 3 couldn't
   close it, and what would settle it. The operator decides whether to proceed, extend the cap,
   or send the plan back to `grill`/`speckit.clarify`.

## Report shape (every round)

```
### Round N, lenses: <feasibility|risk|completeness|...>

**<lens>**: N findings, H:<n> M:<n> L:<n>
- HIGH: <finding, plan section, why>
- MEDIUM: <finding>
...

**Verdict**: CONVERGED | REPLANNING | CAP HIT, <n> HIGH open
```

## It is working if

- At least one round surfaces a real HIGH finding, a round with zero findings on round 1
  either means a genuinely tight plan or lenses that weren't adversarial enough; say
  which it looks like.
- The three lenses disagree with each other at least once, identical findings across
  lenses is a sign they weren't actually independent.
- Convergence changes the plan's text, not just its confidence.
