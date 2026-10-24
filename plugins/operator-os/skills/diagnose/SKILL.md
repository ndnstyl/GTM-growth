---
name: diagnose
description: |
  Feedback-loop-first discipline for hard bugs and silent failures. Build a tight,
  red-capable check for the exact symptom BEFORE reading code to build a theory; then
  reproduce, minimize, rank falsifiable hypotheses, instrument one variable at a time,
  fix with a regression test, sweep the class, capture the learning.

  TRIGGERS - Use this skill when:
  - The operator says "diagnose", "debug this", "why is this broken/slow/empty/silent"
  - A pipeline, hook, watcher, cron, or n8n workflow produced wrong output, no output,
    or a suspiciously green result
  - A number two systems should agree on does not tie
  - You catch yourself forming a theory from reading code before you can name one
    command that goes red on the bug
---

# Diagnose, the loop is the skill

> Adapted 2026-08-20 from Matt Pocock's `diagnosing-bugs` skill, merged with this vault's
> own debugging learnings. Everything after Phase 1 is mechanical.

Skip phases only when you say why out loud.

## Redact

You will show commands and outputs. Redact every secret first: `<REDACTED>` in its place,
credentials read from env vars inside scripts, never inline (security.md rule 1). Quote
only the lines that carry the signal.

## Phase 1: Build a feedback loop

**This is the skill.** If you have a **tight** pass/fail signal that goes **red** on THIS
bug, you will find the cause. If you do not, no amount of staring at code will save you.
Jumping straight to a hypothesis is the exact failure this skill prevents.

Ways to construct one, roughly in order: a failing test at the seam that reaches the bug;
a curl/HTTP script against the live service; a CLI invocation diffing stdout against a
known-good snapshot; replaying a captured payload through the code path in isolation; a
throwaway harness that exercises the path with one function call; a 1000-input fuzz loop
for "sometimes wrong"; a `git bisect run` harness when it appeared between two known
states; a differential loop (old vs new, config A vs B).

**The n8n exception.** Agents never test n8n workflows and never fire Apify nodes
(n8n-rules 2-3). Your loop for n8n stops at the schema level: pull the LIVE workflow via
API, assert on structure, connections, and execution records. The red-to-green run of the
actual workflow is the operator's (or the flow owner's); script THEIR steps so the loop stays
structured, and read the execution table knowing it is a retention window, not a history.

**Tighten it.** Faster (skip unrelated init), sharper (assert the specific symptom, not
"didn't crash"), deterministic (pin time, seed RNG, freeze network). A 2-second
deterministic loop is a superpower; a 30-second flaky one is barely a loop.
Non-deterministic bugs: raise the reproduction rate until it is debuggable (loop the
trigger 100x, add stress, narrow timing windows). You need a high rate, not a clean repro.

**Loop traps this vault has already paid for** (check your loop against each):

- **A green check needs a positive control.** Prove the detector can go red by feeding it
  a known-bad input in the same run.
- **Rerun a pipeline stage with the pipeline's OWN inputs**, copied from the caller, not
  inputs you retyped.
- **A grep that returns zero may have searched nothing.** Use `/usr/bin/grep -r` or `rg`,
  never a bare repo-wide shell grep.
- **A diff between two absent values reports identical.** Prove both sides extracted
  before trusting a PASS.
- **`$(date)` before `$?` logs a constant 0.** Capture exit codes before any command
  substitution.
- **A failing check indicts the checker too.** Before believing red, confirm the checker
  itself is sound.

If you genuinely cannot build a loop: stop and say so, list what you tried, and ask for
the environment, a redacted captured artifact, or permission for temporary
instrumentation. Do NOT proceed to hypothesize without a loop.

**Phase 1 is done** when you can name ONE command you have already run once that is
red-capable (asserts the user's exact symptom), deterministic, seconds-fast, and
agent-runnable (or structured-the operator-runnable for n8n/UI).

## Phase 2: Reproduce + minimize

Run the loop; watch it go red on the failure the user described, not a nearby one. Wrong bug
= wrong fix. Then shrink to the smallest scenario that still goes red, cutting one
element at a time and re-running after each cut. Done when every remaining element is
load-bearing. The minimal repro shrinks Phase 3 and becomes the Phase 5 regression test.

## Phase 3: Hypothesize

Generate **3-5 ranked hypotheses** before testing any. One hypothesis = anchoring on the
first plausible idea. Each must be falsifiable: "If X is the cause, then changing Y makes
the bug disappear." No prediction = a vibe; sharpen or discard.

Show the ranked list to the operator before testing (don't block if he is AFK; proceed with your
ranking). He often re-ranks instantly. And before blaming the code, check the substrate:
a contradictory corpus makes a faithful agent look like a liar, and a signal that
pattern-matches a known failure may have a different cause.

## Phase 4: Instrument

Each probe maps to one Phase 3 prediction. Change one variable at a time. Prefer a
debugger/REPL breakpoint over ten logs; targeted logs at the boundaries that distinguish
hypotheses; never "log everything and grep". Tag every debug log with a unique prefix
(`[DEBUG-a4f2]`) so cleanup is one grep. Performance bugs: measure a baseline first,
then bisect; logs are usually the wrong tool.

## Phase 5: Fix + regression test + class sweep

Write the regression test BEFORE the fix, at a seam that exercises the real bug pattern.
If no correct seam exists, that absence is itself a finding; document it. Then: watch it
fail, apply the fix, watch it pass, re-run the Phase 1 loop against the original
un-minimized scenario.

Then **fix the class, not the instance** ( +
`sop_code_trap_class_sweep`): sweep the codebase for the same trap pattern and fix every
site, not the one that happened to fire.

## Phase 6: Cleanup + capture

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or the missing seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed (grep the prefix)
- [ ] Throwaway harnesses deleted
- [ ] The winning hypothesis stated in the commit message
- [ ] **Root cause captured to the vault** per learning-capture.md, same or next turn.
      A traced non-trivial bug is a mandatory capture trigger; the distill is the asset.

## Checkpoint, resume across a context reset

A long investigation that survives a compaction or reset should not re-rank
hypotheses from zero; ruling-out is the expensive part of debugging and it is
worth persisting like any other work product.

For any investigation that runs past one Phase 3 pass, write
`.diagnose-state/<slug>.md` (repo-root, gitignored, one file per investigation,
`<slug>` = a short kebab-case name for the bug) after every phase transition:

```markdown
# <symptom, one line>

## Loop (Phase 1)
<the exact red-capable command>

## Hypotheses (Phase 3), ranked
1. <hypothesis>, RULED OUT: <what probe disproved it>
2. <hypothesis>, CONFIRMED: <evidence>
3. <hypothesis>, UNTESTED

## Current phase
<Phase N, one line on what's next>
```

On `continue` (or any resumed session on the same bug): read this file BEFORE
forming any new hypothesis. Re-run the Phase 1 loop to confirm the bug still
reproduces the same way, then pick up at the recorded phase, do not re-rank
what is already marked RULED OUT or CONFIRMED without new evidence. Delete the
file at Phase 6 cleanup once the fix lands; a stale checkpoint for a closed bug
is worse than none.
