# Prompt Engineering Rules

## Mandatory Structure: CTCO Protocol

Every prompt to a subagent or tool MUST include these 4 elements:

1. **CONTEXT** (2-3 sentences): What the agent needs to know. File paths, prior findings, constraints.
2. **TASK** (one action verb + target): "Fix the error in X" not "look into X"
3. **CONSTRAINTS** (max 3): What NOT to do. Boundaries.
4. **OUTPUT** (format + length): What to return. "Return JSON with fields X, Y" or "Return under 200 words"

## Model + Thinking Tier Routing

Principle: **plan once on a strong model, execute on cheap models, check with a strong model by
sampling.** Work that is already planned (a spec, a task list, a written handoff) runs on haiku or
sonnet; the adversarial seats run on opus at high and send defects back down. Most spend goes to
whichever model does the execution, so keep execution off the expensive tier.

Rules:
- **Thinking ceilings live in agent definitions, not in prompts.** Each agent in `agents/`
  pins its model + effort. Aliases only (`haiku`, `sonnet`, `opus`), never a dated model id, so a
  new release is picked up without an edit.
- **Built-in agents (general-purpose, Explore, Plan) default to sonnet** via
  `CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.json`. Forks still inherit the session model, so
  fork only when the parent's context is truly needed.
- **Main loop runs at `effortLevel: medium`.** Raise it with `/effort high` for a planning or
  synthesis session; the main loop delegates execution instead of doing it.
- **The most expensive model tier is opt-in per session, never the default.**
- Never write "think hard"/"ultrathink" into prompts aimed at haiku or sonnet agents.

| Tier | Agents | Effort | Use for | Never for |
|------|--------|--------|---------|-----------|
| haiku | researcher | low | lookup, run a planned command, mechanical git/build | judgment, design |
| sonnet | implementer, corpus-pruner, built-ins | medium | building to a written plan | architecture decisions |
| opus | orchestrator, ui-ux-engineer, web-designer, main loop | medium | decomposition, planning, synthesis | doing the build itself |
| opus | reviewer, opsec, corpus-pruner-sr | high | adversarial checks, spot-check and send back | copy tweaks |

Skills run in the main loop and inherit the session tier; a skill never raises
the thinking level. Skills that spawn subagents (adversarial review, deep-research, viz
loops) inherit each agent's pinned tier automatically.

### Haiku (researcher), max 200 words
- Short, direct prompts. No examples needed.
- One task per prompt. No multi-step instructions.
- Explicit output format required (Haiku guesses poorly).

### Sonnet (builders), max 500 words
- Include one example of expected output.
- Specify constraints clearly (Sonnet follows them well).
- Can handle 2-3 sequential steps in one prompt.

### Opus (planners, checkers), max 1000 words
- Can handle complex multi-step reasoning.
- Include edge cases and decision criteria.
- Checkers sample and spot-check, then send defects back to the builder seat; they do not redo the build.
- `max` effort is per-delegation only, for auth, payments, consent, migrations or a platform write, with a one-line reason.

## Core Patterns

### Role-Task-Format (RTF)
```
You are a [ROLE] with expertise in [DOMAIN].
Your task is to [SPECIFIC TASK].
Output in [FORMAT]: [specifications]
```

### Few-Shot (for consistent formatting)
Provide 2-3 input/output examples BEFORE the actual task.
Critical when output format matters (JSON, tables, structured data).

### Chain-of-Thought (for complex reasoning)
"Solve step by step: 1. Identify the issue 2. List relevant facts 3. Apply reasoning 4. Conclude"
Improves accuracy 20-40% on complex tasks.

### Constraint-First (for safety)
List DO/DON'T rules BEFORE the task. Models follow constraints better when they appear early.

## Anti-Patterns (NEVER)

1. **Vague delegation**: "look into this" → "Find all TypeScript errors in src/pages/classroom.tsx"
2. **Context dumping**: Pasting full file contents → Point to file path, let agent read
3. **Multi-task prompts**: "do X and Y and Z" → One task per agent invocation
4. **Missing output spec**: Letting agent decide format → "Return: file path, diff, test results"
5. **Negative framing**: "Don't mention X" → "Focus exclusively on Y" (negative framing backfires)
6. **Over-prompting Haiku**: Sending 500+ words to Haiku → Keep under 200 words

## Token Efficiency

- System prompts >2,000 tokens cause instruction-following degradation
- After 20+ turns, restate critical instructions (context degradation)
- Break long tasks into independent sub-tasks with fresh context
- Redirect verbose output to files, grep for results (never flood context)
