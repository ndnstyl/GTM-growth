---
name: writing-for-agents
description: |
  Craft reference for writing any document an agent consumes: skills, .claude/rules/*,
  agent definitions, CLAUDE.md, MEMORY.md index lines, hook-adjacent docs. Covers context
  pointers, the two loads, information hierarchy, completion criteria, leading words,
  and pruning (no-ops, sediment, caches).

  TRIGGERS - Use this skill when:
  - Creating or editing any SKILL.md, rule file, agent definition, or CLAUDE.md section
  - Writing or rewording a MEMORY.md index line or a vault note's description
  - A skill/rule exists but agents keep missing it (a pointer-wording bug)
  - Deciding whether new guidance belongs in a rule, a skill, a hook, or the vault

  Pairs with skill-creator (packaging/structure); this file is the writing craft itself.
---

# Writing for agents

> Adapted 2026-08-20 from Matt Pocock's `writing-for-agents` skill, mapped onto this
> harness's actual mechanisms. The packaging differs across document types; the writing
> does not. The goal is a predictable PROCESS every run, not identical output.

## Rule zero, this harness's own: Hooks > Instructions

Anything that MUST happen goes in a hook, not in prose. A sentence in a rule file is an
advisory rule; the model reads it with ~80% recall and no error signal.
Before writing a paragraph of guidance, ask: is this a behavior guarantee? Then it is a
hook (with all three enforcement layers), and the document's job shrinks to explaining
why the hook exists. Write prose only for judgment, never for guarantees.

## Context pointers

A **context pointer** is a line held in context that names out-of-context material and
encodes the condition for reaching it. A skill's `description:` is one. A MEMORY.md index
line is one. A CLAUDE.md `@rule` reference is one. **The pointer's wording, not its
target, decides whether the agent ever reaches the material.** A must-have target behind
a weakly worded pointer is a variance bug: sharpen the wording first; inline the material
only if sharpening fails.

A pointer does two jobs: say what the material is, and list the **branches** that trigger
reaching it. Every word of an always-loaded pointer costs on every turn, so:

- Front-load the leading word; the pointer is where it does its triggering work.
- One trigger per branch. Synonyms renaming the same branch are one branch written twice.
- Cut identity the body already carries.

This is exactly the MEMORY.md discipline already in force: one line per note, hook under
60 chars, detail in the note never the index, 24,400-byte budget. That budget is the
context-load budget made literal.

## The two loads

Every document spends one of two budgets:

- **Context load**: always-loaded material (CLAUDE.md, auto-loaded rules, skill
  descriptions, MEMORY.md) taxing every turn whether or not it fires.
- **Cognitive load**: what the operator must remember exists. Not a cost to zero out; it is the
  price of human agency. Spend it where the user's judgment matters, remove it where it does not.

Material behind a pointer escapes context load at the price of the pointer's line.
Material with no pointer rides entirely on cognitive load. When adding to CLAUDE.md or a
rule file, you are spending the scarcest budget in the harness; prefer a vault note plus
an index line, or a skill reached on trigger.

## Information hierarchy

Two content types: **steps** (ordered actions) and **reference** (rules and facts
consulted on demand). The core decision is where each piece sits:

1. **In-file step**: what the agent does, in order.
2. **In-file reference**: consulted on demand; a flat peer-set of rules is fine here.
3. **Disclosed reference**: a sibling file behind a pointer, loaded only when it fires
   (a register file per surface plus an unslop pattern list is the house pattern).

**Progressive disclosure** is the move down this ladder so the top stays legible. The
cleanest test is branching: inline what every branch needs; push behind a pointer what
only some branches reach. Reference that should be disclosed but sits in-file buries the
steps and turns attending to them into a coin flip.

**Co-location**: keep a concept's definition, rules, and caveats under one heading. The
test: does it read like documentation written FOR the agent? Scattering fragments one
meaning across many places; that is different from duplication, which repeats it.

## Steps and completion criteria

Every step ends on a **completion criterion**. Two properties make it a lever:

- **Clarity**: can the agent tell done from not-done? "Understanding reached" invites
  premature completion; "every modified file accounted for" does not. Sharpen the bound
  before restructuring anything.
- **Demand**: how much the wording requires. "Every rule applied" binds a flat reference
  set to an exhaustiveness bar the same way "every step done" binds a sequence.

The house standard already encodes this: a checkable receipt, never a claim. Write criteria an agent can verify with a
command, and prefer scalar metrics over vibes (constitution principle 3).

## Leading words

A **leading word** is a compact concept the model already holds from pretraining, repeated
as a token so it anchors behavior cheaply: a *tight* loop, the loop goes *red*, the
*frontier* of a question tree, a *register*, a *donor* workflow. In a body it anchors
execution; in a pointer it anchors invocation, especially when the same word lives in the
prompts, the docs, and the code. Hunt for passages spelling out in a sentence what one
pretrained word buys free ("fast, deterministic, low-overhead" is just *tight*). A coined
word recruits no priors; reach for an existing one first.

**Negation is the failure mode beside this lever.** A ban drags the forbidden thing into
context and makes it MORE available (prompt-engineering.md anti-pattern 5). State the
positive target; keep a prohibition only as a hard guardrail you cannot phrase positively,
and even then pair it with the positive. And remember what a ban is worth here: a prompt
ban reduces an output gate's guarantees to advisory; zero-tolerance means a hook.

## Pruning

- **Single source of truth.** One authoritative place per meaning; the vault's
  supersession rule is this. Duplication costs
  maintenance and inflates a meaning's rank.
- **The environment is a source of truth too.** A doc line restating what `--help`, a
  config file, or the directory layout already says is a **cache**, and caches go stale.
  Cache only what the agent cannot find by looking: the unwritten convention, the reason
  behind a choice, the gotcha no config confesses. (This harness has paid for stale
  caches: CLAUDE.md claiming a venv that was never provisioned needed a ⚠ correction.)
- **Relevance check, line by line.** The default fate of unmaintained agent docs is
  **sediment**: stale layers that settle because adding feels safe and removing feels
  risky. Shorter documents stay relevant longer.
- **Hunt no-ops.** A sentence the model already obeys by default pays load to say
  nothing. The test is behavioral, not aesthetic: does it change behavior versus the
  default? Settle disagreements by running the document, not debating it. Delete the
  whole failing sentence. A weak leading word (*be thorough*) is a no-op; the fix is a
  stronger word (*relentless*), not more sentences.

## Where each thing lives in THIS harness

| You are writing... | It belongs in... |
|---|---|
| A behavior guarantee | A hook (all three layers), doc explains why |
| Judgment guidance with a trigger | A skill; trigger branches in the description |
| Always-relevant judgment guidance | `.claude/rules/` (pay the context load knowingly) |
| A fact, decision, or trap learned once | Vault note + one MEMORY.md pointer line |
| A repeatable human procedure | A written SOP, git as truth |
| Subagent behavior | The agent definition (model + effort pinned there) |
