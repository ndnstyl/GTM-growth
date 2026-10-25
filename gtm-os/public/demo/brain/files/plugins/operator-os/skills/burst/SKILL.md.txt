---
name: burst
description: |
  Generate genuinely distinct variations of a piece of copy, not five reworded restatements
  of the same idea. Use when the operator asks for variations, options, versions, or alternates of
  copy, subject lines, hooks, ads, names, or concepts.

  TRIGGERS - Use this skill when:
  - The operator says "give me 5 versions", "burst this", "give me some options for X"
  - Subject lines, hooks, ad copy, names, taglines, or headline variants are requested
  - A single draft exists and the operator wants alternates to choose between

  Do NOT use for: a single best draft (just write it), or long-form content that needs one
  coherent pass (that is a voice or content-write skill, not burst).
---

# Burst - real variation, not restatement

> Mechanics adapted from RoboNuggets' `robo-skills` "burst" pattern (CC BY 4.0), rewritten
> in this harness's voice and folded into the existing gates (voice, unslop).

The failure mode this skill exists to prevent: five "variations" that are the same sentence
with synonyms swapped. That is not five options, it is one option typed five times. Burst
forces the axes to actually move.

## The mechanic

1. **Lock the seed.** Identify the one message that must survive in every variant: the
   offer, the fact, the ask. This does not change across variants. Only the wrapper does.

2. **Move 2-3 of these four axes per variant, never all four and never zero:**
   - **Design** - format, length, structure of presentation (a list vs. a single line vs.
     a question)
   - **Voice** - register, energy, formality (direct vs. warm vs. urgent)
   - **Structure** - what comes first, what's implied vs. stated, sentence shape
   - **Angle** - which benefit, fear, or curiosity hook leads

3. **Self-check before you show them:** if two variants could swap labels and nobody would
   notice, regenerate one of them. Name each variant in three distinct words that capture
   what makes it different (e.g. "Direct / Short / Urgency" vs. "Warm / Question / Curiosity").
   If you can't produce three distinct words, the variants aren't distinct.

4. **Label every variant** with its name from step 3, then show the copy.

5. **End with a pick.** Recommend one variant and give a one-line reason. The operator can override,
   but never hand back an unranked list, that pushes the judgment call back to them for free.

## Before a long or costly batch

Flag it first. If the ask implies more than ~8 variants, or the variants require paid
generation (image/video), or a research pass per variant, say what it will cost (time or
money) and get a go before starting.

## Voice gates still apply

Anything headed for a published surface goes through the normal gates: your voice skill for
any draft over 300 words, no em dashes ever, US spelling. Burst produces the raw variants;
it does not skip the voice pass on whichever one ships.

## Output shape

```
**Direct / Short / Urgency**
<copy>

**Warm / Question / Curiosity**
<copy>

**...**

PICK: <variant name> - <one-line reason>
```
