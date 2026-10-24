---
name: handoff
description: |
  Hand off any step that touches raw T0/T1 sensitive data (PII, lead files, call
  transcripts, margins, credentials, prompt-agent IP, pre-contract material) to the
  on-device local LLM (an OpenAI-compatible server you run, zero egress) so the sensitive bytes never
  enter Claude's cloud context. Claude keeps the ideation, planning, schema design, and
  synthesis of sanitized results; the local lane does the raw-data execution and returns
  only aggregate/sanitized output. Enforces the two-tier governance architecture and the
  .local-only wall.
triggers:
  - "/handoff"
  - "hand this off to local"
  - "run this locally"
  - "this is sensitive / PII / crown-jewel"
  - "process without sending to the cloud"
  - "keep this on-device"
  - reading or processing anything under .local-only/
---

# handoff, route sensitive execution to the on-device local lane

## When to use (default toward YES when unsure)
Any step whose INPUT or OUTPUT is raw T0/T1: consumer PII, lead files, call
recordings/transcripts, margin/pricing models, live credentials, the prompt/agent
architecture, or anything pre-contract that must not exist off-device. Also any file under
`.local-only/` in the project (Claude is hard-blocked from reading it directly).

If it is T2/T3 (drafts, public copy, structure, non-identifying aggregates), do NOT hand
off, Claude handles it directly. When the tier is ambiguous, treat as T1 and hand off.

## The division of labor
- **Claude (cloud)** does the heavy lifting that is NOT raw sensitive data: ideate,
  decompose, design the schema, and write the exact instruction the local model runs, then
  reason over the sanitized/aggregate result.
- **Local lane (your on-device model)** opens the raw payload, executes, and writes the full result
  on-device. Claude never sees the raw bytes.

## Prerequisite
The local lane is not configured until you point it at a model: set `OPERATOR_LOCAL_LLM_URL` and
`OPERATOR_LOCAL_LLM_MODEL` (see `scripts/local-ask.sh`). Unset, the script prints "not configured" and
exits 3; in that case tell the user the step cannot run and do NOT read the data yourself.

## Procedure
1. **Stage the data.** Ensure the sensitive file lives under `.local-only/` in the project. If it
   is elsewhere, `mv` it in (moving in is allowed; reading it out is blocked).
2. **Write the instruction.** Compose the precise task/schema for the local model, this is
   Claude's real work. Keep it in a normal (non-sensitive) file or inline.
3. **Invoke the local lane** (this command is exempt from the wall):
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/scripts/local-ask.sh -f .local-only/<input> "<the instruction>" --out .local-only/<result>
   ```
   Add `--summary` to also get a best-effort, PII-stripped digest back:
   ```bash
   ${CLAUDE_PLUGIN_ROOT}/scripts/local-ask.sh -f .local-only/<input> "<instruction>" --out .local-only/<result> --summary
   ```
4. **Consume only the sanitized return.** With `--out`, Claude receives only a mechanical
   confirmation (path, line/byte counts) and, with `--summary`, a non-identifying digest.
   The full result stays in `.local-only/` for the next on-device step or the sending system.
5. **Continue the heavy lifting** on the aggregate: draft templates, design the next step,
   synthesize. If a later step needs the raw result again, hand off again, do not pull it
   into cloud context.

## Guardrails
- Never `cat`/`Read`/`grep` a `.local-only` file to "just check it", the hook will block
  it, and that is the point. Ask the local lane to check it and report back sanitized.
- `--summary` is best-effort, not a guarantee. For the most sensitive T0, skip `--summary`
  and keep everything on-device; consume only counts/pass-fail.
- This is not an air-gap. It walls off the obvious leak paths and makes the secure lane the
  path of least resistance. Write down your own on-machine governance charter.
