---
name: skill-token-audit
description: "Read-only audit of every SKILL.md's estimated token footprint. Walks .claude/skills/*/SKILL.md, estimates tokens (bytes/4, cross-checked with wc -w), and flags any over a threshold (default 2000) per prompt-engineering.md's degradation line. Report only, never gates or disables a skill."
---

# /skill-token-audit, SKILL.md size report

## When to invoke

- The operator says `/skill-token-audit` or asks "how big are the skills"
- After a batch of skill edits/imports (e.g. a GSD-core evaluation pass)
- Before a session-start context-budget review

## Why this exists

`.claude/rules/prompt-engineering.md` states: "System prompts >2,000 tokens
cause instruction-following degradation." That rule is unenforceable without a
number to check it against. This skill supplies the number, nothing else.

## What it is NOT

This is a **report only**. It never disables, deprioritizes, or gates a skill
based on size or usage. That mechanic was explicitly rejected (Observation 8,
`.claude/skill-observations/log.md`) as contradicting, skills are passive, context-triggered
capability files, not usage-metered assets. Size is a hygiene signal for a
human edit decision, never an automated trigger.

## How to run

```bash
for f in ${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md; do
  bytes=$(wc -c < "$f")
  words=$(wc -w < "$f")
  lines=$(wc -l < "$f")
  # rough estimate: bytes/4 (chars-per-token heuristic); wc -w noted as a second proxy
  est_tokens=$(( bytes / 4 ))
  printf "%-55s lines=%-5d words=%-5d est_tokens(bytes/4)=%-6d\n" "$f" "$lines" "$words" "$est_tokens"
done
```

Both `bytes/4` and `wc -w` are **estimates**, not a real tokenizer count, report
them as such, never as exact.

## Threshold

Default: **2000 estimated tokens** (the `prompt-engineering.md` line above).
Flag any SKILL.md at or over it. A skill can override the threshold by asking
for a different number in the invocation (e.g. "flag anything over 1500").

## Output format

```
## Skill token audit, YYYY-MM-DD

| Skill | Lines | Words | Est. tokens (bytes/4) | Flag |
|---|---|---|---|---|
| diagnose | 156 | 1180 | 1340 | |
| lint | 101 | 780 | 900 | |
| some-big-skill | 410 | 3200 | 3650 | OVER 2000 |

N of 47 skills over threshold. Estimates only, bytes/4 heuristic, not a real
tokenizer. This is a report; no skill was modified, disabled, or reprioritized.
```

## Constraints

- NEVER edit, split, trim, or disable a skill as part of this run, that is a
  separate, human-approved editing task
- NEVER claim exact token counts, always label figures as estimates
- NEVER treat "over threshold" as a verdict on the skill's value, a dense,
  frequently-used skill earns its size; this only surfaces the number
- Always report the total skill count and how many cleared the threshold, even
  if zero

## Anti-patterns

- Building any auto-disable, auto-archive, or usage-gating logic on top of
  this data (explicitly out of scope, see Observation 8)
- Reporting a single repo-wide average instead of per-skill numbers (hides
  which specific file needs attention)
- Treating the byte/4 estimate as authoritative when a real tokenizer is
  available and cheap to run instead
