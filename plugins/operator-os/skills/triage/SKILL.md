---
name: triage
description: >
  Classify any task handed to the operator against their purview and north star, and
  return a verdict (CORE / SERVE-AND-HANDOFF / DECLINE) plus the move. Protects
  their focus so colleague-handed work does not quietly become theirs to own.
  TRIGGERS - Use this skill when: a colleague or vendor hands the operator a task or
  request; the operator says "/triage", "is this mine?", "should I do this?", "am I in the
  weeds?"; OR before the operator commits to any task they did not initiate themselves.
  Also run it silently in the background: whenever a request arrives that is not obviously
  CORE, name the verdict before executing.
---

# /triage, the purview gate

The source of truth for the operator's north star and purview is a short note in the vault,
`north-star.md` (create it once; this skill reads it). If the note does not exist, print
"triage not configured: write north-star.md with a north star, an IN list and an OUT list"
and ask the operator for those three things before classifying.

## The north star (what everything is measured against)
One measurable outcome the operator is accountable for, written in `north-star.md`
(for example: "cut cost per qualified lead by 20%" or "ship the onboarding rebuild by Q3").
A task matters to the degree it moves that number or builds the engine that does.

## Purview
- **IN (theirs to own):** the areas listed under IN in `north-star.md`.
- **OUT (not theirs to own):** the areas listed under OUT (other departments, other leads,
  legal adjudication).

## The classification (run these in order)
1. **Does it move the north star, plug a leak in the path to it, or build the engine that does?**
   → **CORE.** Do it. Say in one line how it serves the number.
2. **Is it another team's job?** → **SERVE-AND-HANDOFF.** Build the artifact ONCE, hand it
   to the owner, take no ongoing ownership. Or decline.
3. **Neither?** → **DECLINE / redirect** to the rightful owner.

Bias: when a task is genuinely ambiguous, default to SERVE-AND-HANDOFF over CORE. The
failure mode this skill exists to prevent is silently absorbing other people's jobs.

## Output format (always return this)
```
TASK: <one line restating the ask>
VERDICT: CORE | SERVE-AND-HANDOFF | DECLINE
NORTH-STAR LINK: <does it move the number or plug a leak? one line>
OWNER (if not the operator): <team / person who actually owns it>
MOVE:
  - CORE → do it; note the one metric it advances.
  - SERVE-AND-HANDOFF → the single artifact to build, then a 2-3 line handoff note
    to the owner (in the operator's voice, matching comms scope, no over-reach).
  - DECLINE → a short, warm redirect to the owner, keeping the relationship while
    returning the work to its lane.
```

## Rules
- Keep it decisive and short. A verdict, a reason, a move. No hedging.
- Honour the operator's voice and scope rules on any drafted reply: no new questions
  injected, no future workstreams bolted on.
- "Willing to help" is real, but help ≠ ownership. A SERVE-AND-HANDOFF verdict means
  the artifact ships once and the owner carries it from there.
- If the task touches automated consumer contact, the `opsec` agent's gate still applies on top of
  this verdict.
