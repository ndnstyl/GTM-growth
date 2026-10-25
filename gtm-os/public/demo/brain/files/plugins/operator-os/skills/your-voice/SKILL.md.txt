---
name: your-voice
description: |
  A method for making AI drafts sound like YOU, built from your own writing. Ships no one's corpus: you bring 20 to 50 real samples per register, the skill measures a fingerprint from them, rewrites drafts against it, strips AI tells, and scores the result. Use when the operator says "make this sound like me", "humanize this", "rewrite in my voice", when any draft over 300 words will go out under their name, or when scoring a draft against their voice fingerprint.
  Sub-commands: setup | humanize | fingerprint
---

# Your Voice: voice transfer from your own corpus

Nobody's voice ships with this skill. The method does: collect real samples, measure what is actually distinctive about them, write against the measurements rather than a vibe, remove the tells a language model leaves, and score the result. A "voice" described in adjectives ("direct, warm, concise") is the one thing a model already thinks it has; measured numbers are what actually move a draft.

## Step zero: pick the register before you write a word

One person writes differently in a customer email, an internal memo, a long-form post and a talk. A single "voice" applied to all of them is how a draft gets rejected with "this doesn't sound like me". Keep one register file per surface under `registers/` (start from `registers/template.md`) and one corpus folder per register. State the register at the top of every drafting task.

## Setup (once per register)

1. Collect 20 to 50 samples of your real writing in that register into a folder you own, for example `your-voice/corpus/<register>/`. Sent mail and published posts are the best sources. Do NOT put anyone else's private writing, customer data or privileged material in it; the corpus is T1 under the data-handling rule.
2. Run `python3 "${CLAUDE_PLUGIN_ROOT}/skills/your-voice/scripts/fingerprint.py" --corpus <folder>` to measure your baseline: sentence-length distribution, share of short sentences, share of one-sentence blocks, first-person rate, contraction rate, em-dash rate, and your most frequent sentence openers.
3. Fill in `registers/<name>.md` from the template: the measured numbers, three real openings, three real sign-offs, and the anti-patterns you reject on sight.
4. Read the "corrections" habit below and set up a place for it.

## humanize (every draft that goes out under your name)

1. **Mechanical pass.** The plugin's unslop banlist (`${CLAUDE_PLUGIN_ROOT}/hooks/unslop-banlist.json`, overridable per project) catches the zero-tolerance patterns. Run it first; the unslop stop gate does the same on chat replies.
2. **Voice transfer in a fresh context.** Start a NEW model call, not a continuation of the drafting conversation, with: the register file, 3 to 5 corpus samples from the same register and the same kind of recipient, the unslop patterns and soul checklist (`unslop.md`), then the draft. Instruct it that the content is correct and the voice is wrong, and to restructure freely. Prompt it for output only, no preamble. Use a high temperature: clichés live at low temperature.
3. **Mechanical pass again.** Same banlist.
4. **Self-audit.** Ask one question out loud: "What makes this obviously AI generated?" Fix what you find, especially the judgment patterns no regex catches.
5. **Score.** Run `fingerprint.py --text <draft> --against <register fingerprint json>`. A draft that is far from your measured sentence rhythm fails with the metric named. Retry with explicit feedback ("the previous version scored low on one-sentence blocks; fix that") at most twice, then return the best attempt and say which metric still misses.

## fingerprint

`scripts/fingerprint.py` is deterministic and has no model call. It measures a corpus or a draft and compares a draft with a saved baseline. It reports numbers and which ones are out of band; it does not decide taste.

## The corrections habit (the highest-signal data you will ever have)

Every time you EDIT an agent's draft before sending, the difference between the draft and what you sent is a free lesson. Save the pair under `your-voice/corpus/corrections/` (draft, final). Read the last ten before drafting anything for the same recipient. A draft you send unchanged is a weak signal; a draft you rewrote heavily is a strong one. Do not train on unedited agent drafts, or you teach the skill its own voice.

## Hard rules

- Never invent a quote or a personal anecdote. Voice is how you say true things, not permission to make them up.
- No claims the business has not approved. Voice transfer changes how a sentence sounds, never what it promises.
- Quoted or reproduced text is exempt from the rewrite. Never rewrite a quote.
- Customer data stays out of the corpus and out of the fresh-context prompt.
